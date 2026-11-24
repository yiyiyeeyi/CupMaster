"use client";
import { BeanPicker } from "./bean-picker";
import { selectPreparationBean } from "@/application/bean-service";
import { useState, type ReactNode } from "react";
import type { BrewRecipeSnapshot, Recipe } from "@/domain";
import type { PreparationSeed } from "@/application/quick-preparation";
import { synchronizePreparation } from "@/domain/brew-preparation";
import { changePrepareAmount, isRatioChanged, restorePrepareAmounts } from "@/domain/prepare-amounts";
import { applyPrepareAmounts } from "@/domain/prepare-amount-application";
import { pourMethodSchema } from "@/domain/schemas";
import { formatGrindSetting, grinders, grinderDefinition, switchGrinderSetting, type GrindSetting } from "@/domain/grinders";
import { GrinderSettingPicker } from "./grinder-setting-picker";
import { GrindRulerDial } from "./grind-ruler-dial";
import { RatioCup } from "./ratio-cup";
import { brewSheetCopy } from "./brew-sheet-copy";
import { prepareCopy as copy } from "./prepare-copy";
import { PrepareGearPicker } from "./prepare-gear-picker";
import { PreparePicker, type PickerOption } from "./prepare-picker";
import "./quick-prepare-v17.css";

