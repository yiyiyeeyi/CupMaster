import { z } from "zod";
import type { Brew } from "./types";
import type { SuggestedBrewPlan } from "./suggested-plan";

export const cloudMigrationErrorCodeSchema = z.enum([
  "migration_unavailable", "unauthenticated", "local_data_invalid", "remote_write_failed",
  "remote_verification_failed", "duplicate_remote_entity", "graph_reference_missing",
  "graph_reference_conflict", "revision_conflict", "checkpoint_invalid",
  "migration_already_completed", "unknown_migration_error",
]);
export type CloudMigrationErrorCode = z.infer<typeof cloudMigrationErrorCodeSchema>;
export const cloudMigrationStatusSchema = z.enum(["not_started", "review_required", "in_progress", "completed", "failed"]);
export type CloudMigrationStatus = z.infer<typeof cloudMigrationStatusSchema>;

const unique = (values: string[]) => new Set(values).size === values.length;
export const cloudMigrationCheckpointSchema = z.object({
  version: z.literal(1), userId: z.string().trim().min(1), status: cloudMigrationStatusSchema,
  startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(),
  lastAttemptAt: z.string().datetime().nullable(), profileMigrated: z.boolean(),
  brewIdsMigrated: z.array(z.string().min(1)), suggestedPlanIdsMigrated: z.array(z.string().min(1)),
  graphVerified: z.boolean(), errorCode: cloudMigrationErrorCodeSchema.nullable(),
}).superRefine((value, context) => {
  if (!unique(value.brewIdsMigrated)) context.addIssue({ code: "custom", path: ["brewIdsMigrated"], message: "Migrated Brew IDs must be unique." });
  if (!unique(value.suggestedPlanIdsMigrated)) context.addIssue({ code: "custom", path: ["suggestedPlanIdsMigrated"], message: "Migrated Plan IDs must be unique." });
  if (value.status === "completed" && (!value.graphVerified || value.errorCode || !value.completedAt)) context.addIssue({ code: "custom", path: ["status"], message: "Completed migration requires a verified graph, completedAt, and no error." });
  if (value.status === "failed" && !value.errorCode) context.addIssue({ code: "custom", path: ["errorCode"], message: "Failed migration requires an error code." });
  if (value.status !== "failed" && value.errorCode) context.addIssue({ code: "custom", path: ["errorCode"], message: "Only failed migration may retain an error code." });
});
export type CloudMigrationCheckpoint = z.infer<typeof cloudMigrationCheckpointSchema>;

export function transitionMigrationCheckpoint(checkpoint: CloudMigrationCheckpoint, status: CloudMigrationStatus, now: string, errorCode: CloudMigrationErrorCode | null = null): CloudMigrationCheckpoint {
  if (checkpoint.status === "completed" && status !== "completed") throw new Error("migration_already_completed");
  const candidate: CloudMigrationCheckpoint = { ...checkpoint, status, lastAttemptAt: status === "not_started" ? checkpoint.lastAttemptAt : now, startedAt: status === "in_progress" ? checkpoint.startedAt ?? now : checkpoint.startedAt, completedAt: status === "completed" ? now : null, errorCode: status === "failed" ? errorCode ?? "unknown_migration_error" : null };
  return cloudMigrationCheckpointSchema.parse(candidate);
}

export type MigrationGraphErrorCode = "duplicate_brew_id" | "duplicate_plan_id" | "missing_source_brew" | "missing_source_analysis" | "missing_resulting_brew" | "missing_source_plan" | "mapping_mismatch" | "duplicate_resulting_brew" | "invalid_plan_state" | "result_metadata_mismatch" | "cycle_detected";
export interface MigrationGraphError { code: MigrationGraphErrorCode; entityId: string; message: string; }
export interface LocalCloudMigrationGraph { profile: unknown | null; brews: readonly Brew[]; suggestedPlans: readonly SuggestedBrewPlan[]; }

