import{useEffect,useRef,useState}from'react';import{Activity,Check,ChevronDown,Clipboard,Download,FileText,Image,Languages,LoaderCircle,Moon,Plus,Settings2,History,Images,RotateCcw,Sparkles,Sun,Trash2,Video,XCircle}from'lucide-react';import{ApiError,generate,health,getTask,pollTask,regenerate,kitUrl}from'./api';import{dict,type Lang}from'./i18n';import type{FormData,Mode,Result,Status,RegenerateKind}from'./types';import SettingsPanel from'./SettingsPanel';
import {HistoryPanel,ShowcasePanel,MediaCard,MediaPreview,RegeneratePanel,type Preview} from './WorkspacePanels';
import {readDraft,saveDraft,readStored,storeValue,PENDING,LAST_WORK} from './workspace';
import {workspaceCopy} from './workspaceCopy';
import {chineseError,chineseHistory,scoreNames} from './chinese';
const blank:FormData={title:'',category:'3c_digital',platform:'taobao',tone:'professional',price_positioning:'中端',target_audience:'',attributes:{},selling_points:[],constraints:[],custom_image_prompt:'',custom_video_prompt:''};
const samples:{name:string;data:FormData}[]=[{name:'降噪耳机',data:{...blank,title:'真无线主动降噪耳机',target_audience:'通勤与运动人群',attributes:{'蓝牙版本':'5.3','续航':'30小时','防水':'IPX5'},selling_points:['主动降噪','低延迟游戏模式']}},{name:'轻透粉底液',data:{...blank,title:'轻透持妆养肤粉底液',category:'beauty',platform:'xiaohongshu',tone:'casual',target_audience:'混合肌与通勤人群',attributes:{'色号':'自然白','容量':'30ml'},selling_points:['轻薄服帖','12小时持妆']}},{name:'亚马逊耳机',data:{...blank,title:'主动降噪无线蓝牙耳机',platform:'amazon',tone:'professional',price_positioning:'中端',target_audience:'通勤与健身人群',attributes:{'蓝牙版本':'5.3','续航':'30小时','防水等级':'IPX5'},selling_points:['主动降噪','低延迟模式']}}];
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <label className={wide?'field wide':'field'}><span>{label}</span>{children}</label>}
function CopyButton({value,label}:{value:string;label:string}){const[copied,setCopied]=useState(false);return <button className="icon-btn" title={label} onClick={async()=>{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1200)}}>{copied?<Check size={16}/>:<Clipboard size={16}/>}</button>}
function Section({title,value,children}:{title:string;value:string;children:React.ReactNode}){return <section className="output-section"><div className="section-head"><h3>{title}</h3><CopyButton value={value} label="复制"/></div>{children}</section>}
export default function App(){
const lang:Lang='zh';
const [theme,setTheme]=useState(()=>readStored('theme')||'light');
const [draft]=useState(()=>readDraft(blank));
const [form,setForm]=useState<FormData>(draft.form),[mode,setMode]=useState<Mode>(draft.mode);
const [result,setResult]=useState<Result|null>(null),[status,setStatus]=useState<Status>('idle'),[error,setError]=useState('');
const [online,setOnline]=useState(false),[settingsOpen,setSettingsOpen]=useState(false),[mobileTab,setMobileTab]=useState<'input'|'result'>('input');
const [panel,setPanel]=useState<'history'|'showcase'|null>(null),[preview,setPreview]=useState<Preview|null>(null);
const [retryKind,setRetryKind]=useState<RegenerateKind|null>(null),[pending,setPending]=useState<string|null>(null);
const [loadingWork,setLoadingWork]=useState(false),[draftSaved,setDraftSaved]=useState(true);
const controller=useRef<AbortController|null>(null);
const t=dict[lang],w=workspaceCopy[lang],busy=status==='running'||status==='queued'||loadingWork;
useEffect(()=>{document.documentElement.dataset.theme=theme;storeValue('theme',theme)},[theme]);
useEffect(()=>{storeValue('lang',lang)},[lang]);
useEffect(()=>{setDraftSaved(saveDraft(form,mode))},[form,mode]);
const accepted=(id:string)=>{storeValue(PENDING,id);setPending(id)};
const completed=(r:Result)=>{setResult(r);setStatus('succeeded');setPending(null);storeValue(PENDING,null);if(r.task_id)storeValue(LAST_WORK,r.task_id)};
const failed=(e:Error)=>{
  if(e.name==='AbortError')return;
  setError(chineseError(e));setStatus(s=>s==='timeout'?s:'failed');
  if(e instanceof ApiError&&e.task?.status==='failed'){
    storeValue(PENDING,null);setPending(null);
    if(e.task.result){setResult({...e.task.result,task_id:e.task.task_id});storeValue(LAST_WORK,e.task.task_id)}
  }
};
const execute=async(operation:(signal:AbortSignal)=>Promise<Result>,clear=false)=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  setError('');setStatus('running');setMobileTab('result');if(clear)setResult(null);
  try{const next=await operation(abort.signal);if(!abort.signal.aborted)completed(next)}catch(e){if(!abort.signal.aborted)failed(e as Error)}
};
useEffect(()=>{
  health().then(()=>setOnline(true)).catch(()=>setOnline(false));
  const id=readStored(PENDING)||readStored(LAST_WORK);
  const abort=new AbortController();controller.current=abort;
  if(id){
    setStatus('running');
    getTask(id,abort.signal).then(async task=>{
      if(abort.signal.aborted)return;
      if(task.status==='queued'||task.status==='running'){
        accepted(id);setMobileTab('result');const next=await pollTask(id,abort.signal,setStatus);
        if(!abort.signal.aborted)completed(next);
      }else if(task.status==='succeeded'&&task.result)completed({...task.result,task_id:id});
      else {if(task.result)setResult({...task.result,task_id:id});failed(new ApiError(task.error?.message||w.failed,0,task))}
    }).catch(e=>{if(!abort.signal.aborted){if(e instanceof ApiError&&e.status===404){storeValue(PENDING,null);storeValue(LAST_WORK,null);setStatus('idle')}else{setPending(readStored(PENDING));failed(e)}}});
  }
  return()=>{abort.abort();controller.current?.abort()};
},[]);
const update=(key:keyof FormData,value:unknown)=>setForm(f=>({...f,[key]:value}));
const run=()=>{if(!form.title.trim()){setError(t.required);return}void execute(signal=>generate(mode,form,signal,setStatus,accepted),true)};
const openWork=async(id:string)=>{
  setLoadingWork(true);
  try{
    const task=await getTask(id);setForm({...blank,...task.product});
    setMode(task.result?.video||task.kind==='all'||task.kind==='video'?'all':task.result?.image||task.kind==='image'?'image':'copy');
    setResult(task.result?{...task.result,task_id:id}:null);setError(task.error?chineseError(task.error.message):'');setStatus(task.status);setMobileTab(task.result?'result':'input');
    if(task.result)storeValue(LAST_WORK,id);
    if(task.status==='queued'||task.status==='running'){accepted(id);void execute(signal=>pollTask(id,signal,setStatus))}
  }finally{setLoadingWork(false)}
};
const retry=(prompt?:string)=>{
  if(!result?.task_id||!retryKind)return;
  const id=result.task_id,kind=retryKind;setRetryKind(null);
  void execute(signal=>regenerate(id,kind,prompt,signal,setStatus,accepted));
};
const addAttribute=()=>update('attributes',{...form.attributes,'':''});const setAttr=(old:string,key:string,value:string)=>{const next={...form.attributes};delete next[old];next[key]=value;update('attributes',next)};const exportJson=()=>{if(!result)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));a.download='content-package.json';a.click();URL.revokeObjectURL(a.href)};
return <div className="app-shell"><header><div className="brand"><span className="brand-mark"><Sparkles size={18}/></span><div><strong>电商内容工作台</strong><small>智能创作空间</small></div></div><div className="header-actions"><span className={online?'health on':'health'}><span/>{online?'服务已连接':'服务未连接'}</span><button className="icon-btn" title="模型设置" onClick={()=>setSettingsOpen(true)}><Settings2 size={18}/></button><span className="icon-btn language-badge" title="界面语言：中文"><Languages size={18}/><b>中</b></span><button className="icon-btn" title={theme==='light'?'切换深色主题':'切换浅色主题'} onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button></div></header>
<SettingsPanel open={settingsOpen} onClose={()=>setSettingsOpen(false)} lang={lang}/>
{panel==='history'&&<HistoryPanel lang={lang} onClose={()=>setPanel(null)} onSelect={openWork} disabled={busy}/>}
{panel==='showcase'&&<ShowcasePanel lang={lang} onClose={()=>setPanel(null)} onPreview={setPreview}/>}
{retryKind&&<RegeneratePanel kind={retryKind} initialPrompt={retryKind==='copy'?'':result?.[retryKind]?.[`${retryKind}_prompt`]||result?.[retryKind]?.prompt||''} lang={lang} onClose={()=>setRetryKind(null)} onSubmit={retry}/>}
{preview&&<MediaPreview value={preview} lang={lang} onClose={()=>setPreview(null)}/>}<nav className="mobile-tabs"><button className={mobileTab==='input'?'active':''} onClick={()=>setMobileTab('input')}>{t.product}</button><button className={mobileTab==='result'?'active':''} onClick={()=>setMobileTab('result')}>{t.results}</button></nav>
<main><aside className={mobileTab==='input'?'input-panel show':'input-panel'}><div className="panel-title"><div><span>01 / 商品信息</span><h1>{t.product}</h1></div><div className="sample-menu"><button><FileText size={15}/>{t.examples}<ChevronDown size={14}/></button><div>{samples.map(s=><button key={s.name} onClick={()=>setForm(s.data)}>{s.name}</button>)}</div></div></div><div className="draft-note">{draftSaved?w.draft:w.draftError}</div><div className="form-grid"><Field label={t.title} wide><input value={form.title} onChange={e=>update('title',e.target.value)} placeholder="例如：真无线降噪耳机"/></Field><Field label={t.category}><select value={form.category} onChange={e=>update('category',e.target.value)}><option value="3c_digital">数码电子</option><option value="beauty">美妆护肤</option><option value="clothing">服饰</option><option value="home">家居</option><option value="other">其他</option></select></Field><Field label={t.platform}><select value={form.platform} onChange={e=>update('platform',e.target.value)}><option value="taobao">淘宝</option><option value="amazon">亚马逊</option><option value="douyin">抖音</option><option value="xiaohongshu">小红书</option></select></Field><Field label={t.tone}><select value={form.tone} onChange={e=>update('tone',e.target.value)}><option value="professional">专业严谨</option><option value="casual">亲切自然</option><option value="trendy">潮流活泼</option><option value="luxury">高端质感</option></select></Field><Field label={t.price}><input value={form.price_positioning} onChange={e=>update('price_positioning',e.target.value)}/></Field><Field label={t.audience} wide><input value={form.target_audience} onChange={e=>update('target_audience',e.target.value)}/></Field></div>
<div className="subform"><div className="subhead"><h2>{t.attributes}</h2><button className="text-btn" onClick={addAttribute}><Plus size={15}/>{t.add}</button></div>{Object.entries(form.attributes).map(([k,v],i)=><div className="pair" key={`${i}-${k}`}><input aria-label="属性名称" value={k} onChange={e=>setAttr(k,e.target.value,v)} placeholder="属性名称"/><input aria-label="属性内容" value={v} onChange={e=>setAttr(k,k,e.target.value)} placeholder="属性内容"/><button className="icon-btn" title={t.remove} onClick={()=>{const n={...form.attributes};delete n[k];update('attributes',n)}}><Trash2 size={15}/></button></div>)}</div>
{([[t.points,'selling_points'],[t.constraints,'constraints']]as const).map(([label,key])=><Field key={key} label={label} wide><textarea value={form[key].join('\n')} onChange={e=>update(key,e.target.value.split('\n').filter(Boolean))} placeholder="每行一项"/></Field>)}
{mode!=='copy'&&<Field label={t.imagePrompt} wide><textarea value={form.custom_image_prompt} onChange={e=>update('custom_image_prompt',e.target.value)}/></Field>}{mode==='all'&&<Field label={t.videoPrompt} wide><textarea value={form.custom_video_prompt} onChange={e=>update('custom_video_prompt',e.target.value)}/></Field>}
<div className="run-dock"><div className="modes">{(['copy','image','all']as Mode[]).map(m=><button className={mode===m?'active':''} onClick={()=>setMode(m)} key={m}>{m==='copy'?<FileText size={16}/>:m==='image'?<Image size={16}/>:<Video size={16}/>} {t[m]}</button>)}</div><button className="generate" disabled={busy} onClick={run}>{busy?<LoaderCircle className="spin" size={18}/>:<Sparkles size={18}/>} {t.generate}</button></div>{error&&<p className="error" role="alert"><XCircle size={16}/>{error}</p>}</aside>
<section className={mobileTab==='result'?'result-panel show':'result-panel'}><div className="result-top"><div><span>02 / 内容成果</span><h2>{t.results}</h2></div><div className={`run-status ${status}`}><Activity size={16}/><span>{t.status}</span><strong>{w[status]}</strong></div>{result&&<button className="text-btn" onClick={exportJson}><Download size={16}/>{t.download}</button>}</div>
<div className="workspace-toolbar"><button className="text-btn" onClick={()=>setPanel('history')}><History size={15}/>{w.history}</button><button className="text-btn" onClick={()=>setPanel('showcase')}><Images size={15}/>{w.showcase}</button>{result?.task_id&&<a className="text-btn" href={kitUrl(result.task_id)} download><Download size={15}/>{w.downloadKit}</a>}</div>
{error&&<p className="error" role="alert"><XCircle size={16}/>{error}</p>}
{pending&&!busy&&<button className="text-btn" onClick={()=>execute(signal=>pollTask(pending,signal,setStatus))}><RotateCcw size={14}/>{w.reopen}</button>}
{result?.task_id&&<div className="regenerate-toolbar"><button className="text-btn" disabled={busy} onClick={()=>setRetryKind('copy')}><RotateCcw size={14}/>{w.regenerateCopy}</button>{!result.image&&<button className="text-btn" disabled={busy} onClick={()=>setRetryKind('image')}><Image size={14}/>{w.regenerateImage}</button>}{!result.video&&<button className="text-btn" disabled={busy} onClick={()=>setRetryKind('video')}><Video size={14}/>{w.regenerateVideo}</button>}</div>}
{!result?<div className="empty"><Sparkles size={30}/><p>{t.empty}</p><div><span>商品理解</span><span>文案创作</span><span>合规检查</span><span>质量评估</span></div></div>:<ResultView result={result} t={t} lang={lang} onPreview={setPreview} onRetry={setRetryKind} busy={busy}/>}</section></main></div>}
function ResultView({result,t,lang,onPreview,onRetry,busy}:{result:Result;t:(typeof dict)['zh'];lang:Lang;onPreview:(p:Preview)=>void;onRetry:(k:RegenerateKind)=>void;busy:boolean}){const score=result.quality_score||{};return <div className="result-body"><Section title={t.title} value={result.optimized_title}><p className="lead-copy">{result.optimized_title}</p></Section><Section title={t.points} value={result.selling_points.join('\n') }><ol className="selling-list">{result.selling_points.map((p,i)=><li key={i}><b>{String(i+1).padStart(2,'0')}</b><span>{p}</span></li>)}</ol></Section><Section title={t.description} value={result.description}><p>{result.description}</p></Section><Section title={t.social} value={result.social_copy}><p>{result.social_copy}</p></Section><Section title={t.seo} value={result.seo_keywords.join(', ')}><div className="tags">{result.seo_keywords.map(x=><span key={x}>{x}</span>)}</div></Section><section className="output-section"><h3>{t.quality}</h3><div className="scores">{['accuracy','attractiveness','compliance','seo'].map(k=>{const v=score[k] as {score?:number}|undefined;return <div key={k}><span>{scoreNames[k]}</span><strong>{v?.score??'-'}<small>/5</small></strong></div>})}<div className="total"><span>总分</span><strong>{String(score.total??'-')}</strong></div></div></section>{(result.image||result.video)&&<section className="output-section"><h3>{t.media}</h3><div className="media-grid">{result.image&&<MediaCard kind="image" media={result.image} lang={lang} onPreview={onPreview} onRetry={result.task_id?()=>onRetry('image'):undefined} disabled={busy}/>} {result.video&&<MediaCard kind="video" media={result.video} lang={lang} onPreview={onPreview} onRetry={result.task_id?()=>onRetry('video'):undefined} disabled={busy}/>}</div></section>}{!!result.rewrite_history?.length&&<details><summary>{t.history} ({result.rewrite_history.length})</summary><pre>{JSON.stringify(chineseHistory(result.rewrite_history),null,2)}</pre></details>}</div>}
