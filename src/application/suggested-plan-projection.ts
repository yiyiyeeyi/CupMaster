import type { Brew, SuggestedBrewPlan, SuggestedPlanAdjustment, SuggestedPlanHandoff } from "@/domain";

export type PlanExecutionState = "ready_to_prepare" | "preparation_pending" | "ready_to_brew" | "in_progress" | "completed" | "needs_repair";
const copy = {
  ready_to_prepare: ["Ready to prepare", "Prepare This Brew"], preparation_pending: ["Preparation pending", "Continue Preparing"],
  ready_to_brew: ["Ready to brew", "View Ready Brew"], in_progress: ["In progress", "Continue Brew"],
  completed: ["Completed", "View Brew Record"], needs_repair: ["Needs repair", "Repair Next Try Status"],
} as const;

export function getSuggestedPlanExecutionProjection(plan: SuggestedBrewPlan, brew: Brew | null) {
  let state: PlanExecutionState;
  if (!plan.resultingBrewId) state = brew ? "needs_repair" : "ready_to_prepare";
  else if (!brew || brew.sourceSuggestedPlanId !== plan.id || (plan.status === "used" && brew.executionStatus === "not_started") || (brew.executionStatus !== "not_started" && brew.startedAt && (plan.status !== "used" || plan.usedAt !== brew.startedAt))) state = "needs_repair";
  else if (brew.executionStatus === "completed") state = "completed";
  else if (brew.executionStatus === "in_progress" || brew.executionStatus === "paused") state = "in_progress";
  else if (brew.executionStatus === "not_started" && brew.suggestedPlanHandoff?.userDecision === "pending") state = "preparation_pending";
  else if (brew.executionStatus === "not_started" && brew.suggestedPlanHandoff?.confirmedAt) state = "ready_to_brew";
  else state = "needs_repair";
  const id = brew?.id;
  const targetRoute = state === "ready_to_prepare" ? null : state === "preparation_pending" && id ? `/brew/${id}/prepare` : state === "completed" && id ? `/journal/${id}` : id ? `/brew/${id}` : null;
  return { state, label: copy[state][0], primaryAction: copy[state][1], targetRoute, isRepairRequired: state === "needs_repair" };
}

export function getSuggestedPlanHandoffProjection(brew: Brew) {
  if (brew.sourceType !== "suggested_plan") return "not_applicable" as const;
  const handoff = brew.suggestedPlanHandoff;
  if (!handoff) return "legacy_pending" as const;
  if (handoff.suggestedPlanId !== brew.sourceSuggestedPlanId) return "inconsistent" as const;
  return handoff.userDecision;
}

export function getSuggestedPlanSyncStateForBrew(brew: Brew, plan: SuggestedBrewPlan | null) {
  if (brew.sourceType !== "suggested_plan") return "not_applicable" as const;
  if (!plan) return "plan_missing" as const;
  if (plan.resultingBrewId !== brew.id) return "inconsistent" as const;
  if ((brew.executionStatus === "in_progress" || brew.executionStatus === "completed") && brew.startedAt && (plan.status !== "used" || plan.usedAt !== brew.startedAt)) return "needs_sync" as const;
  return "synced" as const;
}

function displayValue(value: string | number | null, unit: string | null) {
  return value === null ? "Not recorded" : `${String(value)}${unit ?? ""}`;
}

export function formatSuggestedPlanAdjustmentSummary(handoff: SuggestedPlanHandoff | null | undefined) {
  if (!handoff) return "Suggested adjustment details unavailable";
  const label = { grind: "Grind", water_temperature: "Temperature", target_total_time: "Target time", stage_duration: "Stage duration" }[handoff.variable];
  return `${label} · ${displayValue(handoff.originalValue, handoff.unit)} → ${displayValue(handoff.suggestedValue, handoff.unit)}`;
}

export function formatPlanAdjustmentSummary(adjustment: SuggestedPlanAdjustment | undefined) {
  if (!adjustment) return "Adjustment details unavailable";
  const label = { grind: "Grind", water_temperature: "Temperature", target_total_time: "Target time", stage_duration: "Stage duration" }[adjustment.variable];
  return `${label} · ${displayValue(adjustment.previousValue, adjustment.unit)} → ${displayValue(adjustment.suggestedValue, adjustment.unit)}`;
}

