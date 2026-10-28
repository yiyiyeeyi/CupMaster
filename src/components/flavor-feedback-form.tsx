"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {Brew,FlavorRating,TasteTag,FlavorFeedbackInput} from "@/domain";
import {BrewService} from "@/application/brew-service";
import {LocalBrewRepository} from "@/repositories/local-brew-repository";
import {feedbackCopy as copy} from "./feedback-copy";
import {cupCopy} from "./cup-copy";
import "./feedback-v17.css";
type RatingKey=keyof typeof copy.fields;
const ratingKeys=Object.keys(copy.fields) as RatingKey[];
const tagKeys=Object.keys(copy.tags) as TasteTag[];
const rating=(value:number):FlavorRating=>value<=1?1:value===2?2:value===3?3:value===4?4:5;
export function FlavorFeedbackForm({brewId}:{brewId:string}){
  const router=useRouter(),lock=useRef(false);
  const [brew,setBrew]=useState<Brew|null>(),[error,setError]=useState<string>(),[stars,setStars]=useState<FlavorRating>(),[ratings,setRatings]=useState<Partial<Record<RatingKey,FlavorRating>>>({}),[tags,setTags]=useState<TasteTag[]>([]),[notes,setNotes]=useState(""),[saving,setSaving]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>{const read=new BrewService(new LocalBrewRepository()).getFlavorFeedback(brewId);if(!read.ok){setError(read.message);setBrew(null);return;}setBrew(read.brew);const f=read.value;if(f){setStars(f.stars);setRatings(Object.fromEntries(ratingKeys.flatMap(key=>f[key]===undefined?[]:[[key,f[key]]])));setTags(f.tasteTags??[]);setNotes(f.freeformNotes??"");}},0);return()=>clearTimeout(timer);},[brewId]);
  async function submit(analyze=false){
    if(lock.current||!brew)return;if(!stars){setError(copy.required);return;}
    const legacy=brew.flavorFeedback;
    const input:FlavorFeedbackInput={stars,...ratings,tasteTags:tags,flavorNotes:legacy?.flavorNotes??[],...(legacy?.balance!==undefined&&{balance:legacy.balance}),...(legacy?.overallImpression&&{overallImpression:legacy.overallImpression}),freeformNotes:notes};
    lock.current=true;setSaving(true);setError(undefined);
    const result=new BrewService(new LocalBrewRepository()).upsertFlavorFeedback(brewId,input);
    if(result.ok){if(analyze)await new BrewService(new LocalBrewRepository()).requestBrewAnalysis(brewId);router.replace(`/journal/${encodeURIComponent(brewId)}${analyze?"/analysis":""}`);}
    else{setError(copy.retry);lock.current=false;setSaving(false);}
  }
  if(brew===undefined)return <main className="feedback-page"><p role="status">{copy.loading}</p></main>;
  if(!brew||brew.executionStatus!=="completed")return <main className="feedback-page"><p role="alert">{error??copy.blocked}</p><Link href="/journal">Journal</Link></main>;
  return <main className="feedback-page"><header className="feedback-header"><Link href={`/journal/${encodeURIComponent(brewId)}`} aria-label={copy.back}>←</Link><div><p className="eyebrow">{copy.kicker}</p><h1>{copy.title}</h1></div><span/></header><section className="feedback-identity"><h2>{brew.recordDetails?.bean?.name??brew.recipeSnapshot.bean?.name??cupCopy.title}</h2><p>{brew.recipeSnapshot.title} · {brew.recipeSnapshot.dripper.value}</p></section>
    {error&&<p role="alert">{error}</p>}
    {brew.flavorFeedback?.overallImpression&&!brew.flavorFeedback.stars&&<p className="legacy-feedback">{copy.legacy}：{cupCopy.impressions[brew.flavorFeedback.overallImpression]}</p>}
    <fieldset className="feedback-stars"><legend>{copy.stars}</legend><div>{([1,2,3,4,5] as const).map(value=><button key={value} type="button" aria-label={`${value} 顆星`} aria-pressed={stars===value} onClick={()=>{setStars(value);setError(undefined);}}>{stars&&value<=stars?"★":"☆"}</button>)}</div></fieldset>
    <fieldset className="feedback-tags"><legend>{copy.taste}</legend><div>{tagKeys.map(tag=><button type="button" key={tag} aria-pressed={tags.includes(tag)} onClick={()=>setTags(current=>current.includes(tag)?current.filter(item=>item!==tag):[...current,tag])}>{copy.tags[tag]}</button>)}</div></fieldset>
    <section className="feedback-sliders"><h2 className="feedback-section-title">{copy.detail} <small>1–5 · {copy.optional}</small></h2>{ratingKeys.map(key=><div className="feedback-slider" key={key}><label htmlFor={`rating-${key}`}>{copy.fields[key]}</label><input id={`rating-${key}`} aria-valuetext={ratings[key]===undefined?copy.optional:String(ratings[key])} className={ratings[key]===undefined?"unset":undefined} type="range" min="1" max="5" step="1" value={ratings[key]??3} onPointerDown={()=>{if(ratings[key]===undefined)setRatings(current=>({...current,[key]:3}));}} onChange={event=>setRatings(current=>({...current,[key]:rating(Number(event.target.value))}))}/><button type="button" aria-label={`${copy.fields[key]} ${ratings[key]===undefined?copy.optional:copy.clear}`} onClick={()=>setRatings(current=>({...current,[key]:current[key]===undefined?3:undefined}))}>{ratings[key]??copy.optional}</button></div>)}</section>
    <label className="feedback-notes">{copy.notes}<textarea value={notes} maxLength={500} rows={2} onChange={event=>setNotes(event.target.value)}/></label>
    <div className="feedback-actions button-pair"><button type="button" className="secondary-button" disabled={saving} onClick={()=>submit()}>{saving?copy.saving:copy.save}</button><button type="button" className="primary-button" disabled={saving} onClick={()=>submit(true)}>{copy.saveAnalyze}</button></div>
  </main>;
}
