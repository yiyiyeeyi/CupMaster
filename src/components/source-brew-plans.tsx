"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Brew } from "@/domain";
import type { SourceBrewSuggestedPlanProjection } from "@/application/suggested-plan-projection";
import { formatPlanAdjustmentSummary } from "@/application/suggested-plan-projection";
import { JournalLoader } from "@/application/journal-loader";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";

type Ready = { brew: Brew; projection: SourceBrewSuggestedPlanProjection };
export function SourceBrewPlans({ brewId }: { brewId: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "missing"; message: string } | ({ status: "ready" } & Ready)>({ status: "loading" });
  useEffect(() => { const timer = setTimeout(() => { const result = new JournalLoader(new LocalBrewRepository(), new LocalSuggestedPlanRepository()).getSuggestedPlansForSourceBrew(brewId); setState(result.ok ? { status: "ready", brew: result.brew, projection: result.projection } : { status: "missing", message: result.message }); }, 0); return () => clearTimeout(timer); }, [brewId]);
  if (state.status === "loading") return <main className="route-loading"><h1>Loading Next Tries…</h1></main>;
  if (state.status === "missing") return <main className="state-page"><h1>Source Brew unavailable.</h1><p>{state.message}</p><Link href="/journal">Back to Journal</Link></main>;
  return <main className="source-plans-page"><div className="summary-topbar"><Link aria-label="Back to Brew Detail" href={`/journal/${brewId}`}>←</Link><h1>Next Tries</h1><span /></div><header><p className="eyebrow">Source Brew</p><h2>{state.brew.recipeSnapshot.title}</h2></header>{state.projection.hasPartialDataWarning && <p className="notice">Some resulting Brew links could not be loaded.</p>}{state.projection.items.length === 0 ? <section className="empty-state"><h2>No Next Tries yet.</h2><Link className="secondary-button" href={`/journal/${brewId}`}>Back to Brew Detail</Link></section> : <div className="source-plan-list">{state.projection.items.map(({ plan, resultingBrew, execution }) => { const href = execution.targetRoute ?? `/plans/${plan.id}`; const decision = resultingBrew?.suggestedPlanHandoff?.userDecision; return <Link className="source-plan-card" href={execution.isRepairRequired ? `/plans/${plan.id}` : href} key={plan.id}><span>{execution.label}{decision ? ` · ${decision}` : ""}</span><h2>{plan.title}</h2><p>{formatPlanAdjustmentSummary(plan.adjustments[0])}</p><small>{new Date(plan.createdAt).toLocaleString()} · Plan {plan.status}</small><strong>{execution.isRepairRequired || execution.state === "ready_to_prepare" ? "View Next Try" : execution.primaryAction}</strong></Link>; })}</div>}</main>;
}
