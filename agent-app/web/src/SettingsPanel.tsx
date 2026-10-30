/** Model provider settings drawer for changing API endpoints without editing files. */
import{useEffect,useState}from'react';
import{CheckCircle2,KeyRound,LoaderCircle,Save,Settings2,X}from'lucide-react';
import{getModelSettings,saveModelSettings}from'./api';
import type {Lang} from './i18n';
import {workspaceCopy} from './workspaceCopy';
import type{ModelSettings,ProviderSettings}from'./types';
import {backendNames,chineseError} from './chinese';

const empty:ModelSettings={
  text:{backend:'mock',model:'',api_url:'',api_key_configured:false,api_key:'',managed_by_env:false},
  image:{backend:'disabled',model:'',api_url:'',api_key_configured:false,api_key:''},
  video:{backend:'disabled',model:'',api_url:'',query_url:'',api_key_configured:false,api_key:''},
};
type Kind=keyof ModelSettings;

/** Renders one provider's backend, endpoint, model, and write-only credential fields. */
function ProviderForm({kind,value,onChange}:{kind:Kind;value:ProviderSettings;onChange:(v:ProviderSettings)=>void}){
  const labels={text:'文案模型',image:'图片模型',video:'视频模型'};
  const subtitles={text:'文字生成',image:'图像生成',video:'视频生成'};
  const options=kind==='text'?['mock','api','vllm']:['disabled','mock','api'];
  const readOnly=Boolean(value.managed_by_env);
  const showApiFields=value.backend==='api'&&!readOnly;
  const showQueryUrl=kind==='video'&&showApiFields;
  const modelValue=['replace-with-seedream-model-or-endpoint-id','replace-with-seedance-model-or-endpoint-id'].includes(value.model)?'':value.model;
  return <section className="provider-form">
    <div className="provider-title">
      <div><span>{subtitles[kind]}</span><h3>{labels[kind]}</h3></div>
      {readOnly?<small>由环境配置管理</small>:value.api_key_configured&&<small><CheckCircle2 size={13}/> 已配置密钥</small>}
    </div>
    <div className="settings-grid">
      <label><span>服务方式</span>{readOnly?<input value={backendNames[value.backend]||'由环境配置管理'} readOnly/>:<select value={value.backend} onChange={e=>onChange({...value,backend:e.target.value})}>{options.map(x=><option key={x} value={x}>{backendNames[x]}</option>)}</select>}</label>
      <label><span>模型名称或接入点编号</span><input value={modelValue} readOnly={readOnly} onChange={e=>onChange({...value,model:e.target.value})} placeholder="填写服务商提供的模型编号"/></label>
      {showApiFields&&<label className="full"><span>{kind==='video'?'任务创建地址':'接口地址'}</span><input value={value.api_url} onChange={e=>onChange({...value,api_url:e.target.value})} placeholder="填写完整的接口地址"/></label>}
      {showQueryUrl&&<label className="full"><span>任务查询地址</span><input value={value.query_url||''} onChange={e=>onChange({...value,query_url:e.target.value})} placeholder="填写完整的查询地址"/></label>}
      {showApiFields&&<label className="full"><span>接口密钥</span><div className="secret-input"><KeyRound size={15}/><input type="password" autoComplete="new-password" value={value.api_key||''} onChange={e=>onChange({...value,api_key:e.target.value})} placeholder={value.api_key_configured?'留空则保留当前密钥':'输入接口密钥'}/></div></label>}
    </div>
  </section>;
}

/** Loads settings on open and saves all providers atomically through FastAPI. */
export default function SettingsPanel({open,onClose,lang}:{open:boolean;onClose:()=>void;lang:Lang}){
  const[settings,setSettings]=useState<ModelSettings>(empty);
  const[loading,setLoading]=useState(false);
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState('');
  useEffect(()=>{if(!open)return;document.body.style.overflow='hidden';setLoading(true);setMessage('');getModelSettings().then(setSettings).catch(e=>setMessage(chineseError(e))).finally(()=>setLoading(false));return()=>{document.body.style.overflow=''}},[open]);
  if(!open)return null;
  const update=(kind:Kind,value:ProviderSettings)=>setSettings(s=>({...s,[kind]:value}));
  const save=async()=>{setSaving(true);setMessage('');try{const next=await saveModelSettings(settings);setSettings(next);setMessage(workspaceCopy[lang].settingsSaved)}catch(e){setMessage(chineseError(e))}finally{setSaving(false)}};
  return <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="模型设置">
    <button className="settings-backdrop" aria-label="关闭模型设置" onClick={onClose}/>
    <aside className="settings-drawer">
      <header className="settings-header"><div><span>模型 / 配置管理</span><h2><Settings2 size={20}/> 模型设置</h2></div><button className="icon-btn" title="关闭" onClick={onClose}><X size={18}/></button></header>
      <p className="settings-note">{workspaceCopy[lang].settingsNote}</p>
      {loading?<div className="settings-loading"><LoaderCircle className="spin"/> 正在加载设置…</div>:<div className="settings-content">{(['text','image','video']as Kind[]).map(kind=><ProviderForm key={kind} kind={kind} value={settings[kind]} onChange={v=>update(kind,v)}/>)}</div>}
      <footer className="settings-footer">{message&&<span>{message}</span>}<button className="generate" disabled={loading||saving} onClick={save}>{saving?<LoaderCircle className="spin" size={17}/>:<Save size={17}/>} {saving?'正在保存…':'保存设置'}</button></footer>
    </aside>
  </div>;
}
