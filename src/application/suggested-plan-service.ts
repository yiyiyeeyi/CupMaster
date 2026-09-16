import type {
  Brew,
  BrewPlan,
  BrewRecipeSnapshot,
  SuggestedBrewPlan,
  SuggestedPlanAdjustment,
} from "@/domain";
import {
  applySuggestedPlanAdjustment,
  cloneRecipeSnapshot,
  isAnalysisOutdated,
  mapRecommendationToSuggestedAdjustment,
  suggestedBrewPlanSchema,
} from "@/domain";
import type { BrewRepository } from "@/repositories/brew-repository";
import type { SuggestedPlanRepository } from "@/repositories/suggested-plan-repository";
import { createUniqueId } from "./brew-factory";

export type SuggestedPlanErrorCode =
  | "brew_not_found" | "invalid_execution_status" | "analysis_not_found"
  | "recommendation_not_found" | "recommendation_not_convertible"
  | "suggested_plan_not_found" | "suggested_plan_already_used"
  | "invalid_adjustment" | "invalid_suggested_plan" | "inconsistent_plan_mapping" | "duplicate_resulting_brew" | "resulting_brew_missing" | "legacy_used_without_resulting_brew" | "persistence_failed";

export type SuggestedPlanRepairChange =
  | "resulting_brew_id_repaired"
  | "reverted_to_draft"
  | "marked_used"
  | "used_at_aligned";

export type SuggestedPlanRepairValue =
  | { status: "no_change"; plan: SuggestedBrewPlan; brew: Brew | null }
  | { status: "repaired"; plan: SuggestedBrewPlan; brew: Brew; changes: SuggestedPlanRepairChange[] };

export type SuggestedPlanResult<T> =
  | { ok: true; value: T; existing?: boolean; outdated?: boolean }
  | { ok: false; code: SuggestedPlanErrorCode; message: string };

export interface SuggestedPlanServiceDependencies {
  now?: () => string;
  createId?: () => string;
}

export class SuggestedPlanService {
  constructor(
    private readonly brewRepository: BrewRepository,
    private readonly planRepository: SuggestedPlanRepository,
    private readonly dependencies: SuggestedPlanServiceDependencies = {},
  ) {}

  private now() { return this.dependencies.now?.() ?? new Date().toISOString(); }
  private id() { return this.dependencies.createId?.() ?? createUniqueId(); }

