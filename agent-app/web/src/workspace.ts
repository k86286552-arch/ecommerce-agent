import type {FormData,Mode} from './types';

const DRAFT='commerce-draft-v1';
export const PENDING='commerce-pending-v1';
export const LAST_WORK='commerce-last-work-v1';
export function readStored(key:string){try{return localStorage.getItem(key)}catch{return null}}
export function storeValue(key:string,value:string|null){
  try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);return true}catch{return false}
}
export function readDraft(fallback:FormData):{form:FormData;mode:Mode}{
  try{
    const saved=JSON.parse(readStored(DRAFT)||'null');
    if(!saved||!saved.form)return {form:fallback,mode:'copy'};
    const form={...fallback};
    for(const key of Object.keys(fallback) as (keyof FormData)[]){
      const value=saved.form[key];
      if(key==='attributes'){
        if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(v=>typeof v==='string'))form.attributes=value;
      }else if(key==='selling_points'||key==='constraints'){
        if(Array.isArray(value)&&value.every(v=>typeof v==='string'))form[key]=value;
      }else if(typeof value==='string')form[key]=value;
    }
    return {form,mode:['copy','image','all'].includes(saved.mode)?saved.mode:'copy'};
  }catch{return {form:fallback,mode:'copy'}}
}
export const saveDraft=(form:FormData,mode:Mode)=>storeValue(DRAFT,JSON.stringify({form,mode}));
