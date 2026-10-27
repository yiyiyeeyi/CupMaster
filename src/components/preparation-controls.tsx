"use client";
import { useState } from "react";
import type { BrewRecipeSnapshot, Recipe } from "@/domain";
import type { PreparationSeed } from "@/application/quick-preparation";
import { synchronizePreparation } from "@/domain/brew-preparation";
import { changePrepareAmount, isRatioChanged, restorePrepareAmounts } from "@/domain/prepare-amounts";
import { applyPrepareAmounts } from "@/domain/prepare-amount-application";
import { pourMethodSchema } from "@/domain/schemas";
import { changeGrinder, grindMicrons } from "@/domain/prepare-grind";
import { brewSheetCopy } from "./brew-sheet-copy";
import { prepareCopy as copy } from "./prepare-copy";
import { PrepareGearPicker } from "./prepare-gear-picker";
import { PreparePicker, type PickerOption } from "./prepare-picker";
import "./quick-prepare-v17.css";

const numbers=(min:number,max:number,step=1):PickerOption[]=>Array.from({length:Math.floor((max-min)/step)+1},(_,index)=>{const value=String(Number((min+index*step).toFixed(2)));return{value,label:value};});
const doses=numbers(1,100,.5),waters=numbers(10,2000,5),temperatures=numbers(60,100),settings=numbers(0,200,.5),iceValues=numbers(5,1000,5);
const unique=(values:string[])=>[...new Set(values.filter(Boolean))].map(value=>({value,label:value}));
const withCurrent=(options:PickerOption[],value:string)=>options.some(option=>option.value===value)||!value?options:[...options,{value,label:value}].sort((a,b)=>Number(a.value)-Number(b.value));
const noop=()=>{};
function Pin({label,checked,onChange}:{label:string;checked:boolean;onChange():void}){
  return <button className="prepare-pin" role="checkbox" aria-label={label} aria-checked={checked} type="button" onClick={onChange}><span aria-hidden="true">{checked?"✓":""}</span></button>;
}
export function PreparationControls({seed,onChange,recipes,onRecipe}:{seed:PreparationSeed;onChange(seed:PreparationSeed):void;recipes:Recipe[];onRecipe(recipe:Recipe):void}){
  const [doseFixed,setDoseFixed]=useState(false),[waterFixed,setWaterFixed]=useState(false),[grinderFixed,setGrinderFixed]=useState(false),[settingFixed,setSettingFixed]=useState(false);
  const [more,setMore]=useState(false),[customGrinders,setCustomGrinders]=useState<string[]>([]),[customDrippers,setCustomDrippers]=useState<string[]>([]),[customAccessories,setCustomAccessories]=useState<string[]>([]);
  const s=seed.snapshot, gear=s.equipment;
  function patch(change:(snapshot:BrewRecipeSnapshot)=>void){const next=structuredClone(seed);change(next.snapshot);onChange({...next,...synchronizePreparation(next)});}
  const amounts={dose:s.doseGrams.value,water:s.totalWaterGrams.value,doseFixed,waterFixed};
  const defaults={dose:s.doseGrams.recipeDefault,water:s.totalWaterGrams.recipeDefault};
  const changed=isRatioChanged(amounts,defaults);
  const ratio=(dose:number,water:number)=>`1:${Number((water/dose).toFixed(2))}`;
  function amount(field:"dose"|"water",value:string){onChange(applyPrepareAmounts(seed,changePrepareAmount(amounts,field,Number(value))));}
  function equipment(snapshot:BrewRecipeSnapshot){return snapshot.equipment ??= {dripper:snapshot.dripper.value};}
  function grinder(value:string){const next=changeGrinder({grinder:gear?.grinder,setting:gear?.grinderSetting},value,settingFixed);patch(snapshot=>{const g=equipment(snapshot);g.grinder=next.grinder;if(next.setting!==undefined){g.grinderSetting=next.setting;snapshot.grindDescription={value:next.setting,recipeDefault:snapshot.grindDescription?.recipeDefault ?? "",source:"user_override"};}});}
  const microns=grindMicrons({grinder:gear?.grinder,setting:gear?.grinderSetting});
  const grinderOptions=unique([gear?.grinder ?? "",...customGrinders]);
  const dripperOptions=unique([s.dripper.value,...recipes.map(recipe=>recipe.currentVersion.dripper),...customDrippers]);
  const accessoryOptions=unique([...(gear?.accessories ?? []),...customAccessories]);
  function accessory(value:string){patch(snapshot=>{const g=equipment(snapshot),previous=g.accessories ?? [];g.accessories=previous.includes(value)?previous.filter(item=>item!==value):[...previous,value];});}
  return <>
    <div className="prepare-identities"><label>{copy.bean}<input maxLength={100} placeholder={copy.noBean} value={s.bean?.name ?? ""} onChange={event=>patch(snapshot=>{if(event.target.value.trim())snapshot.bean={id:`local-bean:${event.target.value.trim()}`,name:event.target.value};else delete snapshot.bean;})}/></label>
      <div><span>{copy.recipe}</span><PreparePicker label={copy.recipe} value={seed.plan.sourceRecipeId} options={recipes.map(recipe=>({value:recipe.id,label:recipe.currentVersion.title}))} onChange={value=>{const selected=recipes.find(recipe=>recipe.id===value);if(selected)onRecipe(selected);}} onClose={noop}><span>{s.title}</span></PreparePicker></div>
    </div>
    <section className="prepare-group"><header><h2>{copy.ratio}</h2><div className={changed?"prepare-ratio-changed":""}>{changed && <><s>{ratio(defaults.dose,defaults.water)}</s> → </>}{ratio(amounts.dose,amounts.water)} {changed?copy.changed:copy.auto}{changed && <button type="button" onClick={()=>onChange(applyPrepareAmounts(seed,restorePrepareAmounts(amounts,defaults)))}>{copy.restore}</button>}</div></header>
      <div className="prepare-value-row"><span>{copy.dose}</span><PreparePicker label={copy.dose} value={String(s.doseGrams.value)} options={withCurrent(doses,String(s.doseGrams.value))} onChange={value=>amount("dose",value)} onClose={noop}><strong className={s.doseGrams.value!==defaults.dose?"modified":""}>{s.doseGrams.value}<small>g</small></strong></PreparePicker><Pin label={copy.fixedDose} checked={doseFixed} onChange={()=>setDoseFixed(!doseFixed)}/></div>
      <div className="prepare-value-row"><span>{copy.water}</span><PreparePicker label={copy.water} value={String(s.totalWaterGrams.value)} options={withCurrent(waters,String(s.totalWaterGrams.value))} onChange={value=>amount("water",value)} onClose={noop}><strong className={s.totalWaterGrams.value!==defaults.water?"modified":""}>{s.totalWaterGrams.value}<small>g</small></strong></PreparePicker><Pin label={copy.fixedWater} checked={waterFixed} onChange={()=>setWaterFixed(!waterFixed)}/></div>
    </section>
    <section className="prepare-group prepare-single"><h2>{copy.temperature}</h2><PreparePicker label={copy.temperature} value={String(s.temperatureCelsius.value)} options={temperatures} onClose={noop} onChange={value=>patch(snapshot=>{snapshot.temperatureCelsius.value=Number(value);snapshot.temperatureCelsius.source="user_override";})}><strong>{s.temperatureCelsius.value}<small>°C</small></strong></PreparePicker></section>
    <section className="prepare-group"><header><h2>{copy.grind}</h2>{microns!==undefined && <small>{copy.micron} {microns} μm</small>}</header>
      <div className="prepare-value-row"><span>{copy.grinder}</span><PreparePicker label={copy.grinder} value={gear?.grinder ?? ""} options={grinderOptions} searchable addLabel={copy.addGrinder} onAdd={value=>{setCustomGrinders(previous=>[...previous,value]);grinder(value);}} onChange={grinder} onClose={noop}/><Pin label={copy.fixedGrinder} checked={grinderFixed} onChange={()=>setGrinderFixed(!grinderFixed)}/></div>
      <div className="prepare-value-row"><span>{copy.setting}</span><PreparePicker label={copy.setting} value={gear?.grinderSetting ?? ""} options={withCurrent(settings,gear?.grinderSetting ?? "")} onClose={noop} onChange={value=>patch(snapshot=>{equipment(snapshot).grinderSetting=value;snapshot.grindDescription={value,recipeDefault:snapshot.grindDescription?.recipeDefault ?? "",source:"user_override"};})}/><Pin label={copy.fixedSetting} checked={settingFixed} onChange={()=>setSettingFixed(!settingFixed)}/></div>
      {!gear?.grinderSetting && s.grindDescription?.value && <p className="prepare-original-grind">{s.grindDescription.value}</p>}
    </section>
    <section className="prepare-group prepare-single"><h2>{copy.gear}</h2><PrepareGearPicker dripper={s.dripper.value} accessories={gear?.accessories ?? []} drippers={dripperOptions} accessoryOptions={accessoryOptions} onDripper={value=>patch(snapshot=>{snapshot.dripper.value=value;snapshot.dripper.source=value===snapshot.dripper.recipeDefault?"recipe_default":"user_override";equipment(snapshot).dripper=value;})} onAccessory={accessory} onAddDripper={value=>{setCustomDrippers(previous=>[...previous,value]);patch(snapshot=>{snapshot.dripper.value=value;snapshot.dripper.source="user_override";equipment(snapshot).dripper=value;});}} onAddAccessory={value=>{setCustomAccessories(previous=>[...previous,value]);accessory(value);}} /></section>
    <button className="prepare-more" type="button" aria-expanded={more} onClick={()=>setMore(!more)}>{more?copy.less:copy.more} {more?"▴":"▾"}</button>
    {more && <section className="prepare-more-fields"><div className="prepare-temperature-mode" role="group" aria-label="冷熱">{(["hot","iced"] as const).map(mode=><button key={mode} type="button" aria-pressed={(s.brewTemperatureMode ?? "hot")===mode} onClick={()=>patch(snapshot=>{snapshot.brewTemperatureMode=mode;if(mode==="hot")delete snapshot.iceGrams;else snapshot.iceGrams ??= 100;})}>{mode==="hot"?copy.hot:copy.iced}</button>)}</div>
      {s.brewTemperatureMode==="iced" && <div className="prepare-group prepare-single"><h2>{copy.ice}</h2><PreparePicker label={copy.ice} value={String(s.iceGrams ?? 100)} options={iceValues} onClose={noop} onChange={value=>patch(snapshot=>{snapshot.iceGrams=Number(value);})}><strong>{s.iceGrams}<small>g</small></strong></PreparePicker></div>}
      <h2>{copy.pour}</h2>{s.steps.map(step=><div className="prepare-pour-row" key={step.id}><span>{step.title}</span><PreparePicker label={`${step.title} · ${copy.pour}`} value={step.pourMethod ?? ""} options={[{value:"",label:copy.chooseMethod},...Object.entries(brewSheetCopy.pourMethods).map(([value,label])=>({value,label}))]} onClose={noop} onChange={value=>patch(snapshot=>{const current=snapshot.steps.find(item=>item.id===step.id);if(!current)return;if(value==="")delete current.pourMethod;else {const match=pourMethodSchema.safeParse(value);if(match.success)current.pourMethod=match.data;}})}/><small>{step.targetWaterGrams}g</small></div>)}
      <label className="prepare-text-setting">{copy.equipmentNotes}<textarea maxLength={300} value={gear?.notes ?? ""} onChange={event=>patch(snapshot=>{equipment(snapshot).notes=event.target.value;})}/></label>
    </section>}
    <label className="prepare-text-setting">{copy.goal}<textarea maxLength={120} value={s.userGoal ?? ""} onChange={event=>patch(snapshot=>{snapshot.userGoal=event.target.value;})}/></label>
  </>;
}
