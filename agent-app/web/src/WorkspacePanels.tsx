import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Download,FileText,History,Image as ImageIcon,LoaderCircle,Maximize2,RotateCcw,Video,X} from 'lucide-react';
import {downloadUrl,getHistory,getShowcase,mediaUrl} from './api';
import type {HistoryItem,Media,RegenerateKind,ShowcaseItem} from './types';
import type {Lang} from './i18n';
import {workspaceCopy} from './workspaceCopy';
import {chineseError,platformNames} from './chinese';

export type Preview={url:string;kind:'image'|'video';title:string};
export function Dialog({title,subtitle,closeLabel,onClose,children,wide=false}:{title:string;subtitle?:string;closeLabel:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const ref=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';ref.current?.focus();
    return()=>{document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus()};
  },[]);
  return <div className={`settings-overlay ${wide?'preview-overlay':''}`}>
    <button className="settings-backdrop" tabIndex={-1} aria-label={closeLabel} onClick={onClose}/>
    <section className={`settings-drawer ${wide?'preview-dialog':''}`} ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}
      if(event.key==='Tab'){
        const elements=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select,video[controls]')||[]);
        const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }
    }}>
      <header className="settings-header"><div><span>电商 / 创作空间</span><h2>{title}</h2></div><button className="icon-btn" aria-label={closeLabel} onClick={onClose}><X size={18}/></button></header>
      {subtitle&&<p className="settings-note">{subtitle}</p>}{children}
    </section>
  </div>;
}

export function MediaCard({kind,media,title,lang,onPreview,onRetry,disabled=false}:{kind:'image'|'video';media:Media;title?:string;lang:Lang;onPreview:(p:Preview)=>void;onRetry?:()=>void;disabled?:boolean}){
  const w=workspaceCopy[lang],url=mediaUrl(media.media_url),name=title||w[kind];
  const prompt=media.image_prompt||media.video_prompt||media.prompt;
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[url]);
  return <article className="media-item">
    {url&&!failed?(kind==='image'?<button className="media-preview" aria-label={`${w.preview} · ${name}`} onClick={()=>onPreview({url,kind,title:name})}><img src={url} alt={name} loading="lazy" onError={()=>setFailed(true)}/><span className="zoom-hint"><Maximize2 size={15}/></span></button>:<video src={url} controls playsInline preload="metadata" aria-label={name} onError={()=>setFailed(true)}/>):<div className="mock-media">{kind==='image'?<ImageIcon size={28}/>:<Video size={28}/>}<strong>{w.noPreview}</strong>{!failed&&<span>暂无可展示的素材文件</span>}</div>}
    <div className="media-caption"><b>{title||(kind==='image'?'图片提示词':'视频提示词')}</b>{prompt&&<p>{prompt}</p>}</div>
    <div className="asset-actions">
      {url&&<><button className="text-btn" onClick={()=>onPreview({url,kind,title:name})}><Maximize2 size={14}/>{kind==='image'?w.preview:w.previewVideo}</button><a className="text-btn" href={downloadUrl(url)} download><Download size={14}/>{w.download}</a></>}
      {onRetry&&<button className="text-btn" disabled={disabled} onClick={onRetry}><RotateCcw size={14}/>{w.regenerate}</button>}
    </div>
  </article>;
}

export function MediaPreview({value,lang,onClose}:{value:Preview;lang:Lang;onClose:()=>void}){
  const w=workspaceCopy[lang];
  return <Dialog title={value.title} closeLabel={w.close} onClose={onClose} wide><div className="preview-stage">{value.kind==='image'?<img src={value.url} alt={value.title}/>:<video src={value.url} controls playsInline preload="metadata" aria-label={value.title}/>}</div><footer className="settings-footer"><a className="text-btn" href={downloadUrl(value.url)} download><Download size={16}/>{w.download}</a></footer></Dialog>;
}

