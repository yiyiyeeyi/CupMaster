"use client";
import {useState} from "react";
import {formatGrindSetting,grindSettingSchema,type GrinderDefinition,type GrindSetting} from "@/domain/grinders";
import {PreparePicker,PickerWheel} from "./prepare-picker";
import {prepareCopy as copy} from "./prepare-copy";
const noop=()=>{};
export function GrinderSettingPicker({definition,value,legacy,onChange}:{definition:GrinderDefinition;value?:GrindSetting;legacy?:string;onChange(value:GrindSetting|undefined):void}){
  const [range,setRange]=useState(120),[text,setText]=useState(value?.format==="number"?String(value.value):""),[error,setError]=useState<string|null>(null);
  const parts=value?.format==="compound"?value.parts:definition.parts.map(p=>p.min);
  function select(index:number,next:string){
    const candidate=definition.format==="single"?{grinderId:definition.id,format:"single",value:Number(next)}:{grinderId:definition.id,format:"compound",parts:parts.map((part,i)=>i===index?Number(next):part)};
    const parsed=grindSettingSchema.safeParse(candidate);if(parsed.success){setError(null);onChange(parsed.data);}else setError(parsed.error.issues[0].message);
  }
  return <PreparePicker label={copy.setting} value={value?formatGrindSetting(value):legacy??""} options={[]} onChange={noop} onClose={noop} extraContent={<div>
    <p className="prepare-grinder-model">{definition.name}</p>
    {definition.format==="number"?<label className="prepare-number-setting">{copy.setting}<input inputMode="decimal" type="text" value={text} onChange={event=>{
      const next=event.target.value;setText(next);
      if(!next.trim()){onChange(undefined);setError(null);return;}
      if(!/^\d+(?:\.\d+)?$/.test(next)){setError("請輸入數字，可有小數點。");return;}
      const parsed=grindSettingSchema.safeParse({grinderId:definition.id,format:"number",value:Number(next)});
      if(parsed.success){onChange(parsed.data);setError(null);}else setError("請輸入有效刻度。");
    }}/></label>:<div className="prepare-compound-setting">{definition.parts.map((part,index)=><div key={part.label}><p>{part.label}</p><PickerWheel label={part.label} options={Array.from({length:(part.max??range)-part.min+1},(_,i)=>({value:String(i+part.min),label:String(i+part.min)}))} selected={[String(value?.format==="single"?value.value:parts[index])]} multiple={false} onChange={next=>select(index,next)}/>{part.max===undefined && <button type="button" onClick={()=>setRange(range+120)}>更多刻度</button>}</div>)}</div>}
    {error && <p role="alert">{error}</p>}
  </div>}><span>{value?formatGrindSetting(value):legacy||copy.choose}</span></PreparePicker>;
}
