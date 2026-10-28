"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import type {Brew} from "@/domain";
import {flavorNoteOptions,feedbackRatingLabel} from "@/domain";
import {LocalBrewRepository} from "@/repositories/local-brew-repository";
import {BrewParameterGrid,BrewSteps} from "./brew-sheet";
import {feedbackCopy} from "./feedback-copy";
import {cupCopy as copy} from "./cup-copy";
import "./cup-detail.css";
type State={status:"loading"}|{status:"ready";brew:Brew;notice?:string}|{status:"missing";message:string};
export function BrewDetail({brewId,justCompleted=false}:{brewId:string;justCompleted?:boolean}){
  const [state,setState]=useState<State>({status:"loading"});
  useEffect(()=>{const timer=setTimeout(()=>{const result=new LocalBrewRepository().getById(brewId);setState(result.value?{status:"ready",brew:result.value,notice:result.ok?result.notice:result.message}:{status:"missing",message:result.ok?copy.missing:result.message});},0);return()=>clearTimeout(timer);},[brewId]);
  if(state.status==="loading")return <main className="route-loading"><p role="status">{copy.loading}</p></main>;
  if(state.status==="missing")return <main className="state-page"><h1>{copy.missing}</h1><p>{state.message}</p><Link href="/journal">Journal</Link></main>;
  const {brew}=state,s=brew.recipeSnapshot,d=brew.recordDetails,f=brew.flavorFeedback,rated=feedbackRatingLabel(f)!==undefined;
  return <main className={`brew-detail-page cup-detail${justCompleted?" cup-just-completed":""}`}><header className="cup-topbar"><Link className="back-link" href="/journal" aria-label={copy.back}>←</Link><p className="eyebrow">{rated?`#${brew.id.slice(0,8)} · ${new Date(brew.completedAt??brew.updatedAt).toLocaleString("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}`:copy.complete}</p>{rated?<Link href={`/journal/${encodeURIComponent(brew.id)}/edit`}>{copy.edit}</Link>:<span/>}</header>
    {state.notice&&<p role="status">{state.notice}</p>}
    <section className="cup-bean"><span className="cup-bean-tile" aria-hidden="true">♧</span><div><h1>{d?.bean?.name??s.bean?.name??copy.title}</h1><p>{s.title} · {d?.equipment?.dripper??s.dripper.value} <span className={rated?"":"cup-unrated"}>{feedbackRatingLabel(f)??copy.unrated}</span></p></div></section>
    <BrewParameterGrid label={copy.parameters} values={{dose:d?.actualDoseGrams??s.doseGrams.value,doseSource:d?.actualDoseGrams==null?copy.target:copy.actual,water:d?.actualWaterGrams??s.totalWaterGrams.value,waterSource:d?.actualWaterGrams==null?copy.target:copy.actual,temperature:d?.actualTemperatureCelsius??s.temperatureCelsius.value,temperatureSource:d?.actualTemperatureCelsius==null?copy.target:copy.actual,grind:s.grindDescription?.value??s.equipment?.grinderSetting,grinder:s.equipment?.grinder,seconds:brew.actualTotalTimeSeconds??s.expectedTimeSeconds.value,secondsSource:brew.actualTotalTimeSeconds==null?copy.target:copy.actual,timeReference:brew.actualTotalTimeSeconds==null?undefined:s.expectedTimeSeconds.value}}/>
    <BrewSteps steps={s.steps} results={brew.stageResults} startedAt={brew.startedAt}/>
    <p className="cup-tds"><span>{copy.tdsHint}</span><span>{copy.tdsEntry}</span></p>
    {f&&<section className="cup-feedback"><Link href={`/journal/${encodeURIComponent(brew.id)}/feedback`}>{copy.editFeedback}</Link>{!!f.flavorNotes.length&&<p>{f.flavorNotes.map(note=>flavorNoteOptions.find(option=>option.value===note)?.label??note).join(" · ")}</p>}{f.balance!==undefined&&<p>{feedbackCopy.balance}：{f.balance}/5</p>}{!!f.tasteTags?.length&&<p>{f.tasteTags.map(tag=>feedbackCopy.tags[tag]).join(" · ")}</p>}{f.freeformNotes&&<p>{f.freeformNotes}</p>}</section>}
    {d?.notes&&<p className="cup-notes">{d.notes}</p>}
    <div className="cup-actions button-pair">{rated?<><Link className="secondary-button" href={`/journal/${encodeURIComponent(brew.id)}/analysis`}>{copy.analyze}</Link><Link className="primary-button" href={`/brew/prepare?sourceBrewId=${encodeURIComponent(brew.id)}`}>{copy.again}</Link></>:<><Link className="secondary-button" href="/journal">{copy.save}</Link><Link className="primary-button" href={`/journal/${encodeURIComponent(brew.id)}/feedback`}>{copy.rate}</Link></>}</div>
  </main>;
}
