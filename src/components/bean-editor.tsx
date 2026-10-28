"use client";
import {useState} from "react";
import {LocalBeanRepository} from "@/repositories/local-bean-repository";
import type {BeanRecord,BeanInput} from "@/domain/beans";
import {beanCopy as copy} from "./bean-copy";
export function BeanEditor({initial,onSaved,onCancel}:{initial?:BeanRecord;onSaved(bean:BeanRecord):void;onCancel():void}){
  const [id]=useState(()=>initial?.id??crypto.randomUUID()),[repository]=useState(()=>new LocalBeanRepository());
  const [fields,setFields]=useState<Record<keyof typeof copy.fields,string>>(()=>Object.fromEntries(Object.keys(copy.fields).map(key=>{const value=initial?.[key as keyof typeof copy.fields];return[key,Array.isArray(value)?value.join(", "):value===undefined?"":String(value)];})) as Record<keyof typeof copy.fields,string>);
  const [error,setError]=useState<string|null>(null);
  function save(){
    const {agtron,flavors,...rest}=fields;
    const input:BeanInput={...rest,...(agtron.trim()&&{agtron:Number(agtron)}),...(flavors.trim()&&{flavors:flavors.split(/[,，]/).map(value=>value.trim()).filter(Boolean)})};
    const result=repository.save(input,id);if(result.ok)onSaved(result.value);else setError(result.message);
  }
  return <fieldset className="bean-editor" onKeyDown={event=>{if(event.key==="Enter" && !(event.target instanceof HTMLTextAreaElement)){event.preventDefault();save();}}}><legend>{initial?copy.edit:copy.add}</legend>
    {(Object.entries(copy.fields) as Array<[keyof typeof copy.fields,string]>).map(([key,label])=><label key={key}><span>{label} <small>選填</small></span><input type={key==="roastDate"?"date":"text"} inputMode={key==="agtron"?"decimal":undefined} maxLength={key==="blend"?500:300} value={fields[key]} onChange={event=>setFields(current=>({...current,[key]:event.target.value}))}/></label>)}
    {error && <p role="alert">{error}</p>}<div className="button-pair"><button type="button" className="secondary-button" onClick={onCancel}>{copy.cancel}</button><button className="primary-button" type="button" onClick={save}>{copy.save}</button></div>
  </fieldset>;
}
