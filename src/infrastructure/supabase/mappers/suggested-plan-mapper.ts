import { z } from "zod";
import { suggestedBrewPlanSchema, type SuggestedBrewPlan } from "@/domain";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/types/database.types";
import { CloudMappingError, parseActiveRow, suggestedPlanRowSchema } from "../cloud-row-schemas";

const json = (value: unknown): Json => z.json().parse(value);
export interface MappedSuggestedPlan { entity: SuggestedBrewPlan; revision: number; }

export function toSuggestedPlanInsert(userId: string, plan: SuggestedBrewPlan, revision = 1): TablesInsert<"suggested_plans"> {
  const value = suggestedBrewPlanSchema.parse(plan);
  return {
    id: value.id, user_id: userId, source_brew_id: value.sourceBrewId,
    source_analysis_id: value.sourceAnalysisId, source_recommendation_id: value.sourceRecommendationId,
    source_fingerprint: value.sourceFingerprint, source_analysis_generated_at: value.sourceAnalysisGeneratedAt,
    title: value.title, status: value.status, base_recipe_snapshot: json(value.baseRecipeSnapshot),
    adjustments: json(value.adjustments), rationale: value.rationale, confidence: value.confidence,
    evidence: json(value.evidence), keep_unchanged: [...value.keepUnchanged],
    resulting_brew_id: value.resultingBrewId, used_at: value.usedAt,
    created_at: value.createdAt, updated_at: value.updatedAt, revision, deleted_at: null,
  };
}

export function toSuggestedPlanUpdate(plan: SuggestedBrewPlan, revision: number): TablesUpdate<"suggested_plans"> {
  const update: TablesUpdate<"suggested_plans"> = { ...toSuggestedPlanInsert("00000000-0000-4000-8000-000000000000", plan, revision) };
  delete update.id;
  delete update.user_id;
  return update;
}

export function fromSuggestedPlanRow(input: Tables<"suggested_plans"> | unknown): MappedSuggestedPlan {
  const row = parseActiveRow(suggestedPlanRowSchema, input);
  const parsed = suggestedBrewPlanSchema.safeParse({
    id: row.id, sourceBrewId: row.source_brew_id, sourceAnalysisId: row.source_analysis_id,
    sourceRecommendationId: row.source_recommendation_id, sourceFingerprint: row.source_fingerprint,
    sourceAnalysisGeneratedAt: row.source_analysis_generated_at, title: row.title, status: row.status,
    baseRecipeSnapshot: row.base_recipe_snapshot, adjustments: row.adjustments,
    rationale: row.rationale, confidence: row.confidence, evidence: row.evidence,
    keepUnchanged: row.keep_unchanged, resultingBrewId: row.resulting_brew_id,
    usedAt: row.used_at, createdAt: row.created_at, updatedAt: row.updated_at,
  });
  if (!parsed.success) throw new CloudMappingError("invalid_row", parsed.error.issues[0]?.message ?? "Suggested Plan JSONB does not match the domain contract.");
  return {
    entity: parsed.data,
    revision: row.revision,
  };
}
