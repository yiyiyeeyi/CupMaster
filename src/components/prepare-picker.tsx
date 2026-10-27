"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { prepareCopy as copy } from "./prepare-copy";

export interface PickerOption { value: string; label: string; }
export function PreparePicker({ label, value, options, onChange, searchable = false, addLabel, onAdd, children, multiple = false, extraContent, onClose }: {
  label:string; value:string | string[]; options:PickerOption[]; onChange(value:string):void; searchable?:boolean;
  addLabel?:string; onAdd?(value:string):void; children?:ReactNode; multiple?:boolean; extraContent?:ReactNode; onClose():void;
}) {
  const root=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null), [open,setOpen]=useState(false), [above,setAbove]=useState(false);
  const [query,setQuery]=useState(""),[adding,setAdding]=useState(false),[custom,setCustom]=useState(""),[error,setError]=useState<string|null>(null);
  const chosen=Array.isArray(value)?value:[value];
  const filtered=options.filter(option=>option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function close(){setOpen(false);setAdding(false);setQuery("");onClose();trigger.current?.focus();}
  useEffect(()=>{
    if(!open)return;
    function outside(event:PointerEvent){if(event.target instanceof Node && !root.current?.contains(event.target)){setOpen(false);setAdding(false);setQuery("");onClose();}}
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[open,onClose]);
  return <div className="prepare-picker-anchor" ref={root}>
    <button ref={trigger} type="button" className="prepare-picker-trigger" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={()=>{setAbove((trigger.current?.getBoundingClientRect().bottom ?? 0)>window.innerHeight-420);setOpen(!open);setError(null);}}>
      {children ?? (chosen.map(item=>options.find(option=>option.value===item)?.label ?? item).filter(Boolean).join(" · ") || copy.choose)}<span aria-hidden="true">›</span>
    </button>
    {open && <div className={`prepare-popover${above?" above":""}`} role="dialog" aria-label={label} onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();close();}}}>
      <header><span>{label}</span><button type="button" onClick={close}>{copy.close}</button></header>
      {searchable && <input type="search" aria-label={copy.search} placeholder={copy.search} value={query} onChange={event=>setQuery(event.target.value)} />}
      {extraContent ?? (adding ? <div className="prepare-picker-add"><label>{copy.customName}<input autoFocus maxLength={100} value={custom} onChange={event=>setCustom(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button type="button" onClick={()=>{if(!custom.trim() || custom.trim().length>80){setError(copy.invalidName);return;}onAdd?.(custom.trim());setCustom("");setQuery("");setAdding(false);}}>{copy.add}</button></div>
        : filtered.length ? <PickerWheel key={query} label={label} options={filtered} selected={chosen} multiple={multiple} onChange={onChange} /> : <p>{copy.empty}</p>)}
      {addLabel && <button className="prepare-picker-add-link" type="button" onClick={()=>setAdding(true)}>{addLabel}</button>}
    </div>}
  </div>;
}
function PickerWheel({label,options,selected,multiple,onChange}:{label:string;options:PickerOption[];selected:string[];multiple:boolean;onChange(value:string):void}){
  const wheel=useRef<HTMLDivElement>(null), scroller=useRef<ReturnType<typeof setTimeout>|null>(null);
  const initial=useRef(Math.max(0,options.findIndex(option=>selected.includes(option.value))));
  useEffect(()=>{if(wheel.current)wheel.current.scrollTop=initial.current*44;return()=>{if(scroller.current)clearTimeout(scroller.current);};},[]);
  const active=Math.max(0,options.findIndex(option=>selected.includes(option.value)));
  return <div ref={wheel} className={`prepare-picker-wheel${multiple?" multiple":""}`} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} tabIndex={0}
    onKeyDown={event=>{
      let index=active;
      if(event.key==="ArrowDown")index=Math.min(options.length-1,active+1);else if(event.key==="ArrowUp")index=Math.max(0,active-1);else if(event.key==="Home")index=0;else if(event.key==="End")index=options.length-1;else return;
      event.preventDefault();onChange(options[index].value);wheel.current?.scrollTo({top:index*44,behavior:"auto"});
    }}
    onScroll={()=>{if(multiple)return;if(scroller.current)clearTimeout(scroller.current);scroller.current=setTimeout(()=>{const index=Math.min(options.length-1,Math.max(0,Math.round((wheel.current?.scrollTop ?? 0)/44)));if(!selected.includes(options[index].value))onChange(options[index].value);},140);}}>
    {options.map((option,index)=><button role="option" aria-selected={selected.includes(option.value)} tabIndex={-1} type="button" key={option.value} style={{opacity:multiple || selected.includes(option.value)?1:Math.abs(index-active)<2?.5:.3}} onClick={()=>{onChange(option.value);if(!multiple)wheel.current?.scrollTo({top:index*44,behavior:"auto"});}}>{multiple && <span aria-hidden="true">{selected.includes(option.value)?"✓":"□"}</span>}{option.label}</button>)}
  </div>;
}
