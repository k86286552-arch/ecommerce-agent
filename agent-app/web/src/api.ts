/** Typed HTTP client and resumable polling for the local workspace. */
import type {FormData,Mode,ModelSettings,Result,Status,Task,HistoryItem,ShowcaseItem,RegenerateKind} from './types';
import {chineseError} from './chinese';

const base=(import.meta.env.VITE_API_BASE_URL||'/api').replace(/\/$/,'');
export const apiUrl=(path:string)=>`${base}${path}`;
export class ApiError extends Error {
  constructor(message:string,public status=0,public task?:Task){super(chineseError(message,status))}
}
async function request<T>(path:string,init?:RequestInit):Promise<T>{
  let response:Response;
  try{response=await fetch(apiUrl(path),init)}
  catch(error){if((error as Error).name==='AbortError')throw error;throw new ApiError('无法连接生成服务')}
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    const detail=body.detail;
    const message=chineseError(Array.isArray(detail)?detail:typeof detail==='string'?detail:detail?.message||`请求失败 (${response.status})`,detail?.upstream_status||response.status);
    throw new ApiError(message,response.status);
  }
  return body;
}
export const health=()=>request<{status:string}>('/health');
export const getModelSettings=()=>request<ModelSettings>('/settings/models');
export const saveModelSettings=(settings:ModelSettings)=>request<ModelSettings>('/settings/models',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
export const getTask=(id:string,signal?:AbortSignal)=>request<Task>(`/tasks/${encodeURIComponent(id)}`,{signal});
export const getHistory=(offset=0,signal?:AbortSignal)=>request<{items:HistoryItem[];total:number}>(`/history?limit=30&offset=${offset}`,{signal});
export const getShowcase=(signal?:AbortSignal)=>request<ShowcaseItem[]>('/showcase',{signal});
export const kitUrl=(id:string)=>apiUrl(`/tasks/${encodeURIComponent(id)}/download`);

function wait(ms:number,signal:AbortSignal){
  return new Promise<void>((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return}
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}
export async function pollTask(id:string,signal:AbortSignal,onStatus:(s:Status)=>void):Promise<Result>{
  const started=Date.now();
  let timeoutMs=900000;
  while(Date.now()-started<timeoutMs){
    const task=await getTask(id,signal);
    if(task.poll_timeout_seconds)timeoutMs=task.poll_timeout_seconds*1000;
    onStatus(task.status);
    if(task.status==='succeeded'&&task.result)return {...task.result,task_id:id};
    if(task.status==='failed')throw new ApiError(task.error?.message||'任务执行失败',0,task);
    await wait(900,signal);
  }
  onStatus('timeout');
  throw new ApiError('任务仍可能在后台运行，请从历史作品中继续查看。');
}
type Accepted={task_id:string};
export async function generate(mode:Mode,data:FormData,signal:AbortSignal,onStatus:(s:Status)=>void,onAccepted?:(id:string)=>void):Promise<Result>{
  const path=mode==='copy'?'/generate?background=true':mode==='image'?'/generate/image?background=true':'/generate/all';
  const accepted=await request<Result|Accepted>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
  if('optimized_title' in accepted)return accepted;
  onAccepted?.(accepted.task_id);
  onStatus('queued');
  return pollTask(accepted.task_id,signal,onStatus);
}
export async function regenerate(id:string,kind:RegenerateKind,prompt:string|undefined,signal:AbortSignal,onStatus:(s:Status)=>void,onAccepted:(id:string)=>void){
  const task=await request<Accepted>(`/tasks/${encodeURIComponent(id)}/regenerate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,prompt}),signal});
  onAccepted(task.task_id);
  onStatus('queued');
  return pollTask(task.task_id,signal,onStatus);
}
export function mediaUrl(path?:string|null){
  if(!path)return null;
  if(/^https?:|^data:|^blob:/.test(path))return path;
  return path.startsWith('/media')?`${base.replace(/\/api$/,'')}${path}`:apiUrl(path);
}
export const downloadUrl=(url:string)=>`${url}${url.includes('?')?'&':'?'}download=true`;
