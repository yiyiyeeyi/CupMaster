import { describe, expect, it } from "vitest";
import { createAnalysisFingerprint, mapRecommendationToSuggestedAdjustment, suggestedBrewPlanSchema } from "@/domain";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LOCAL_SUGGESTED_PLAN_KEY, LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { createBrewDraft, createQuickPrepareDefaults } from "./brew-factory";
import { SuggestedPlanService } from "./suggested-plan-service";

class MemoryStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error("quota"); this.values.set(key, value); }
}

const now = "2026-08-03T10:00:00.000Z";
function setup() {
  const brewStorage = new MemoryStorage();
  const planStorage = new MemoryStorage();
  const brews = new LocalBrewRepository(brewStorage);
  const plans = new LocalSuggestedPlanRepository(planStorage);
  const base = createBrewDraft(recipeFixtures[0], createQuickPrepareDefaults(recipeFixtures[0]), { now: () => now, createId: () => "source-brew" });
  const completed = { ...base, executionStatus: "completed" as const, recordStatus: "saved" as const, completedAt: now };
  const recommendation = {
    id: "rec-grind", title: "Go slightly coarser", description: "Test extraction with one controlled change.",
    confidence: "medium" as const, evidence: [{ field: "bitterness", label: "Bitterness", value: "5/5" }],
    priority: "high" as const, rationale: "Reported bitterness is high.", suggestedAdjustment: "Move one small step coarser.",
    action: { type: "adjust_grind" as const, direction: "coarser" as const, magnitude: "slight" as const },
  };
  const fingerprint = createAnalysisFingerprint(completed);
  const brew = { ...completed, analysisStatus: "completed" as const, analysis: { id: "analysis-1", brewId: completed.id, schemaVersion: 1 as const, status: "completed" as const, generatedAt: now, provider: "local", model: "rules-v1", sourceFingerprint: fingerprint, inputSummary: { dataQuality: { level: "partial" as const, missingFields: [], notes: ["User feedback available."] }, missingData: [] }, result: { summary: "Controlled next step", strengths: [], observations: [], possibleIssues: [], recommendations: [recommendation], dataQuality: { level: "partial" as const, missingFields: [], notes: ["User feedback available."] }, disclaimer: "Local preview only." } } };
  expect(brews.createDraft(brew).ok).toBe(true);
  let id = 0;
  const service = new SuggestedPlanService(brews, plans, { now: () => now, createId: () => `generated-${++id}` });
  return { brew, recommendation, brewStorage, planStorage, brews, plans, service };
}

