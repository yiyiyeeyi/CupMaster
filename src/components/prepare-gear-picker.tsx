"use client";
import { useState } from "react";
import { PreparePicker, type PickerOption } from "./prepare-picker";
import { prepareCopy as copy } from "./prepare-copy";
const noop=()=>{};
export function PrepareGearPicker({dripper,accessories,drippers,accessoryOptions,onDripper,onAccessory,onAddDripper,onAddAccessory}:{
  dripper:string;accessories:string[];drippers:PickerOption[];accessoryOptions:PickerOption[];
  onDripper(value:string):void;onAccessory(value:string):void;onAddDripper(value:string):void;onAddAccessory(value:string):void;
}){
  const [adding,setAdding]=useState<"dripper"|"accessory"|null>(null),[name,setName]=useState(""),[error,setError]=useState<string|null>(null);
  function add(){if(!name.trim()||name.trim().length>80){setError(copy.invalidName);return;}if(adding==="dripper")onAddDripper(name.trim());else onAddAccessory(name.trim());setName("");setAdding(null);setError(null);}
  return <PreparePicker label={copy.gear} value={dripper} options={drippers} onChange={onDripper} onClose={noop} extraContent={<div className="prepare-gear-body">
    <h3>{copy.dripper}</h3><div className="prepare-gear-list" role="listbox" aria-label={copy.dripper}>{drippers.map(option=><button key={option.value} type="button" role="option" aria-selected={option.value===dripper} onClick={()=>onDripper(option.value)}>{option.label}</button>)}</div>
    <button type="button" className="prepare-picker-add-link" onClick={()=>{setAdding("dripper");setError(null);}}>{copy.addDripper}</button>
    <h3>{copy.accessories}</h3><div className="prepare-gear-list" role="listbox" aria-label={copy.accessories} aria-multiselectable="true">{accessoryOptions.map(option=><button key={option.value} type="button" role="option" aria-selected={accessories.includes(option.value)} onClick={()=>onAccessory(option.value)}><span aria-hidden="true">{accessories.includes(option.value)?"✓":"□"}</span>{option.label}</button>)}</div>
    <button type="button" className="prepare-picker-add-link" onClick={()=>{setAdding("accessory");setError(null);}}>{copy.addAccessory}</button>
    {adding && <div className="prepare-picker-add"><label>{adding==="dripper"?copy.addDripper:copy.addAccessory}<input autoFocus maxLength={80} value={name} onChange={event=>setName(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button type="button" onClick={add}>{copy.add}</button></div>}
  </div>}><span>{[dripper,...accessories].join(" · ")}</span></PreparePicker>;
}
