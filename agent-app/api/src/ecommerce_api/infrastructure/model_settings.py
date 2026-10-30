"""Atomic local settings storage; Windows credentials are bound to the current user."""

import base64
import ctypes
import json
import os
import tempfile
from pathlib import Path


def _protect(data: bytes, decrypt: bool = False) -> bytes:
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]

    buffer = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    source = Blob(len(data), buffer)
    target = Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    name = "CryptUnprotectData" if decrypt else "CryptProtectData"
    operation = getattr(crypt, name)
    operation.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                          ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    operation.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    if not operation(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise OSError("Cannot access Windows-protected model settings")
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        kernel.LocalFree(target.data)


class ModelSettingsStore:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> dict[str, str]:
        if not self.path.exists():
            return {}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if payload["encoding"] == "windows-dpapi":
                if os.name != "nt":
                    raise ValueError("Windows account required")
                values = json.loads(_protect(base64.b64decode(payload["data"]), decrypt=True))
            elif payload["encoding"] == "private-file":
                values = payload["data"]
            else:
                raise ValueError("Unknown settings format")
            if not isinstance(values, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in values.items()):
                raise ValueError("Invalid settings")
            return values
        except (ValueError, KeyError, TypeError, OSError) as exc:
            raise OSError("Cannot read saved model settings; restore the file using the original OS account") from exc

    def save(self, values: dict[str, str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": 1, "encoding": "private-file", "data": values}
        if os.name == "nt":
            encrypted = _protect(json.dumps(values, ensure_ascii=False).encode("utf-8"))
            payload.update(encoding="windows-dpapi", data=base64.b64encode(encrypted).decode("ascii"))
        fd, temporary = tempfile.mkstemp(prefix=".model-settings-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(payload, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            Path(temporary).unlink(missing_ok=True)