export type SourceBrewSuggestedPlanProjection = {
  hasSuggestedPlans: boolean;
  totalPlans: number;
  plans: SuggestedBrewPlan[];
  items: { plan: SuggestedBrewPlan; resultingBrew: Brew | null; execution: ReturnType<typeof getSuggestedPlanExecutionProjection> }[];
  latestPlan: SuggestedBrewPlan | null;
  latestResultingBrew: Brew | null;
  latestExecutionProjection: ReturnType<typeof getSuggestedPlanExecutionProjection> | null;
  latestAdjustmentSummary: string | null;
  latestHandoffDecision: ReturnType<typeof getSuggestedPlanHandoffProjection> | null;
  latestAction: { label: string; href: string } | null;
  hasPartialDataWarning: boolean;
};

export function sortSuggestedPlans(plans: SuggestedBrewPlan[]) {
  return [...plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function getSourceBrewSuggestedPlanProjection(
  sourceBrew: Brew,
  plans: SuggestedBrewPlan[],
  brewsById: ReadonlyMap<string, Brew>,
  hasPartialDataWarning = false,
): SourceBrewSuggestedPlanProjection {
  const sortedPlans = sortSuggestedPlans(plans.filter((plan) => plan.sourceBrewId === sourceBrew.id));
  const items = sortedPlans.map((plan) => { const resultingBrew = plan.resultingBrewId ? brewsById.get(plan.resultingBrewId) ?? null : null; return { plan, resultingBrew, execution: getSuggestedPlanExecutionProjection(plan, resultingBrew) }; });
  const latestPlan = sortedPlans[0] ?? null;
  const latestResultingBrew = latestPlan?.resultingBrewId ? brewsById.get(latestPlan.resultingBrewId) ?? null : null;
  const execution = latestPlan ? getSuggestedPlanExecutionProjection(latestPlan, latestResultingBrew) : null;
  const action = !latestPlan || !execution ? null : execution.state === "preparation_pending" && execution.targetRoute
    ? { label: "Continue preparation", href: execution.targetRoute }
    : execution.state === "ready_to_brew" && execution.targetRoute
      ? { label: "View ready brew", href: execution.targetRoute }
      : execution.state === "in_progress" && execution.targetRoute
        ? { label: "Continue brew", href: execution.targetRoute }
        : execution.state === "completed" && execution.targetRoute
          ? { label: "View result", href: execution.targetRoute }
          : { label: "View Next Try", href: `/plans/${latestPlan.id}` };
  return {
    hasSuggestedPlans: sortedPlans.length > 0, totalPlans: sortedPlans.length, plans: sortedPlans, items,
    latestPlan, latestResultingBrew, latestExecutionProjection: execution,
    latestAdjustmentSummary: latestPlan ? formatPlanAdjustmentSummary(latestPlan.adjustments[0]) : null,
    latestHandoffDecision: latestResultingBrew ? getSuggestedPlanHandoffProjection(latestResultingBrew) : null,
    latestAction: action, hasPartialDataWarning,
  };
}

export function getJournalBrewProjection(brew: Brew) {
  const isSuggestedPlanBrew = brew.sourceType === "suggested_plan";
  const decision = getSuggestedPlanHandoffProjection(brew);
  const handoffLabel = !isSuggestedPlanBrew ? null : decision === "accepted" ? "Accepted" : decision === "overridden" ? "Overridden" : decision === "pending" || decision === "legacy_pending" ? "Review required" : "Needs repair";
  if (brew.executionStatus === "not_started") {
    const ready = isSuggestedPlanBrew && (decision === "accepted" || decision === "overridden");
    return { isSuggestedPlanBrew, sourceLabel: isSuggestedPlanBrew ? "Next Try" : null, handoffLabel, adjustmentSummary: isSuggestedPlanBrew ? formatSuggestedPlanAdjustmentSummary(brew.suggestedPlanHandoff) : null, statusLabel: ready ? "Ready to brew" : "Preparation pending", actionLabel: ready ? "Start brew" : "Continue preparation", targetRoute: ready ? `/brew/${brew.id}` : `/brew/${brew.id}/prepare` };
  }
  if (brew.executionStatus === "in_progress" || brew.executionStatus === "paused") return { isSuggestedPlanBrew, sourceLabel: isSuggestedPlanBrew ? "Next Try" : null, handoffLabel, adjustmentSummary: isSuggestedPlanBrew ? formatSuggestedPlanAdjustmentSummary(brew.suggestedPlanHandoff) : null, statusLabel: "In progress", actionLabel: "Continue brew", targetRoute: `/brew/${brew.id}` };
  return { isSuggestedPlanBrew, sourceLabel: isSuggestedPlanBrew ? "Next Try" : null, handoffLabel, adjustmentSummary: isSuggestedPlanBrew ? formatSuggestedPlanAdjustmentSummary(brew.suggestedPlanHandoff) : null, statusLabel: brew.executionStatus === "completed" ? "Completed" : "Stopped", actionLabel: "View brew", targetRoute: `/journal/${brew.id}` };
}
