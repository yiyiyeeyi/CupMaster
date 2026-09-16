import { z } from "zod";
import { brewAnalysisAttemptSchema, brewAnalysisSchema } from "@/domain/brew-analysis";
import { brewRecordDetailsSchema, experienceLevelSchema, flavorFeedbackSchema, userNeedSchema } from "@/domain/schemas";
import { suggestedPlanAdjustmentSchema } from "@/domain/suggested-plan";
import { brewPlanSchema, brewRecipeSnapshotSchema, brewStageResultSchema } from "@/data/local-brew-schema";

const timestamp = z.string().datetime();
const nullableTimestamp = timestamp.nullable();
const revision = z.number().int().min(1);
const activeRow = { revision, created_at: timestamp, updated_at: timestamp, deleted_at: nullableTimestamp };

export const profileRowSchema = z.object({
  id: z.string().uuid(), display_name: z.string().trim().min(2).max(40),
  experience_level: experienceLevelSchema, selected_needs: z.array(userNeedSchema),
  onboarding_completed: z.boolean(), preferences: z.json(), ...activeRow,
});

export const brewRowSchema = z.object({
  id: z.string().min(1), user_id: z.string().uuid(), source_recipe_id: z.string().min(1),
  execution_status: z.enum(["not_started", "in_progress", "paused", "completed", "abandoned"]),
  record_status: z.enum(["draft", "saved", "archived"]),
  feedback_status: z.enum(["not_requested", "awaiting_feedback", "completed", "skipped"]),
  analysis_status: z.enum(["not_requested", "pending", "completed", "failed"]),
  source_type: z.enum(["recipe", "suggested_plan", "previous_brew", "manual"]),
  source_suggested_plan_id: z.string().min(1).nullable(), source_brew_id: z.string().min(1).nullable(),
  source_analysis_id: z.string().min(1).nullable(), source_recommendation_id: z.string().min(1).nullable(),
  source_fingerprint: z.string().min(1).nullable(), recipe_snapshot: brewRecipeSnapshotSchema,
  brew_plan: brewPlanSchema, stage_results: z.array(brewStageResultSchema),
  flavor_feedback: flavorFeedbackSchema.nullable(), record_details: brewRecordDetailsSchema.nullable(),
  analysis: brewAnalysisSchema.nullable(), analysis_attempt: brewAnalysisAttemptSchema.nullable(),
  suggested_plan_handoff: z.unknown().nullable(), quick_rating: z.enum(["liked", "neutral", "disliked", "skipped"]).nullable(),
  current_stage_order: z.number().int().nonnegative(), accumulated_pause_seconds: z.number().nonnegative(),
  actual_total_time_seconds: z.number().nonnegative().nullable(), actual_total_water: z.number().nonnegative().nullable(),
  started_at: nullableTimestamp, current_stage_started_at: nullableTimestamp, paused_at: nullableTimestamp,
  completed_at: nullableTimestamp, ...activeRow,
}).superRefine((row, context) => {
  if (row.source_type === "suggested_plan" && !row.source_suggested_plan_id) context.addIssue({ code: "custom", path: ["source_suggested_plan_id"], message: "Suggested Plan source requires its Plan ID." });
  if (row.source_type === "recipe" && row.suggested_plan_handoff) context.addIssue({ code: "custom", path: ["suggested_plan_handoff"], message: "Recipe source cannot contain Plan handoff." });
});

export const suggestedPlanRowSchema = z.object({
  id: z.string().min(1), user_id: z.string().uuid(), source_brew_id: z.string().min(1),
  source_analysis_id: z.string().min(1), source_recommendation_id: z.string().min(1),
  source_fingerprint: z.string().min(1), source_analysis_generated_at: timestamp,
  title: z.string().min(1).max(120), status: z.enum(["draft", "used"]),
  base_recipe_snapshot: brewRecipeSnapshotSchema,
  adjustments: z.array(suggestedPlanAdjustmentSchema).length(1), rationale: z.string().min(1).max(600),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.object({ field: z.string().min(1), label: z.string().min(1), value: z.string().min(1) })).min(1),
  keep_unchanged: z.array(z.string().min(1)).min(1), resulting_brew_id: z.string().min(1).nullable(),
  used_at: nullableTimestamp, ...activeRow,
}).superRefine((row, context) => {
  if (row.status === "draft" && row.used_at) context.addIssue({ code: "custom", path: ["used_at"], message: "Draft Plan cannot have used_at." });
  if (row.status === "used" && (!row.used_at || !row.resulting_brew_id)) context.addIssue({ code: "custom", path: ["status"], message: "Used Plan requires resulting Brew and used_at." });
});

export class CloudMappingError extends Error {
  constructor(public readonly code: "invalid_row" | "deleted_row", message: string) { super(message); this.name = "CloudMappingError"; }
}

export function parseActiveRow<T>(schema: z.ZodType<T>, row: unknown): T {
  const parsed = schema.safeParse(row);
  if (!parsed.success) throw new CloudMappingError("invalid_row", parsed.error.issues[0]?.message ?? "Cloud row is invalid.");
  if ((parsed.data as { deleted_at?: string | null }).deleted_at) throw new CloudMappingError("deleted_row", "Soft-deleted rows are not active domain entities.");
  return parsed.data;
}