  previewRecommendation(brewId: string, recommendationId: string): SuggestedPlanResult<{
    brew: Brew;
    recommendation: NonNullable<Brew["analysis"]>["result"]["recommendations"][number];
    adjustment: SuggestedPlanAdjustment;
  }> {
    const read = this.brewRepository.getById(brewId);
    if (!read.ok && !read.value) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "The source Brew no longer exists." };
    if (brew.executionStatus !== "completed") return { ok: false, code: "invalid_execution_status", message: "Complete the Brew before creating a Next Try." };
    if (!brew.analysis) return { ok: false, code: "analysis_not_found", message: "Generate an Analysis before creating a Next Try." };
    const recommendation = brew.analysis.result.recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) return { ok: false, code: "recommendation_not_found", message: "The selected recommendation no longer exists." };
    const mapped = mapRecommendationToSuggestedAdjustment(recommendation, brew.recipeSnapshot, () => "preview-adjustment");
    if (!mapped.ok) return { ok: false, code: "recommendation_not_convertible", message: mapped.reason };
    return { ok: true, value: { brew, recommendation, adjustment: mapped.adjustment }, outdated: isAnalysisOutdated(brew) };
  }

  createFromRecommendation(brewId: string, recommendationId: string): SuggestedPlanResult<SuggestedBrewPlan> {
    const preview = this.previewRecommendation(brewId, recommendationId);
    if (!preview.ok) return preview;
    const { brew, recommendation } = preview.value;
    const analysis = brew.analysis!;
    const existing = this.planRepository.listBySourceBrewId(brewId);
    if (!existing.ok) return { ok: false, code: "persistence_failed", message: existing.message };
    const match = existing.value.find((plan) => plan.sourceAnalysisId === analysis.id && plan.sourceRecommendationId === recommendationId && plan.sourceFingerprint === analysis.sourceFingerprint);
    if (match) return { ok: true, value: match, existing: true, outdated: preview.outdated };
    const mapped = mapRecommendationToSuggestedAdjustment(recommendation, brew.recipeSnapshot, () => this.id());
    if (!mapped.ok) return { ok: false, code: "recommendation_not_convertible", message: mapped.reason };
    const now = this.now();
    const plan: SuggestedBrewPlan = {
      id: this.id(), sourceBrewId: brew.id, sourceAnalysisId: analysis.id,
      sourceRecommendationId: recommendation.id, sourceFingerprint: analysis.sourceFingerprint,
      sourceAnalysisGeneratedAt: analysis.generatedAt, title: `${brew.recipeSnapshot.title} · Next Try`,
      status: "draft", baseRecipeSnapshot: cloneRecipeSnapshot(brew.recipeSnapshot),
      adjustments: [mapped.adjustment], rationale: recommendation.rationale,
      confidence: recommendation.confidence, evidence: recommendation.evidence.map((item) => ({ ...item })),
      keepUnchanged: ["Dose", "Water total", "Pour sequence", "All variables except the selected adjustment"],
      createdAt: now, updatedAt: now, usedAt: null, resultingBrewId: null,
    };
    const parsed = suggestedBrewPlanSchema.safeParse(plan);
    if (!parsed.success) return { ok: false, code: "invalid_suggested_plan", message: parsed.error.issues[0]?.message ?? "The Suggested Plan is invalid." };
    const saved = this.planRepository.create(parsed.data);
    return saved.ok ? { ok: true, value: saved.value, outdated: preview.outdated } : { ok: false, code: "persistence_failed", message: saved.message };
  }

  getSuggestedPlan(planId: string): SuggestedPlanResult<SuggestedBrewPlan> {
    const read = this.planRepository.getById(planId);
    if (!read.ok) return { ok: false, code: "persistence_failed", message: read.message };
    return read.value ? { ok: true, value: read.value } : { ok: false, code: "suggested_plan_not_found", message: "The Suggested Plan could not be found." };
  }

  listSuggestedPlans() {
    const read = this.planRepository.list();
    return read.ok ? { ok: true as const, value: read.value } : { ok: false as const, code: "persistence_failed" as const, message: read.message };
  }

  listSuggestedPlansForBrew(brewId: string) {
    const read = this.planRepository.listBySourceBrewId(brewId);
    return read.ok ? { ok: true as const, value: read.value } : { ok: false as const, code: "persistence_failed" as const, message: read.message };
  }

  syncSuggestedPlanUsageFromBrew(brewId:string):SuggestedPlanResult<SuggestedBrewPlan>{const read=this.brewRepository.getById(brewId);if(!read.ok||!read.value)return{ok:false,code:read.ok?"brew_not_found":"persistence_failed",message:read.ok?"The resulting Brew could not be found.":read.message};const brew=read.value;if(brew.sourceType!=="suggested_plan"||!brew.sourceSuggestedPlanId||!brew.startedAt)return{ok:false,code:"invalid_execution_status",message:"The Suggested Plan can only be marked used after its confirmed Brew starts."};const plan=this.planRepository.getById(brew.sourceSuggestedPlanId);if(!plan.ok)return{ok:false,code:"persistence_failed",message:plan.message};if(!plan.value)return{ok:false,code:"suggested_plan_not_found",message:"The source Suggested Plan could not be found."};if(plan.value.status==="used")return{ok:true,value:plan.value,existing:true};const marked=this.planRepository.markUsed(plan.value.id,brew.id,brew.startedAt);return marked.ok?{ok:true,value:marked.value}:{ok:false,code:"persistence_failed",message:marked.message}}

  createOrGetResultingBrew(planId: string): SuggestedPlanResult<Brew> {
    const planRead = this.planRepository.getById(planId);
    if (!planRead.ok) return { ok: false, code: "persistence_failed", message: planRead.message };
    const plan = planRead.value;
    if (!plan) return { ok: false, code: "suggested_plan_not_found", message: "The Suggested Plan could not be found." };
    if(plan.resultingBrewId){const mapped=this.brewRepository.getById(plan.resultingBrewId);if(!mapped.ok)return{ok:false,code:"persistence_failed",message:mapped.message};if(!mapped.value)return{ok:false,code:"resulting_brew_missing",message:"The Plan points to a Brew that no longer exists."};if(mapped.value.sourceSuggestedPlanId!==plan.id)return{ok:false,code:"inconsistent_plan_mapping",message:"Plan and Brew source mapping do not agree."};return{ok:true,value:mapped.value,existing:true}}
    const bySource=this.brewRepository.findBySourceSuggestedPlanId(plan.id);if(!bySource.ok)return{ok:false,code:bySource.message==="duplicate_resulting_brew"?"duplicate_resulting_brew":"persistence_failed",message:bySource.message};if(bySource.value){const repaired=this.planRepository.update({...plan,resultingBrewId:bySource.value.id,status:"draft",usedAt:null,updatedAt:this.now()});return repaired.ok?{ok:true,value:bySource.value,existing:true}:{ok:false,code:"persistence_failed",message:repaired.message}}
    if (plan.status === "used" && plan.resultingBrewId) {
      const existing = this.brewRepository.getById(plan.resultingBrewId);
      if (existing.value) return { ok: true, value: existing.value, existing: true };
      return { ok: false, code: "suggested_plan_already_used", message: "This Plan is marked used, but its resulting Brew is unavailable." };
    }
    const resultingBrewId = `suggested:${plan.id}`;
    const existing = this.brewRepository.getById(resultingBrewId);
    if (existing.value) {
      return { ok: true, value: existing.value, existing: true };
    }
    let snapshot: BrewRecipeSnapshot;
    try { snapshot = applySuggestedPlanAdjustment(plan.baseRecipeSnapshot, plan.adjustments[0]); }
    catch (error) { return { ok: false, code: "invalid_adjustment", message: error instanceof Error ? error.message : "The adjustment could not be applied." }; }
    const adjustment = plan.adjustments[0];
    if (adjustment.variable === "water_temperature") snapshot.temperatureCelsius = { ...snapshot.temperatureCelsius, suggestedPlanValue: snapshot.temperatureCelsius.value, source: "suggested_plan" };
    if (adjustment.variable === "grind" && snapshot.grindDescription) snapshot.grindDescription = { ...snapshot.grindDescription, suggestedPlanValue: snapshot.grindDescription.value, source: "suggested_plan" };
    const now = this.now();
    snapshot = { ...snapshot, title: `${plan.baseRecipeSnapshot.title} · Next Try`, recipeType: "suggested_plan", createdAt: now };
    const sourceRecipeId = snapshot.sourceRecipeId ?? `suggested-plan:${plan.id}`;
    const brewPlan: BrewPlan = {
      id: `${resultingBrewId}:plan`, sourceRecipeId, sourceRecipeVersion: snapshot.sourceRecipeVersion ?? 1,
      recipeTitle: snapshot.title, method: snapshot.method, coffeeDose: { ...snapshot.doseGrams },
      waterTotal: { ...snapshot.totalWaterGrams }, waterTemperature: { ...snapshot.temperatureCelsius },
      ratio: snapshot.ratio, dripper: { ...snapshot.dripper },
      ...(snapshot.grindDescription && { grindSetting: { ...snapshot.grindDescription } }),
      ...(snapshot.bean && { beanMetadata: { name: snapshot.bean.name } }),
      ...(snapshot.equipment?.notes && { equipmentNotes: snapshot.equipment.notes }),
      ...(snapshot.userGoal && { userGoal: snapshot.userGoal }), expectedTotalTime: snapshot.expectedTimeSeconds.value,
      stages: snapshot.steps.map((step) => ({ id: step.id, order: step.order, title: step.title, targetWaterGrams: step.targetWaterGrams, targetDurationSeconds: step.durationSeconds, pattern: step.pattern, instruction: step.instruction })),
      createdAt: now,
    };
    const brew: Brew = {
      id: resultingBrewId, sourceRecipeId, sourceType: "suggested_plan", sourceSuggestedPlanId: plan.id,
      sourceBrewId: plan.sourceBrewId, sourceAnalysisId: plan.sourceAnalysisId,
      sourceRecommendationId: plan.sourceRecommendationId, sourceFingerprint: plan.sourceFingerprint,
      suggestedPlanHandoff: { suggestedPlanId: plan.id, adjustmentId: plan.adjustments[0].id,
        variable: plan.adjustments[0].variable, originalValue: plan.adjustments[0].previousValue,
        suggestedValue: plan.adjustments[0].suggestedValue, unit: plan.adjustments[0].unit,
        description: plan.adjustments[0].description, rationale: plan.rationale,
        confidence: plan.confidence, evidence: plan.evidence.map((item) => ({ ...item })),
        userDecision: "pending", confirmedAt: null }, brewPlan, recipeSnapshot: snapshot,
      executionStatus: "not_started", recordStatus: "draft", feedbackStatus: "not_requested", analysisStatus: "not_requested",
      analysis: null, analysisAttempt: null, currentStageOrder: 0, currentStageStartedAt: null, stageResults: [],
      flavorFeedback: null, recordDetails: null, actualTotalTimeSeconds: null, actualTotalWater: null,
      startedAt: null, completedAt: null, pausedAt: null, accumulatedPauseSeconds: 0, createdAt: now, updatedAt: now,
    };
    const created = this.brewRepository.createDraft(brew);
    if (!created.ok) {
      const retryRead = this.brewRepository.getById(resultingBrewId);
      if (!retryRead.value) return { ok: false, code: "persistence_failed", message: created.message };
    }
    const resulting = created.ok ? created.value : this.brewRepository.getById(resultingBrewId).value!;
    const linked=this.planRepository.update({...plan,resultingBrewId:resulting.id,status:"draft",usedAt:null,updatedAt:now});
    return linked.ok?{ok:true,value:resulting}:{ok:false,code:"persistence_failed",message:linked.message};
  }
  createBrewDraftFromSuggestedPlan(planId:string){return this.createOrGetResultingBrew(planId)}
  markPlanUsedFromBrew(brewId:string){return this.syncSuggestedPlanUsageFromBrew(brewId)}
  repairSuggestedPlanState(planId: string): SuggestedPlanResult<SuggestedPlanRepairValue> {
    const planRead = this.planRepository.getById(planId);
    if (!planRead.ok) return { ok: false, code: "persistence_failed", message: planRead.message };
    const plan = planRead.value;
    if (!plan) return { ok: false, code: "suggested_plan_not_found", message: "The Suggested Plan could not be found." };

    const sourceRead = this.brewRepository.findBySourceSuggestedPlanId(plan.id);
    if (!sourceRead.ok) return {
      ok: false,
      code: sourceRead.message === "duplicate_resulting_brew" ? "duplicate_resulting_brew" : "persistence_failed",
      message: sourceRead.message,
    };

    let brew: Brew | null = null;
    const changes: SuggestedPlanRepairChange[] = [];
    if (plan.resultingBrewId) {
      const mappedRead = this.brewRepository.getById(plan.resultingBrewId);
      if (!mappedRead.ok) return { ok: false, code: "persistence_failed", message: mappedRead.message };
      brew = mappedRead.value;
      if (!brew) {
        if (!sourceRead.value) return { ok: false, code: "resulting_brew_missing", message: "The Plan points to a Brew that no longer exists." };
        brew = sourceRead.value;
        changes.push("resulting_brew_id_repaired");
      } else if (sourceRead.value && sourceRead.value.id !== brew.id) {
        return { ok: false, code: "inconsistent_plan_mapping", message: "More than one Brew mapping conflicts with this Suggested Plan." };
      }
    } else {
      if (plan.status === "used") return { ok: false, code: "legacy_used_without_resulting_brew", message: "This legacy used Plan has no resulting Brew link and cannot be repaired automatically." };
      brew = sourceRead.value;
      if (!brew) return { ok: true, value: { status: "no_change", plan, brew: null } };
      changes.push("resulting_brew_id_repaired");
    }

    if (brew.sourceType !== "suggested_plan" || brew.sourceSuggestedPlanId !== plan.id) {
      return { ok: false, code: "inconsistent_plan_mapping", message: "Plan and Brew source mapping do not agree." };
    }
    const claimed = this.planRepository.findByResultingBrewId(brew.id);
    if (!claimed.ok) return { ok: false, code: "persistence_failed", message: claimed.message };
    if (claimed.value && claimed.value.id !== plan.id) {
      return { ok: false, code: "inconsistent_plan_mapping", message: "The resulting Brew is already linked to another Suggested Plan." };
    }

    let status = plan.status;
    let usedAt = plan.usedAt;
    if (brew.executionStatus === "not_started") {
      if (status !== "draft") { status = "draft"; changes.push("reverted_to_draft"); }
      if (usedAt !== null) { usedAt = null; changes.push("used_at_aligned"); }
    } else if (["in_progress", "paused", "completed", "abandoned"].includes(brew.executionStatus)) {
      if (!brew.startedAt) return { ok: false, code: "invalid_execution_status", message: "The Brew execution state is missing its start time." };
      if (status !== "used") { status = "used"; changes.push("marked_used"); }
      if (usedAt !== brew.startedAt) { usedAt = brew.startedAt; changes.push("used_at_aligned"); }
    } else {
      return { ok: false, code: "invalid_execution_status", message: "The Brew execution state cannot be repaired safely." };
    }

    const resultingBrewId = brew.id;
    if (plan.resultingBrewId !== resultingBrewId && !changes.includes("resulting_brew_id_repaired")) changes.push("resulting_brew_id_repaired");
    if (changes.length === 0) return { ok: true, value: { status: "no_change", plan, brew } };
    const saved = this.planRepository.update({ ...plan, resultingBrewId, status, usedAt, updatedAt: this.now() });
    return saved.ok
      ? { ok: true, value: { status: "repaired", plan: saved.value, brew, changes } }
      : { ok: false, code: "persistence_failed", message: saved.message };
  }
  repairResultingBrewMapping(planId:string){const plan=this.planRepository.getById(planId);if(!plan.ok)return{ok:false as const,code:"persistence_failed" as const,message:plan.message};if(!plan.value)return{ok:false as const,code:"suggested_plan_not_found" as const,message:"Plan not found."};const brew=this.brewRepository.findBySourceSuggestedPlanId(planId);if(!brew.ok)return{ok:false as const,code:(brew.message==="duplicate_resulting_brew"?"duplicate_resulting_brew":"persistence_failed")as SuggestedPlanErrorCode,message:brew.message};if(!brew.value)return{ok:false as const,code:"resulting_brew_missing" as const,message:"No resulting Brew can repair this mapping."};if(plan.value.resultingBrewId&&plan.value.resultingBrewId!==brew.value.id)return{ok:false as const,code:"inconsistent_plan_mapping" as const,message:"The existing mapping points to another Brew."};const saved=this.planRepository.update({...plan.value,resultingBrewId:brew.value.id,updatedAt:this.now()});return saved.ok?{ok:true as const,value:saved.value}:{ok:false as const,code:"persistence_failed" as const,message:saved.message}}
}
