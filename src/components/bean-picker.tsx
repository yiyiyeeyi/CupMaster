"use client";
import {useEffect,useState} from "react";
import {beanDisplayName,type BeanRecord} from "@/domain/beans";
import {LocalBeanRepository} from "@/repositories/local-bean-repository";
import {PreparePicker} from "./prepare-picker";
import {BeanEditor} from "./bean-editor";
import {beanCopy as copy} from "./bean-copy";
const noop=()=>{};
export function BeanPicker({name,beanId,onSelect,onClear}:{name?:string;beanId?:string;onSelect(bean:BeanRecord):void;onClear():void}){
  const [repository]=useState(()=>new LocalBeanRepository()),[beans,setBeans]=useState<BeanRecord[]>([]),[error,setError]=useState<string|null>(null),[adding,setAdding]=useState(false);
  function load(){const result=repository.read();if(result.ok)setBeans(result.value.beans.filter(bean=>!bean.deletedAt));setError(result.ok?null:result.message);}
  useEffect(()=>{const timer=setTimeout(()=>{const result=repository.read();if(result.ok)setBeans(result.value.beans.filter(bean=>!bean.deletedAt));else setError(result.message);},0);return()=>clearTimeout(timer);},[repository]);
  return <div><span>{copy.title}（選填）</span><PreparePicker label={copy.choose} value={beanId??""} options={[]} onChange={noop} onClose={noop} extraContent={adding?<BeanEditor onCancel={()=>setAdding(false)} onSaved={bean=>{load();onSelect(bean);setAdding(false);}}/>:<div className="prepare-bean-list">
    {error?<p role="alert">{error}<button type="button" onClick={load}>{copy.retry}</button></p>:beans.map(bean=><button type="button" key={bean.id} aria-pressed={beanId===bean.id} onClick={()=>onSelect(bean)}>{beanDisplayName(bean)}{bean.roaster && <small>{bean.roaster}</small>}</button>)}
    {!error && !beans.length && <p>{copy.empty}</p>}<button type="button" onClick={onClear}>{copy.clear}</button><button type="button" onClick={()=>setAdding(true)}>{copy.add}</button>
  </div>}><span>{name??copy.choose}</span></PreparePicker></div>;
}
