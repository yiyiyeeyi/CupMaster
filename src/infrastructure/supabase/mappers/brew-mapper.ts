import { z } from "zod";
import type { Brew } from "@/domain";
import { brewPersistenceSchema } from "@/data/local-brew-schema";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/types/database.types";
import { brewRowSchema, CloudMappingError, parseActiveRow,brewParityColumnsSchema } from "../cloud-row-schemas";

const json = (value: unknown): Json => z.json().parse(value);
type BrewParityColumns = z.infer<typeof brewParityColumnsSchema>;
type BrewInsert = Omit<TablesInsert<"brews">, keyof BrewParityColumns> & BrewParityColumns;
type BrewUpdate = Omit<TablesUpdate<"brews">, keyof BrewParityColumns> & Partial<BrewParityColumns>;
export interface MappedBrew { entity: Brew; revision: number; }

export function toBrewInsert(userId: string, brew: Brew, revision = 1): BrewInsert {
  const value = brewPersistenceSchema.parse(brew);
  return {
    bean_id:value.beanId??null, source_preparation_id:value.sourcePreparationId??null, legacy_preparation_id:value.legacyPreparationId??null, applied_adjustment:value.appliedAdjustment==null?null:json(value.appliedAdjustment), applied_adjustment_present:value.appliedAdjustment!==undefined,
    id: value.id, user_id: userId, source_recipe_id: value.sourceRecipeId,
    execution_status: value.executionStatus, record_status: value.recordStatus,
    feedback_status: value.feedbackStatus, analysis_status: value.analysisStatus,
    source_type: value.sourceType, source_suggested_plan_id: value.sourceSuggestedPlanId ?? null,
    source_brew_id: value.sourceBrewId ?? null, source_analysis_id: value.sourceAnalysisId ?? null,
    source_recommendation_id: value.sourceRecommendationId ?? null, source_fingerprint: value.sourceFingerprint ?? null,
    recipe_snapshot: json(value.recipeSnapshot), brew_plan: json(value.brewPlan), stage_results: json(value.stageResults),
    flavor_feedback: value.flavorFeedback ? json(value.flavorFeedback) : null,
    record_details: value.recordDetails ? json(value.recordDetails) : null,
    analysis: value.analysis ? json(value.analysis) : null,
    analysis_attempt: value.analysisAttempt ? json(value.analysisAttempt) : null,
    suggested_plan_handoff: value.suggestedPlanHandoff ? json(value.suggestedPlanHandoff) : null,
    quick_rating: null, current_stage_order: value.currentStageOrder,
    accumulated_pause_seconds: value.accumulatedPauseSeconds,
    execution_run: value.executionRun ?? null,
    current_stage_paused_seconds: value.currentStagePausedSeconds ?? null,
    actual_total_time_seconds: value.actualTotalTimeSeconds, actual_total_water: value.actualTotalWater,
    started_at: value.startedAt, current_stage_started_at: value.currentStageStartedAt,
    paused_at: value.pausedAt, completed_at: value.completedAt, created_at: value.createdAt,
    updated_at: value.updatedAt, revision, deleted_at: null,
  };
}

export function toBrewUpdate(brew: Brew, revision: number): BrewUpdate {
  const update: BrewUpdate = { ...toBrewInsert("00000000-0000-4000-8000-000000000000", brew, revision) };
  delete update.id;
  delete update.user_id;
  return update;
}

export function fromBrewRow(input: Tables<"brews"> | unknown): MappedBrew {
  const row = parseActiveRow(brewRowSchema, input);
  const parsed = brewPersistenceSchema.safeParse({
    ...(row.bean_id!=null&&{beanId:row.bean_id}), ...(row.source_preparation_id!=null&&{sourcePreparationId:row.source_preparation_id}), ...(row.legacy_preparation_id!=null&&{legacyPreparationId:row.legacy_preparation_id}), ...((row.applied_adjustment_present||row.applied_adjustment!=null)&&{appliedAdjustment:row.applied_adjustment??null}),
    id: row.id, sourceRecipeId: row.source_recipe_id, brewPlan: row.brew_plan,
    recipeSnapshot: row.recipe_snapshot, executionStatus: row.execution_status,
    recordStatus: row.record_status, feedbackStatus: row.feedback_status,
    analysisStatus: row.analysis_status, analysis: row.analysis, analysisAttempt: row.analysis_attempt,
    currentStageOrder: row.current_stage_order, currentStageStartedAt: row.current_stage_started_at,
    stageResults: row.stage_results, quickRating: row.quick_rating ?? undefined,
    flavorFeedback: row.flavor_feedback, recordDetails: row.record_details,
    actualTotalTimeSeconds: row.actual_total_time_seconds, actualTotalWater: row.actual_total_water,
    startedAt: row.started_at, completedAt: row.completed_at, pausedAt: row.paused_at,
    accumulatedPauseSeconds: row.accumulated_pause_seconds, createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.execution_run != null && { executionRun: row.execution_run }),
    ...(row.current_stage_paused_seconds != null && { currentStagePausedSeconds: row.current_stage_paused_seconds }),
    sourceType: row.source_type, sourceSuggestedPlanId: row.source_suggested_plan_id ?? undefined,
    sourceBrewId: row.source_brew_id ?? undefined, sourceAnalysisId: row.source_analysis_id ?? undefined,
    sourceRecommendationId: row.source_recommendation_id ?? undefined,
    sourceFingerprint: row.source_fingerprint ?? undefined, suggestedPlanHandoff: row.suggested_plan_handoff,
  });
  if (!parsed.success) throw new CloudMappingError("invalid_row", parsed.error.issues[0]?.message ?? "Brew JSONB does not match the domain contract.");
  return { entity: parsed.data, revision: row.revision };
}