export function validateLocalCloudMigrationGraph(input: LocalCloudMigrationGraph) {
  const errors: MigrationGraphError[] = [];
  const brewCounts = new Map<string, number>(), planCounts = new Map<string, number>();
  for (const brew of input.brews) brewCounts.set(brew.id, (brewCounts.get(brew.id) ?? 0) + 1);
  for (const plan of input.suggestedPlans) planCounts.set(plan.id, (planCounts.get(plan.id) ?? 0) + 1);
  for (const [id, count] of brewCounts) if (count > 1) errors.push({ code: "duplicate_brew_id", entityId: id, message: "Brew ID is duplicated." });
  for (const [id, count] of planCounts) if (count > 1) errors.push({ code: "duplicate_plan_id", entityId: id, message: "Suggested Plan ID is duplicated." });
  const brews = new Map(input.brews.map((brew) => [brew.id, brew]));
  const plans = new Map(input.suggestedPlans.map((plan) => [plan.id, plan]));
  const resultOwners = new Map<string, string>();
  for (const plan of input.suggestedPlans) {
    const source = brews.get(plan.sourceBrewId);
    if (!source) errors.push({ code: "missing_source_brew", entityId: plan.id, message: "Suggested Plan source Brew is missing." });
    else if (source.analysis?.id !== plan.sourceAnalysisId) errors.push({ code: "missing_source_analysis", entityId: plan.id, message: "Suggested Plan source Analysis is missing or does not match." });
    if (plan.status === "used" && (!plan.resultingBrewId || !plan.usedAt)) errors.push({ code: "invalid_plan_state", entityId: plan.id, message: "A used Suggested Plan requires a resulting Brew and usedAt." });
    if (plan.status === "draft" && plan.usedAt) errors.push({ code: "invalid_plan_state", entityId: plan.id, message: "A draft Suggested Plan cannot have usedAt." });
    if (plan.resultingBrewId) {
      const result = brews.get(plan.resultingBrewId);
      if (!result) errors.push({ code: "missing_resulting_brew", entityId: plan.id, message: "Suggested Plan resulting Brew is missing." });
      const owner = resultOwners.get(plan.resultingBrewId);
      if (owner && owner !== plan.id) errors.push({ code: "duplicate_resulting_brew", entityId: plan.resultingBrewId, message: "A resulting Brew is mapped by more than one Suggested Plan." });
      resultOwners.set(plan.resultingBrewId, plan.id);
      if (result && result.sourceSuggestedPlanId !== plan.id) errors.push({ code: "mapping_mismatch", entityId: plan.id, message: "Plan and Brew mapping is not bidirectionally consistent." });
      if (result && (result.sourceType !== "suggested_plan" || result.sourceBrewId !== plan.sourceBrewId || result.sourceAnalysisId !== plan.sourceAnalysisId || result.sourceRecommendationId !== plan.sourceRecommendationId || result.sourceFingerprint !== plan.sourceFingerprint)) errors.push({ code: "result_metadata_mismatch", entityId: result.id, message: "Resulting Brew source metadata does not match its Suggested Plan." });
    }
  }
  for (const brew of input.brews) if (brew.sourceSuggestedPlanId) {
    const plan = plans.get(brew.sourceSuggestedPlanId);
    if (!plan) errors.push({ code: "missing_source_plan", entityId: brew.id, message: "Brew source Suggested Plan is missing." });
    else if (plan.resultingBrewId !== brew.id) errors.push({ code: "mapping_mismatch", entityId: brew.id, message: "Brew and Plan mapping is not bidirectionally consistent." });
  }
  const resultingBySource = new Map<string, string[]>();
  for (const plan of input.suggestedPlans) if (plan.resultingBrewId) resultingBySource.set(plan.sourceBrewId, [...(resultingBySource.get(plan.sourceBrewId) ?? []), plan.resultingBrewId]);
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (brewId: string): boolean => {
    if (visiting.has(brewId)) return true;
    if (visited.has(brewId)) return false;
    visiting.add(brewId);
    const cyclic = (resultingBySource.get(brewId) ?? []).some(visit);
    visiting.delete(brewId); visited.add(brewId);
    return cyclic;
  };
  for (const brewId of brews.keys()) if (visit(brewId)) { errors.push({ code: "cycle_detected", entityId: brewId, message: "Brew and Suggested Plan references contain a cycle." }); break; }
  return { valid: errors.length === 0, errors: errors.sort((a, b) => a.entityId.localeCompare(b.entityId) || a.code.localeCompare(b.code)), orderedBrewIds: [...brewCounts.keys()].sort(), orderedPlanIds: [...planCounts.keys()].sort() };
}

export const MIGRATION_LOGICAL_ORDER = ["profile", "brews_without_plan_links", "suggested_plans", "patch_brew_plan_links", "patch_plan_result_links", "verify_graph", "complete_checkpoint"] as const;
export type MigrationEntityState = "missing_remote" | "matching" | "conflict" | "deleted_remote" | "invalid_remote";
export interface MigrationComparableEntity { id: string; revision?: number; deletedAt?: string | null; [key: string]: unknown; }
const normalized = (entity: MigrationComparableEntity) => Object.fromEntries(Object.entries(entity).filter(([key]) => key !== "revision" && key !== "deletedAt"));
export function classifyMigrationEntityState(local: MigrationComparableEntity, remote: MigrationComparableEntity | null | undefined): MigrationEntityState {
  if (!remote) return "missing_remote";
  if (!remote.id || typeof remote.id !== "string" || typeof remote.revision !== "number" || remote.revision < 1) return "invalid_remote";
  if (remote.deletedAt) return "deleted_remote";
  if (local.id !== remote.id) return "conflict";
  return JSON.stringify(normalized(local)) === JSON.stringify(normalized(remote)) ? "matching" : "conflict";
}
export function getPendingMigrationIds(checkpoint: CloudMigrationCheckpoint, brewIds: readonly string[], planIds: readonly string[]) { const migratedBrews = new Set(checkpoint.brewIdsMigrated), migratedPlans = new Set(checkpoint.suggestedPlanIdsMigrated); return { brewIds: [...brewIds].filter((id) => !migratedBrews.has(id)).sort(), suggestedPlanIds: [...planIds].filter((id) => !migratedPlans.has(id)).sort() }; }
