"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {CollectionService} from "@/application/collection-service";
import {beanDisplayName} from "@/domain/beans";
import {formatRatio,formatDuration} from "@/domain";
import {beanCopy as copy} from "./bean-copy";
import "./collection.css";
export function CollectionHome(){
  const [service]=useState(()=>new CollectionService()),[state,setState]=useState<ReturnType<CollectionService["load"]>|null>(null),[tab,setTab]=useState<"beans"|"plans">("beans");
  const [selected,setSelected]=useState<string[]>([]),[error,setError]=useState<string|null>(null);
  const reload=()=>setState(service.load());
  useEffect(()=>{const refresh=()=>setState(service.load());const timer=setTimeout(refresh,0);window.addEventListener("storage",refresh);return()=>{clearTimeout(timer);window.removeEventListener("storage",refresh);};},[service]);
  function confirm(skip=false){const result=service.confirmImport(skip?[]:selected);if(!result.ok)setError(result.message);else{setError(null);setSelected([]);reload();}}
  return <main className="collection-page"><header><p className="eyebrow">COLLECTION</p><div><h1>Collection</h1>{state?.ok && <small>{state.value.beans.length} 包豆子</small>}</div></header>
    <nav className="collection-tabs" aria-label="Collection 分頁"><button type="button" aria-pressed={tab==="beans"} onClick={()=>setTab("beans")}>豆子</button><button type="button" aria-pressed={tab==="plans"} onClick={()=>setTab("plans")}>方案</button></nav>
    {!state?<p role="status">正在讀取 Collection…</p>:!state.ok?<p role="alert">{state.message}<button type="button" onClick={reload}>{copy.retry}</button></p>:<>
      {error && <p role="alert">{error}</p>}{state.value.brewWarning && <p role="status">{state.value.brewWarning}</p>}
      {state.value.pending.map(bean=><p role="status" key={bean.id}>豆子已刪除，部分連結待解除。<button type="button" onClick={()=>{const result=service.retryUnlink(bean.id);if(!result.ok)setError(result.message);else{setError(null);reload();}}}>{copy.retry}</button></p>)}
      {tab==="beans"?<>
        {state.value.candidates.length>0 && <section className="bean-import" aria-labelledby="bean-import-title"><h2 id="bean-import-title">{copy.importTitle}</h2><p>{copy.importBody}</p>
          <button type="button" onClick={()=>setSelected(state.value.candidates.map(item=>item.key))}>{copy.all}</button>
          {state.value.candidates.map(item=><label key={item.key}><input type="checkbox" checked={selected.includes(item.key)} onChange={()=>setSelected(current=>current.includes(item.key)?current.filter(key=>key!==item.key):[...current,item.key])}/><span>{item.input.name}{item.input.roaster && <small> · {item.input.roaster}</small>}</span></label>)}
          <div className="button-pair"><button className="secondary-button" type="button" onClick={()=>confirm(true)}>{copy.skip}</button><button className="primary-button" type="button" disabled={!selected.length} onClick={()=>confirm()}>{copy.import}</button></div>
        </section>}
        <div className="bean-wall">{state.value.cards.map(({bean,count,best})=><article className="bean-card" key={bean.id}><Link className="bean-detail-link" href={`/beans/${encodeURIComponent(bean.id)}`}><div className="bean-text-tile"><span>{beanDisplayName(bean)}</span>{bean.roaster && <small>{bean.roaster}</small>}</div><h2>{beanDisplayName(bean)}</h2></Link>{count!==undefined && <p>沖過 {count} 次{best!==undefined&&` · 最佳 ${best}/5`}</p>}<Link href={`/beans/${encodeURIComponent(bean.id)}/edit`}>{copy.edit}</Link></article>)}
          <Link className="bean-add-tile" href="/beans/new">{copy.add}</Link>
        </div>
      </>:<section className="collection-plans">{state.value.preparationError?<p role="alert">{state.value.preparationError}</p>:state.value.preparations.length?state.value.preparations.map(plan=><Link key={plan.id} href={`/brew/prepare?preparationId=${encodeURIComponent(plan.id)}&returnTo=%2Fcollection`}><h2>{plan.snapshot.title}</h2>{plan.snapshot.bean?.name && <p>{plan.snapshot.bean.name}</p>}<small>{formatRatio(plan.snapshot.doseGrams.value,plan.snapshot.totalWaterGrams.value)} · {formatDuration(plan.snapshot.expectedTimeSeconds.value)}</small><span>照這個沖 →</span></Link>):<p>還沒有方案，可在 Quick Prepare 先存起來。</p>}</section>}
    </>}
  </main>;
}
