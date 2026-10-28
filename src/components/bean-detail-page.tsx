"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {CollectionService} from "@/application/collection-service";
import {beanBrews,beanDisplayName} from "@/domain/beans";
import {beanCopy as copy} from "./bean-copy";
import {bestStars,previousRatingDelta} from "@/domain/brew-ratings";
import {BrewJournalRow} from "./brew-journal-row";
import "./collection.css";

export function BeanDetailPage({beanId}:{beanId:string}){
  const [service]=useState(()=>new CollectionService()),[state,setState]=useState<ReturnType<CollectionService["load"]>|null>(null);
  const [more,setMore]=useState(false),[all,setAll]=useState(false);
  const reload=()=>setState(service.load());
  useEffect(()=>{
    const refresh=()=>setState(service.load()),timer=setTimeout(refresh,0);
    window.addEventListener("storage",refresh);window.addEventListener("pageshow",refresh);
    return()=>{clearTimeout(timer);window.removeEventListener("storage",refresh);window.removeEventListener("pageshow",refresh);};
  },[service]);
  const bean=state?.ok?state.value.beans.find(bean=>bean.id===beanId):undefined;
  const records=state?.ok&&bean?beanBrews(bean,state.value.allBeans,state.value.brews):[];
  const best=bestStars(records);
  const profile=bean?[[copy.fields.origin,bean.origin],[copy.fields.farm,bean.farm],[copy.fields.variety,bean.variety],[copy.fields.roastDate,bean.roastDate]]:[];
  const extra=bean?[[copy.fields.process,bean.process],[copy.fields.cropYear,bean.cropYear],[copy.fields.altitude,bean.altitude],[copy.fields.agtron,bean.agtron?.toString()],[copy.fields.blend,bean.blend]]:[];
  const knownProfile=profile.filter(([,value])=>value!==undefined&&value!==""),knownExtra=extra.filter(([,value])=>value!==undefined&&value!=="");
  return <main className="bean-detail-page"><Link className="back-link" href="/collection">← Collection</Link>
    {!state?<p role="status">{copy.loading}</p>:!state.ok?<p role="alert">{state.message}<button type="button" onClick={reload}>{copy.retry}</button></p>:!bean?<p role="status">{copy.missing}</p>:<>
      <header className="bean-hero"><div className="bean-text-tile" aria-hidden="true"><span>{beanDisplayName(bean)}</span></div><div>{bean.roaster&&<p className="eyebrow">{bean.roaster}</p>}<h1>{beanDisplayName(bean)}</h1>{bean.roastLevel&&<p>{bean.roastLevel}</p>}{!!bean.flavors?.length&&<p className="bean-flavors">{bean.flavors.join(" · ")}</p>}</div></header>
      {(knownProfile.length>0||knownExtra.length>0)&&<section className="bean-profile"><div className="bean-section-heading"><h2>BEAN PROFILE</h2>{knownExtra.length>0&&<button type="button" aria-expanded={more} aria-controls="bean-profile-extra" onClick={()=>setMore(value=>!value)}>{more?copy.less:copy.more}</button>}</div><dl>{knownProfile.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{knownExtra.length>0&&<dl id="bean-profile-extra" hidden={!more}>{knownExtra.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</section>}
      <section className="bean-records"><div className="bean-section-heading"><h2>{copy.records}</h2>{records.length>0&&<button type="button" aria-expanded={all} onClick={()=>setAll(value=>!value)}>{all?copy.recent:copy.allRecords}</button>}</div>{state.value.brewWarning?<p role="status">{state.value.brewWarning}</p>:<p className="bean-record-count">沖過 {records.length} 次{best!==undefined&&<span className="bean-best-rating" aria-label={`最好的一杯 ${best} 顆星`}>最好的一杯 {"★".repeat(best)}</span>}</p>}{(all?records:records.slice(0,3)).map(brew=><BrewJournalRow key={brew.id} brew={brew} delta={state.value.brewWarning?undefined:previousRatingDelta(brew,state.value.brews,state.value.allBeans)}/>)}{!records.length&&!state.value.brewWarning&&<p>{copy.noRecords}</p>}</section>
      <div className="bean-detail-actions button-pair"><Link className="secondary-button" href={`/beans/${encodeURIComponent(bean.id)}/edit`}>{copy.edit}</Link><Link className="primary-button" href={`/brew/prepare?beanId=${encodeURIComponent(bean.id)}&returnTo=${encodeURIComponent(`/beans/${bean.id}`)}`}>{copy.use}</Link></div>
    </>}
  </main>;
}
