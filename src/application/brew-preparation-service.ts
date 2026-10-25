import type { Brew } from "@/domain";
import { brewPersistenceSchema } from "@/data/local-brew-schema";
import { isAnalysisOutdated } from "@/domain";
import { mapRecommendationToSuggestedAdjustment } from "@/domain/suggested-plan";
import { applyBrewAdjustment, synchronizePreparation, isValidPreparation, type BrewPreparation } from "@/domain/brew-preparation";
import type { BrewRepository } from "@/repositories/brew-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { createUniqueId } from "./brew-factory";

export class BrewPreparationService {
  constructor(private readonly brews: BrewRepository, private readonly preparations: LocalBrewPreparationRepository,
    private readonly id: () => string = createUniqueId, private readonly now: () => string = () => new Date().toISOString()) {}
  load(input: { sourceBrewId?: string; recommendationId?: string; preparationId?: string }) {
    const migrated = this.preparations.migrate(); if (!migrated.ok) return migrated;
    if (input.preparationId) {
      const entry = migrated.value.entries.find(item => item.id === input.preparationId);
      return entry ? { ok: true as const, value: structuredClone(entry), outdated: false } : { ok: false as const, message: "找不到準備紀錄。" };
    }
    const read = this.brews.getById(input.sourceBrewId ?? "");
    if (!read.ok) return { ok: false as const, message: read.message };
    if (!read.value || read.value.executionStatus !== "completed") return { ok: false as const, message: "請從已完成的 Brew 開始。" };
    const brew = read.value;
    let value: BrewPreparation = { snapshot: structuredClone(brew.recipeSnapshot), plan: structuredClone(brew.brewPlan), sourceBrewId: brew.id, appliedAdjustment: null };
    if (input.recommendationId) {
      const analysis = brew.analysis, recommendation = analysis?.result.recommendations.find(item => item.id === input.recommendationId);
      if (!analysis || !recommendation) return { ok: false as const, message: "找不到這條建議。" };
      const mapped = mapRecommendationToSuggestedAdjustment(recommendation, brew.recipeSnapshot, this.id);
      if (!mapped.ok) return { ok: false as const, message: mapped.reason };
      try { value = applyBrewAdjustment(value, { adjustment: mapped.adjustment, sourceAnalysisId: analysis.id, sourceRecommendationId: recommendation.id,
        sourceFingerprint: analysis.sourceFingerprint, analysisGeneratedAt: analysis.generatedAt, rationale: recommendation.rationale, confidence: recommendation.confidence, evidence: recommendation.evidence }); }
      catch { return { ok: false as const, message: "這條建議無法安全套用。" }; }
    }
    return { ok: true as const, value, outdated: !!input.recommendationId && isAnalysisOutdated(brew) };
  }
  create(seed: BrewPreparation) {
    const normalized = synchronizePreparation(seed), at = this.now();
    if (!isValidPreparation(normalized)) return { ok: false as const, message: "請檢查沖煮參數與階段秒數。" };
    const draft: Brew = { id: this.id(), sourceRecipeId: normalized.plan.sourceRecipeId, sourceType: seed.sourceBrewId ? "previous_brew" : "recipe", sourceBrewId: seed.sourceBrewId ?? undefined,
      ...(seed.sourceBrewId || seed.appliedAdjustment ? { appliedAdjustment: normalized.appliedAdjustment } : {}), suggestedPlanHandoff: null, brewPlan: { ...normalized.plan, id: this.id(), createdAt: at },
      recipeSnapshot: { ...normalized.snapshot, createdAt: at }, executionStatus: "not_started", recordStatus: "draft", feedbackStatus: "not_requested",
      analysisStatus: "not_requested", analysis: null, analysisAttempt: null, currentStageOrder: 0, currentStageStartedAt: null, stageResults: [],
      actualTotalTimeSeconds: null, actualTotalWater: null, startedAt: null, completedAt: null, pausedAt: null, accumulatedPauseSeconds: 0,
      flavorFeedback: null, recordDetails: null, createdAt: at, updatedAt: at };
    const parsed = brewPersistenceSchema.safeParse(draft);
    if (!parsed.success) return { ok: false as const, message: "請檢查沖煮參數。" };
    return this.brews.createDraft(parsed.data);
  }
}