describe("Suggested Plan", () => {
  it("maps only a supported machine-readable action", () => { const { brew, recommendation } = setup(); expect(mapRecommendationToSuggestedAdjustment(recommendation, brew.recipeSnapshot, () => "a")).toMatchObject({ ok: true, adjustment: { variable: "grind", direction: "coarser" } }); });
  it("rejects non-convertible recommendations", () => { const { brew, recommendation } = setup(); expect(mapRecommendationToSuggestedAdjustment({ ...recommendation, action: { type: "collect_more_data", fields: ["feedback"] } }, brew.recipeSnapshot, () => "a")).toMatchObject({ ok: false }); });
  it("creates one independent draft without mutating its source", () => { const { service, brews, brew } = setup(); const result = service.createFromRecommendation(brew.id, "rec-grind"); expect(result).toMatchObject({ ok: true, value: { status: "draft", sourceBrewId: brew.id } }); if (!result.ok) return; expect(result.value.adjustments).toHaveLength(1); expect(brews.getById(brew.id).value?.recipeSnapshot).toEqual(brew.recipeSnapshot); expect(result.value.baseRecipeSnapshot).not.toBe(brew.recipeSnapshot); });
  it("returns an existing plan for the same analysis fingerprint and recommendation", () => { const { service, brew } = setup(); const first = service.createFromRecommendation(brew.id, "rec-grind"); const second = service.createFromRecommendation(brew.id, "rec-grind"); expect(first.ok && second.ok && second.value.id).toBe(first.ok ? first.value.id : ""); expect(second).toMatchObject({ existing: true }); });
  it("creates a pending not-started Brew and persists its mapping without marking used", () => { const { service, plans, brew } = setup(); const plan = service.createFromRecommendation(brew.id, "rec-grind"); if (!plan.ok) throw new Error(plan.message); const result = service.createOrGetResultingBrew(plan.value.id); expect(result).toMatchObject({ ok: true, value: { executionStatus: "not_started", sourceType:"suggested_plan", suggestedPlanHandoff:{userDecision:"pending",confirmedAt:null} } }); expect(plans.getById(plan.value.id).value).toMatchObject({ status: "draft", usedAt:null, resultingBrewId:`suggested:${plan.value.id}` }); });
  it("is idempotent when Start This Brew is repeated", () => { const { service, brew, brews } = setup(); const plan = service.createFromRecommendation(brew.id, "rec-grind"); if (!plan.ok) throw new Error(plan.message); const first = service.createBrewDraftFromSuggestedPlan(plan.value.id); const second = service.createBrewDraftFromSuggestedPlan(plan.value.id); expect(first.ok && second.ok && second.value.id).toBe(first.ok ? first.value.id : ""); expect(second).toMatchObject({ existing: true }); expect(brews.listDrafts().value.filter((item) => item.id.startsWith("suggested:"))).toHaveLength(1); });
  it("handles damaged versioned storage safely", () => { const { planStorage, plans } = setup(); planStorage.values.set(LOCAL_SUGGESTED_PLAN_KEY, "{broken"); expect(plans.list()).toMatchObject({ ok: false, value: [] }); });
  it("rejects a plan with more than one adjustment", () => { const { service, brew } = setup(); const result = service.createFromRecommendation(brew.id, "rec-grind"); if (!result.ok) throw new Error(result.message); expect(suggestedBrewPlanSchema.safeParse({ ...result.value, adjustments: [result.value.adjustments[0], result.value.adjustments[0]] }).success).toBe(false); });
  it("accepts draft mapping and enforces used invariants",()=>{const{service,brew}=setup(),created=service.createFromRecommendation(brew.id,"rec-grind");if(!created.ok)throw new Error(created.message);const p=created.value;expect(suggestedBrewPlanSchema.safeParse({...p,resultingBrewId:"brew-1"}).success).toBe(true);expect(suggestedBrewPlanSchema.safeParse({...p,usedAt:now}).success).toBe(false);expect(suggestedBrewPlanSchema.safeParse({...p,status:"used",resultingBrewId:"brew-1",usedAt:now}).success).toBe(true);expect(suggestedBrewPlanSchema.safeParse({...p,status:"used",resultingBrewId:null,usedAt:now}).success).toBe(false)});
  it("marks a started resulting Brew used idempotently",()=>{const{service,brews,plans,brew}=setup(),p=service.createFromRecommendation(brew.id,"rec-grind");if(!p.ok)throw new Error(p.message);const made=service.createOrGetResultingBrew(p.value.id);if(!made.ok)throw new Error(made.message);const started={...made.value,executionStatus:"in_progress"as const,startedAt:now,currentStageStartedAt:now};brews.updateDraft(started);expect(service.markPlanUsedFromBrew(started.id)).toMatchObject({ok:true,value:{status:"used",usedAt:now,resultingBrewId:started.id}});expect(service.markPlanUsedFromBrew(started.id).ok).toBe(true);expect(plans.getById(p.value.id).value?.adjustments).toEqual(p.value.adjustments)});
  it("repairs a used Plan back to draft when its Brew has not started", () => { const { service, brews, plans, brew } = setup(); const created = service.createFromRecommendation(brew.id, "rec-grind"); if (!created.ok) throw new Error(created.message); const made = service.createOrGetResultingBrew(created.value.id); if (!made.ok) throw new Error(made.message); expect(plans.update({ ...created.value, resultingBrewId: made.value.id, status: "used", usedAt: now }).ok).toBe(true); const result = service.repairSuggestedPlanState(created.value.id); expect(result).toMatchObject({ ok: true, value: { status: "repaired", plan: { status: "draft", usedAt: null }, brew: { id: made.value.id } } }); expect(brews.getById(made.value.id).value).toEqual(made.value); });
  it("repairs a started Brew Plan to used and aligns usedAt", () => { const { service, brews, plans, brew } = setup(); const created = service.createFromRecommendation(brew.id, "rec-grind"); if (!created.ok) throw new Error(created.message); const made = service.createOrGetResultingBrew(created.value.id); if (!made.ok) throw new Error(made.message); const startedAt = "2026-08-03T11:00:00.000Z"; expect(brews.updateDraft({ ...made.value, executionStatus: "in_progress", startedAt, currentStageStartedAt: startedAt }).ok).toBe(true); const result = service.repairSuggestedPlanState(created.value.id); expect(result).toMatchObject({ ok: true, value: { status: "repaired", plan: { status: "used", usedAt: startedAt } } }); expect(plans.getById(created.value.id).value?.adjustments).toEqual(created.value.adjustments); });
  it("returns no_change when the Plan lifecycle is already aligned", () => { const { service, brew } = setup(); const created = service.createFromRecommendation(brew.id, "rec-grind"); if (!created.ok) throw new Error(created.message); const made = service.createOrGetResultingBrew(created.value.id); if (!made.ok) throw new Error(made.message); expect(service.repairSuggestedPlanState(created.value.id)).toMatchObject({ ok: true, value: { status: "no_change" } }); });
});