export function HistoryPanel({lang,onClose,onSelect,disabled}:{lang:Lang;onClose:()=>void;onSelect:(id:string)=>Promise<void>;disabled:boolean}){
  const w=workspaceCopy[lang];
  const [items,setItems]=useState<HistoryItem[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  const load=async(offset=0)=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort;setLoading(true);setError('');
    try{const page=await getHistory(offset,abort.signal);setItems(previous=>offset?[...previous,...page.items]:page.items);setTotal(page.total)}
    catch(e){if(!abort.signal.aborted)setError(chineseError(e))}finally{if(!abort.signal.aborted)setLoading(false)}
  };
  useEffect(()=>{void load();return()=>controller.current?.abort()},[]);
  return <Dialog title={w.history} subtitle={w.historyNote} closeLabel={w.close} onClose={onClose}>
    <div className="settings-content history-content"><div className="workspace-toolbar"><span>{total} 份作品</span><button className="text-btn" disabled={loading} onClick={()=>load()}><RotateCcw size={14}/>{w.refresh}</button></div>
      {error&&<p className="error" role="alert">{error}</p>}
      {!items.length&&!loading&&!error&&<div className="panel-empty"><History size={28}/><p>{w.emptyHistory}</p></div>}
      {items.map(item=><article className="history-card" key={item.task_id}>
        <div className="history-thumb">{item.thumbnail_url?<img src={mediaUrl(item.thumbnail_url)!} alt="" loading="lazy"/>:<FileText size={24}/>}</div>
        <div className="history-info"><h3>{item.title}</h3><div className="history-meta"><span>{platformNames[item.platform]||'其他平台'}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('zh-CN')}</time></div><div className="history-meta"><span className={`history-state ${item.status}`}>{w[item.status]}</span>{item.parent_task_id&&<span>{w.newVersion}</span>}{item.has_image&&<ImageIcon size={13}/ >}{item.has_video&&<Video size={13}/>}</div>
          <button className="text-btn" disabled={disabled||loading} onClick={async()=>{setError('');try{await onSelect(item.task_id);onClose()}catch(e){setError(chineseError(e))}}}>{item.status==='failed'&&!item.has_result?w.restore:w.open}</button>
        </div>
      </article>)}
      {loading&&<p className="panel-loading"><LoaderCircle className="spin" size={16}/>{w.loading}</p>}
      {items.length<total&&<button className="text-btn load-more" disabled={loading} onClick={()=>load(items.length)}>{w.loadMore}</button>}
    </div>
  </Dialog>;
}

export function ShowcasePanel({lang,onClose,onPreview}:{lang:Lang;onClose:()=>void;onPreview:(p:Preview)=>void}){
  const w=workspaceCopy[lang];
  const [items,setItems]=useState<ShowcaseItem[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');getShowcase(abort.signal).then(setItems).catch(e=>{if(!abort.signal.aborted)setError(chineseError(e))}).finally(()=>{if(!abort.signal.aborted)setLoading(false)});return()=>abort.abort()},[revision]);
  return <Dialog title={w.showcase} subtitle={w.showcaseNote} closeLabel={w.close} onClose={onClose}><div className="settings-content showcase-content">
    {loading&&<p className="panel-loading"><LoaderCircle className="spin" size={16}/>{w.loading}</p>}
    {error&&<><p className="error" role="alert">{error}</p><button className="text-btn" onClick={()=>setRevision(v=>v+1)}>{w.retry}</button></>}
    <div className="showcase-grid">{items.map(item=><MediaCard key={item.filename} kind={item.kind} media={{media_url:item.media_url}} title={item.title} lang={lang} onPreview={onPreview}/>)}</div>
  </div></Dialog>;
}

export function RegeneratePanel({kind,initialPrompt,lang,onClose,onSubmit}:{kind:RegenerateKind;initialPrompt:string;lang:Lang;onClose:()=>void;onSubmit:(prompt?:string)=>void}){
  const w=workspaceCopy[lang];const [prompt,setPrompt]=useState(initialPrompt);
  const title=kind==='copy'?w.regenerateCopy:kind==='image'?w.regenerateImage:w.regenerateVideo;
  return <Dialog title={title} subtitle={w.retryNote} closeLabel={w.close} onClose={onClose}><div className="settings-content regenerate-content">{kind!=='copy'&&<label className="field"><span>{w.prompt}</span><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={w.promptHint} rows={8}/></label>}</div><footer className="settings-footer"><button className="generate" onClick={()=>onSubmit(kind==='copy'?undefined:prompt)}><RotateCcw size={16}/>{w.regenerate}</button></footer></Dialog>;
}
