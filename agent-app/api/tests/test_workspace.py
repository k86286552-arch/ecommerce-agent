"""Persistence, immutable regeneration, recovery and safe asset export contracts."""
import copy
import io
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from ecommerce_api import main as server
from ecommerce_api.infrastructure.model_settings import ModelSettingsStore
from ecommerce_agent.agents.video_generation import VideoGenerationAgent
from ecommerce_agent.agents.image_generation import ImageGenerationAgent


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.environment = patch.dict(os.environ, {
            "MODEL_BACKEND": "mock", "IMAGE_BACKEND": "mock", "VIDEO_BACKEND": "mock",
            "MEDIA_OUTPUT_DIR": self.temp.name, "TASK_DB_PATH": str(self.root / "tasks.db"),
            "MODEL_SETTINGS_PATH": str(self.root / "model-settings.json"),
        })
        self.environment.start()
        self.reset()
        self.client = TestClient(server.app)
        self.client.__enter__()
        # Deterministic tests claim and execute queued work explicitly.
        server._task_worker.stop()

    def reset(self):
        server._settings = server._orchestrator = server._task_store = server._task_worker = None
        server._runtime_model_overrides.clear()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.reset()
        self.environment.stop()
        self.temp.cleanup()

    def saved_work(self):
        store = server.get_task_store()
        task = store.create("all", {"title": "保温杯", "platform": "taobao", "attributes": {"容量": "500ml"}})
        image = self.root / "image" / "original.png"
        video = self.root / "video" / "original.mp4"
        for path in (image, video):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(path.suffix.encode())
        result = {"optimized_title": "保温杯", "selling_points": ["便携"], "description": "保温杯详情",
                  "social_copy": "每天喝水", "seo_keywords": ["保温杯"], "platform": "taobao",
                  "quality_score": {}, "rewrite_reason": "", "rewrite_history": [],
                  "image": {"local_path": str(image), "image_prompt": "original image"},
                  "video": {"local_path": str(video), "video_prompt": "original video"}}
        store.succeed(task["id"], result)
        return store.get(task["id"])

    def test_settings_survive_restart_and_never_expose_credentials(self):
        settings = self.client.get("/settings/models").json()
        settings["text"].update(model="saved-model", api_key="private-test-credential")
        response = self.client.put("/settings/models", json=settings)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("private-test-credential", response.text)
        store = ModelSettingsStore(self.root / "model-settings.json")
        self.assertEqual(store.load()["API_KEY"], "private-test-credential")
        if os.name == "nt":
            self.assertNotIn("private-test-credential", store.path.read_text())
        self.reset()
        server.initialize_runtime()
        restored = self.client.get("/settings/models").json()
        self.assertEqual(restored["text"]["model"], "saved-model")
        self.assertTrue(restored["text"]["api_key_configured"])
        restored["text"]["model"] = "updated-model"
        restored["text"]["api_key"] = ""
        self.assertEqual(self.client.put("/settings/models", json=restored).status_code, 200)
        self.assertEqual(store.load()["API_KEY"], "private-test-credential")
        saved = store.path.read_bytes()
        restored["image"]["backend"] = "invalid"
        self.assertEqual(self.client.put("/settings/models", json=restored).status_code, 422)
        self.assertEqual(store.path.read_bytes(), saved)

    def test_failed_settings_write_rolls_back_runtime_and_file(self):
        before = self.client.get("/settings/models").json()
        changed = copy.deepcopy(before)
        changed["text"]["model"] = "should-not-apply"
        with patch.object(ModelSettingsStore, "save", side_effect=OSError("disk full")):
            response = self.client.put("/settings/models", json=changed)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.client.get("/settings/models").json(), before)

    def test_sync_modes_are_saved_and_history_restores_input(self):
        for route in ("/generate", "/generate/image"):
            with patch.object(ImageGenerationAgent, "run", return_value={"image_prompt": "test"}):
                response = self.client.post(route, json={"title": "保温杯", "attributes": {"容量": "500ml"}})
            self.assertEqual(response.status_code, 200)
            work = self.client.get(f"/tasks/{response.json()['task_id']}").json()
            self.assertEqual(work["status"], "succeeded")
            self.assertEqual(work["product"]["attributes"], {"容量": "500ml"})
            self.assertNotIn("_execution_snapshot", work["product"])
        first = self.client.get("/history?limit=1").json()
        second = self.client.get("/history?limit=1&offset=1").json()
        self.assertEqual(first["total"], 2)
        self.assertNotEqual(first["items"][0]["task_id"], second["items"][0]["task_id"])
        self.assertEqual(self.client.get("/history?limit=1000").status_code, 422)

    def test_single_regeneration_keeps_other_assets_and_original(self):
        source = self.saved_work()
        for kind in ("image", "video", "copy"):
            with self.subTest(kind=kind):
                accepted = self.client.post(f"/tasks/{source['id']}/regenerate", json={"kind": kind, "prompt": "new prompt"})
                self.assertEqual(accepted.status_code, 202)
                task = server.get_task_store().claim_next()
                fake = Mock()
                fake.image_agent.run.return_value = {"image_prompt": "new prompt"}
                fake.video_agent.run.return_value = {"video_prompt": "new prompt"}
                fake.generate.return_value.to_dict.return_value = {**source["result"], "optimized_title": "new title", "image": None, "video": None}
                with patch.object(server, "_build_orchestrator", return_value=fake):
                    result = server._execute_task(task)
                if kind == "copy":
                    fake.image_agent.run.assert_not_called()
                    fake.video_agent.run.assert_not_called()
                    self.assertEqual(result["image"], source["result"]["image"])
                    self.assertEqual(result["video"], source["result"]["video"])
                else:
                    fake.generate.assert_not_called()
                    other = "video" if kind == "image" else "image"
                    getattr(fake, f"{other}_agent").run.assert_not_called()
                    self.assertEqual(result[other], source["result"][other])
                    self.assertEqual(result["optimized_title"], source["result"]["optimized_title"])
                    self.assertEqual(getattr(fake, f"{kind}_agent").run.call_args.kwargs["custom_prompt"], "new prompt")
                server.get_task_store().succeed(task["id"], result)
                self.assertEqual(server.get_task_store().get(source["id"])["result"], source["result"])
                self.assertEqual(self.client.get(f"/tasks/{task['id']}").json()["parent_task_id"], source["id"])

    def test_media_failure_keeps_copy_and_image_for_video_retry(self):
        with patch.object(ImageGenerationAgent, "run", return_value={"image_prompt": "kept"}), patch.object(VideoGenerationAgent, "run", side_effect=RuntimeError("video offline")):
            response = self.client.post("/generate/all", json={"title": "保温杯"})
            task = server.get_task_store().claim_next()
            with self.assertRaisesRegex(RuntimeError, "video offline"):
                server._execute_task(task)
            server.get_task_store().fail(task["id"], {"message": "video offline"})
        failed = self.client.get(f"/tasks/{task['id']}").json()
        self.assertEqual(failed["result"]["image"]["image_prompt"], "kept")
        self.assertTrue(failed["result"]["optimized_title"])
        self.assertEqual(self.client.post(f"/tasks/{task['id']}/regenerate", json={"kind": "video"}).status_code, 202)

    def test_recovered_task_does_not_repeat_completed_media(self):
        source = self.saved_work()
        partial = copy.deepcopy(source["result"])
        partial.pop("video")
        task = server.get_task_store().create("all", source["request"], status="running")
        server.get_task_store().save_partial(task["id"], partial)
        task = server.get_task_store().get(task["id"])
        fake = Mock()
        fake.video_agent.run.return_value = {"video_prompt": "resumed"}
        with patch.object(server, "get_orchestrator", return_value=fake):
            result = server._execute_task(task)
        fake.generate.assert_not_called()
        fake.image_agent.run.assert_not_called()
        self.assertEqual(result["image"], partial["image"])

    def test_package_contains_actual_media_and_blocks_outside_files(self):
        task = self.saved_work()
        response = self.client.get(f"/tasks/{task['id']}/download")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response.headers["content-disposition"])
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(set(archive.namelist()), {"content-package.json", "product.json", "copy.txt", "image.png", "video.mp4"})
            self.assertEqual(archive.read("video.mp4"), b".mp4")
        outside = self.root / "private.txt"
        outside.write_text("not an asset")
        task["result"]["image"]["local_path"] = str(outside)
        task["result"]["video"]["local_path"] += ".placeholder"
        server.get_task_store().succeed(task["id"], task["result"])
        with zipfile.ZipFile(io.BytesIO(self.client.get(f"/tasks/{task['id']}/download").content)) as archive:
            self.assertEqual(len(archive.namelist()), 3)

    def test_showcase_preview_download_and_video_range(self):
        examples = self.client.get("/showcase").json()
        self.assertEqual(len(examples), 4)
        image = self.client.get(examples[0]["media_url"] + "?download=true")
        self.assertIn("image/", image.headers["content-type"])
        self.assertIn("attachment", image.headers["content-disposition"])
        video = next(item for item in examples if item["kind"] == "video")
        response = self.client.get(video["media_url"], headers={"Range": "bytes=0-99"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(len(response.content), 100)
        self.assertEqual(self.client.get("/showcase/.env").status_code, 404)


if __name__ == "__main__":
    unittest.main()
