"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Brew, SuggestedBrewPlan } from "@/domain";
import { getSuggestedPlanExecutionProjection } from "@/application/suggested-plan-projection";
import { SuggestedPlanService } from "@/application/suggested-plan-service";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";

type State = { status: "loading" } | { status: "missing"; message: string } | { status: "ready"; plan: SuggestedBrewPlan; brew: Brew | null; message?: string };

export function SuggestedPlanDetail({ planId }: { planId: string }) {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback((message?: string) => {
    const plans = new LocalSuggestedPlanRepository();
    const brews = new LocalBrewRepository();
    const result = plans.getById(planId);
    if (!result.ok || !result.value) { setState({ status: "missing", message: result.ok ? "Suggested Plan not found." : result.message }); return; }
    const bySource = brews.findBySourceSuggestedPlanId(planId);
    const mapped = result.value.resultingBrewId ? brews.getById(result.value.resultingBrewId).value : null;
    setState({ status: "ready", plan: result.value, brew: mapped ?? bySource.value, ...(message && { message }) });
  }, [planId]);
  useEffect(() => { const timer = setTimeout(() => load(), 0); return () => clearTimeout(timer); }, [load]);
  if (state.status === "loading") return <main className="route-loading"><h1>Loading Next Try…</h1></main>;
  if (state.status === "missing") return <main className="state-page"><h1>Suggested Plan unavailable.</h1><p>{state.message}</p><Link href="/journal">Back to Journal</Link></main>;

  const projection = getSuggestedPlanExecutionProjection(state.plan, state.brew);
  const currentPlan = state.plan;
  const currentBrew = state.brew;
  const adjustment = state.plan.adjustments[0];
  function act() {
    if (lock.current) return;
    if (projection.targetRoute && !projection.isRepairRequired) { router.push(projection.targetRoute); return; }
    lock.current = true; setBusy(true);
    const service = new SuggestedPlanService(new LocalBrewRepository(), new LocalSuggestedPlanRepository());
    if (projection.isRepairRequired) {
      const result = service.repairSuggestedPlanState(planId);
      lock.current = false; setBusy(false);
      if (result.ok) load(result.value.status === "no_change" ? "Plan and Brew status are already aligned." : "Next Try status repaired. Review the updated state below.");
      else setState({ status: "ready", plan: currentPlan, brew: currentBrew, message: result.message });
      return;
    }
    const result = service.createOrGetResultingBrew(planId);
    lock.current = false; setBusy(false);
    if (result.ok) router.push(`/brew/${result.value.id}/prepare`);
    else setState({ status: "ready", plan: currentPlan, brew: currentBrew, message: result.message });
  }
  return <main className="plan-detail-page">
    <div className="summary-topbar"><Link aria-label="Back to analysis" href={`/journal/${state.plan.sourceBrewId}/analysis`}>←</Link><h1>Next Try</h1><span /></div>
    <header><p className="preview-badge">{projection.label}</p><h2>{state.plan.title}</h2><p>Plan {state.plan.status}{state.brew ? ` · Brew ${state.brew.executionStatus.replaceAll("_", " ")}` : " · No linked Brew"}</p></header>
    {state.message && <p className="notice" role="status">{state.message}</p>}
    <section className="plan-detail-table"><div><span>Single adjustment</span><strong>{adjustment.variable.replaceAll("_", " ")}</strong></div><div><span>Original</span><strong>{String(adjustment.previousValue)}{adjustment.unit}</strong></div><div><span>Suggested</span><strong>{String(adjustment.suggestedValue)}{adjustment.unit}</strong></div><div><span>Rationale</span><strong>{state.plan.rationale}</strong></div></section>
    {projection.isRepairRequired && <p className="warning-note">The Plan lifecycle and resulting Brew execution no longer agree. Repair aligns only their link, status, and usage time; it does not clear brewing data.</p>}
    <div className="plan-actions"><button className="primary-button" disabled={busy} onClick={act} type="button">{busy ? "Working…" : projection.primaryAction}</button><Link className="secondary-button" href={`/journal/${state.plan.sourceBrewId}`}>View Source Brew</Link></div>
  </main>;
}