const numbers=(min:number,max:number,step=1):PickerOption[]=>Array.from({length:Math.floor((max-min)/step)+1},(_,index)=>{const value=String(Number((min+index*step).toFixed(2)));return{value,label:value};});
const doses=numbers(1,100,.5),waters=numbers(10,2000,5),temperatures=numbers(60,100),iceValues=numbers(5,1000,5);
const unique=(values:string[])=>[...new Set(values.filter(Boolean))].map(value=>({value,label:value}));
const withCurrent=(options:PickerOption[],value:string)=>options.some(option=>option.value===value)||!value?options:[...options,{value,label:value}].sort((a,b)=>Number(a.value)-Number(b.value));
const noop=()=>{};
function Pin({label,checked,onChange}:{label:string;checked:boolean;onChange():void}){
  return <button className="prepare-pin" role="checkbox" aria-label={label} aria-checked={checked} type="button" onClick={onChange}><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></button>;
}
function Stepper({label,onStep,children}:{label:string;onStep(delta:-1|1):void;children:ReactNode}){
  return <span className="prepare-stepper"><button type="button" aria-label={`${label}減少`} onClick={()=>onStep(-1)}>−</button>{children}<button type="button" aria-label={`${label}增加`} onClick={()=>onStep(1)}>＋</button></span>;
}
export function PreparationControls({seed,onChange,recipes,onRecipe}:{seed:PreparationSeed;onChange(seed:PreparationSeed):void;recipes:Recipe[];onRecipe(recipe:Recipe):void}){
  const [doseFixed,setDoseFixed]=useState(false),[waterFixed,setWaterFixed]=useState(false),[grinderFixed,setGrinderFixed]=useState(false),[settingFixed,setSettingFixed]=useState(false);
  const [settingNotice,setSettingNotice]=useState<string|null>(null),[preview,setPreview]=useState<GrindSetting|null>(null);
  const [more,setMore]=useState(false),[customGrinders,setCustomGrinders]=useState<string[]>([]),[customDrippers,setCustomDrippers]=useState<string[]>([]),[customAccessories,setCustomAccessories]=useState<string[]>([]);
  const s=seed.snapshot, gear=s.equipment;
  function patch(change:(snapshot:BrewRecipeSnapshot)=>void){const next=structuredClone(seed);change(next.snapshot);onChange({...next,...synchronizePreparation(next)});}
  const amounts={dose:s.doseGrams.value,water:s.totalWaterGrams.value,doseFixed,waterFixed};
  const defaults={dose:s.doseGrams.recipeDefault,water:s.totalWaterGrams.recipeDefault};
  const changed=isRatioChanged(amounts,defaults);
  const ratio=(dose:number,water:number)=>`1:${Number((water/dose).toFixed(2))}`;
  function amount(field:"dose"|"water",value:string){onChange(applyPrepareAmounts(seed,changePrepareAmount(amounts,field,Number(value))));}
  function equipment(snapshot:BrewRecipeSnapshot){return snapshot.equipment ??= {dripper:snapshot.dripper.value};}
  const definition=grinderDefinition(gear?.grinderId ?? gear?.grinder ?? "custom:unspecified",gear?.grinder ?? "自訂磨豆機");
  function grinder(value:string){const selected=grinderDefinition(value);patch(snapshot=>{
    const g=equipment(snapshot);g.grinder=selected.name;g.grinderId=selected.id;
    const candidate=switchGrinderSetting(snapshot.grind,selected.id);
    if(definition.format!==selected.format || (snapshot.grind!==undefined && candidate===undefined)){delete snapshot.grind;delete g.grinderSetting;if(snapshot.grindDescription)snapshot.grindDescription.value="";setSettingNotice("刻度格式不同，請重新設定");}
    else if(candidate)snapshot.grind=candidate;
  });}
  const grinderOptions=unique([...grinders.map(g=>g.name),gear?.grinder ?? "",...customGrinders]);
  function cycleGrinder(direction:-1|1){const names=grinderOptions.map(option=>option.value);if(!names.length)return;const index=names.indexOf(gear?.grinder ?? "");grinder(names[(index+direction+names.length)%names.length]);}
  function setGrind(value:GrindSetting|undefined){patch(snapshot=>{snapshot.grind=value;if(!value){delete equipment(snapshot).grinderSetting;if(snapshot.grindDescription)snapshot.grindDescription.value="";}setSettingNotice(null);});}
  const shownGrind=preview ?? s.grind;
  const recipeGrind=s.grindDescription?.recipeDefault;
  const grindStatus=settingNotice ?? (!s.grind && definition.format!=="number" ? copy.slideToSet : recipeGrind && s.grindDescription?.value!==recipeGrind ? `${copy.recipeGrind}${recipeGrind}` : recipeGrind ? copy.recipeOriginal : "\u00a0");
  const dripperOptions=unique([s.dripper.value,...recipes.map(recipe=>recipe.currentVersion.dripper),...customDrippers]);
  const accessoryOptions=unique([...(gear?.accessories ?? []),...customAccessories]);
  function accessory(value:string){patch(snapshot=>{const g=equipment(snapshot),previous=g.accessories ?? [];g.accessories=previous.includes(value)?previous.filter(item=>item!==value):[...previous,value];});}
  return <>
    <div className="prepare-identities"><BeanPicker name={s.bean?.name} beanId={seed.beanId} onSelect={bean=>onChange(selectPreparationBean(seed,bean))} onClear={()=>{const next=structuredClone(seed);delete next.beanId;delete next.snapshot.bean;onChange({...next,...synchronizePreparation(next)});}}/>
      <div><span>{copy.recipe}</span><PreparePicker label={copy.recipe} value={seed.plan.sourceRecipeId} options={recipes.map(recipe=>({value:recipe.id,label:recipe.currentVersion.title}))} onChange={value=>{const selected=recipes.find(recipe=>recipe.id===value);if(selected)onRecipe(selected);}} onClose={noop}><span>{s.title}</span></PreparePicker></div>
    </div>
    <section className="prepare-group"><header><h2>{copy.ratio}</h2><div className={changed?"prepare-ratio-changed":""}>{changed && <><s>{ratio(defaults.dose,defaults.water)}</s> → </>}{ratio(amounts.dose,amounts.water)} {changed?copy.changed:copy.auto}{changed && <button type="button" onClick={()=>onChange(applyPrepareAmounts(seed,restorePrepareAmounts(amounts,defaults)))}>{copy.restore}</button>}</div></header>
      <div className="prepare-ratio-body"><RatioCup dose={s.doseGrams.value} water={s.totalWaterGrams.value}/><div>
      <div className="prepare-value-row"><span>{copy.water}</span><Stepper label={copy.water} onStep={d=>amount("water",String(Math.max(10,s.totalWaterGrams.value+d*10)))}><PreparePicker label={copy.water} value={String(s.totalWaterGrams.value)} options={withCurrent(waters,String(s.totalWaterGrams.value))} onChange={value=>amount("water",value)} onClose={noop}><strong className={s.totalWaterGrams.value!==defaults.water?"modified":""}>{s.totalWaterGrams.value}<small>g</small></strong></PreparePicker></Stepper><Pin label={copy.fixedWater} checked={waterFixed} onChange={()=>setWaterFixed(!waterFixed)}/></div>
      <div className="prepare-value-row"><span>{copy.dose}</span><Stepper label={copy.dose} onStep={d=>amount("dose",String(Math.max(.5,s.doseGrams.value+d)))}><PreparePicker label={copy.dose} value={String(s.doseGrams.value)} options={withCurrent(doses,String(s.doseGrams.value))} onChange={value=>amount("dose",value)} onClose={noop}><strong className={s.doseGrams.value!==defaults.dose?"modified":""}>{s.doseGrams.value}<small>g</small></strong></PreparePicker></Stepper><Pin label={copy.fixedDose} checked={doseFixed} onChange={()=>setDoseFixed(!doseFixed)}/></div>
      </div></div>
    </section>
    <section className="prepare-group prepare-single"><h2>{copy.temperature}</h2><PreparePicker label={copy.temperature} value={String(s.temperatureCelsius.value)} options={temperatures} onClose={noop} onChange={value=>patch(snapshot=>{snapshot.temperatureCelsius.value=Number(value);snapshot.temperatureCelsius.source="user_override";})}><strong>{s.temperatureCelsius.value}<small>°C</small></strong></PreparePicker></section>
    <section className="prepare-group prepare-grind"><header><h2>{copy.grind}</h2></header>
      <div className="prepare-value-row"><span>{copy.grinder}</span><span className="prepare-grinder-switch">
        <button type="button" className="prepare-grinder-arrow" aria-label="上一台磨豆機" onClick={()=>cycleGrinder(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <PreparePicker label={copy.grinder} value={gear?.grinder ?? ""} options={grinderOptions} searchable addLabel={copy.addGrinder} onAdd={value=>{setCustomGrinders(previous=>[...previous,value]);grinder(value);}} onChange={grinder} onClose={noop}><span className="prepare-grinder-name">{gear?.grinder || copy.choose}</span></PreparePicker>
        <button type="button" className="prepare-grinder-arrow" aria-label="下一台磨豆機" onClick={()=>cycleGrinder(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </span><Pin label={copy.fixedGrinder} checked={grinderFixed} onChange={()=>setGrinderFixed(!grinderFixed)}/></div>
      <div className="prepare-value-row prepare-setting-row"><span className="prepare-grind-status" role="status">{grindStatus}</span>{definition.format==="number"
        ?<GrinderSettingPicker key={definition.id} definition={definition} value={s.grind} legacy={gear?.grinderSetting} onChange={setGrind}/>
        :<strong className="prepare-grind-value">{shownGrind?formatGrindSetting(shownGrind,false):"—"}<small>{definition.unit}</small></strong>}<Pin label={copy.fixedSetting} checked={settingFixed} onChange={()=>setSettingFixed(!settingFixed)}/></div>
      {definition.format!=="number" && <GrindRulerDial key={definition.id} definition={definition} value={s.grind} onPreview={setPreview} onChange={value=>{setPreview(null);setGrind(value);}}/>}
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
