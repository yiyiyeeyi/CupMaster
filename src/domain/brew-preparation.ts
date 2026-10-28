import { deriveGrind, grindSettingSchema } from "./grinders";
import { z } from "zod";
import type { BrewPlan, BrewRecipeSnapshot } from "./types";
import { applySuggestedPlanAdjustment, suggestedPlanAdjustmentSchema } from "./suggested-plan";
import { quickPrepareSchema } from "./schemas";
import { prepareExtrasSchema, preparationGearSchema } from "./prepare-options";
import { calculateRatio } from "./recipe-utils";

const scalar = z.union([z.number().finite(), z.string(), z.null()]);
export const preparationChangeSchema = z.object({ field: z.enum(["temperature", "grind", "totalTime", "stage"]), stageId: z.string().nullable(), before: scalar, after: scalar,
  beforeSource: z.enum(["recipe_default", "suggested_plan", "user_override", "measured", "calculated", "user_reported", "inferred"]).optional(),
  beforeRecipeDefault: z.string().optional(),
});
export const appliedBrewAdjustmentSchema = z.object({ version: z.literal(1), adjustment: suggestedPlanAdjustmentSchema,
  sourceAnalysisId: z.string(), sourceRecommendationId: z.string(), sourceFingerprint: z.string(), analysisGeneratedAt: z.string().datetime(),
  rationale: z.string(), confidence: z.enum(["low", "medium", "high"]), evidence: z.array(z.object({ field: z.string(), label: z.string(), value: z.string() })),
  changes: z.array(preparationChangeSchema),
  appliedValue: scalar.optional(),
});
export type AppliedBrewAdjustment = z.infer<typeof appliedBrewAdjustmentSchema>;
export interface BrewPreparation { beanId?: string; snapshot: BrewRecipeSnapshot; plan: BrewPlan; sourceBrewId: string | null; appliedAdjustment: AppliedBrewAdjustment | null; }
export interface SavedBrewPreparation extends BrewPreparation { id: string; createdAt: string; updatedAt: string; legacyPlanId?: string; legacyBrewId?: string; }
export function isValidPreparation(seed: BrewPreparation) {
  const s = seed.snapshot;
  return (s.grind === undefined || grindSettingSchema.safeParse(s.grind).success) && prepareExtrasSchema.safeParse(s).success && preparationGearSchema.safeParse(s.equipment ?? {}).success && quickPrepareSchema.safeParse({ recipeVersionId: seed.plan.sourceRecipeId, coffeeDose: s.doseGrams.value, waterTotal: s.totalWaterGrams.value,
    waterTemperature: s.temperatureCelsius.value, dripper: s.dripper.value, grindSetting: s.grindDescription?.value,
    beanName: s.bean?.name, equipmentNotes: s.equipment?.notes, userGoal: s.userGoal }).success
    && Number.isFinite(s.expectedTimeSeconds.value) && s.expectedTimeSeconds.value > 0
    && s.steps.every(step => step.durationSeconds === undefined || (Number.isFinite(step.durationSeconds) && step.durationSeconds > 0));
}

function value(snapshot: BrewRecipeSnapshot, change: Pick<z.infer<typeof preparationChangeSchema>, "field" | "stageId">) {
  if (change.field === "temperature") return snapshot.temperatureCelsius.value;
  if (change.field === "grind") return snapshot.grindDescription?.value ?? null;
  if (change.field === "totalTime") return snapshot.expectedTimeSeconds.value;
  return snapshot.steps.find(step => step.id === change.stageId)?.durationSeconds ?? null;
}
export function synchronizePreparation(seed: BrewPreparation): BrewPreparation {
  const result = structuredClone(seed); result.snapshot=deriveGrind(result.snapshot); const s = result.snapshot, p = result.plan;
  s.ratio = calculateRatio(s.doseGrams.value, s.totalWaterGrams.value) ?? s.ratio;
  for (const [key, parameter] of [["doseGrams", s.doseGrams], ["totalWaterGrams", s.totalWaterGrams], ["temperatureCelsius", s.temperatureCelsius], ["dripper", s.dripper], ["grindDescription", s.grindDescription]] as const) {
    if (!parameter || Object.is(parameter.value, parameter.recipeDefault)) delete s.userOverrides[key];
    else s.userOverrides[key] = parameter.value;
  }
  if (result.appliedAdjustment) {
    const a = result.appliedAdjustment.adjustment;
    result.appliedAdjustment.appliedValue = value(s, { field: a.variable === "water_temperature" ? "temperature" : a.variable === "target_total_time" ? "totalTime" : a.variable === "stage_duration" ? "stage" : "grind", stageId: a.stageId });
  }
  p.coffeeDose = { ...s.doseGrams }; p.waterTotal = { ...s.totalWaterGrams }; p.waterTemperature = { ...s.temperatureCelsius };
  p.dripper = { ...s.dripper }; p.ratio = s.ratio; p.expectedTotalTime = s.expectedTimeSeconds.value;
  if (s.bean) p.beanMetadata = { name: s.bean.name }; else delete p.beanMetadata;
  if (s.equipment?.notes) p.equipmentNotes = s.equipment.notes; else delete p.equipmentNotes;
  if (s.userGoal) p.userGoal = s.userGoal; else delete p.userGoal;
  if (s.grindDescription) p.grindSetting = { ...s.grindDescription }; else delete p.grindSetting;
  if (s.grind) p.grind=structuredClone(s.grind); else delete p.grind;
  if (s.brewTemperatureMode) p.brewTemperatureMode = s.brewTemperatureMode; else delete p.brewTemperatureMode;
  if (s.iceGrams !== undefined) p.iceGrams = s.iceGrams; else delete p.iceGrams;
  if (s.equipment) p.equipment = { ...(s.equipment.grinderId && {grinderId:s.equipment.grinderId}), ...(s.equipment.grinder && {grinder:s.equipment.grinder}), ...(s.equipment.grinderSetting && {grinderSetting:s.equipment.grinderSetting}), ...(s.equipment.accessories && {accessories:[...s.equipment.accessories]}) }; else delete p.equipment;
  p.stages = s.steps.map(step => ({ id: step.id, order: step.order, title: step.title, targetWaterGrams: step.targetWaterGrams,
    targetDurationSeconds: step.durationSeconds, pourMethod: step.pourMethod, pattern: step.pattern, instruction: step.instruction, guidance: step.guidance }));
  return result;
}
export function applyBrewAdjustment(seed: BrewPreparation, metadata: Omit<AppliedBrewAdjustment, "version" | "changes">): BrewPreparation {
  if (seed.snapshot.grind && metadata.adjustment.variable === "grind") throw new Error("結構化刻度請在 Quick Prepare 調整，不能由文字建議換算。");
  if (seed.appliedAdjustment) throw new Error("每杯最多套用一條建議，請先取消目前建議。");
  const before = seed.snapshot, after = applySuggestedPlanAdjustment(structuredClone(before), metadata.adjustment);
  const fields: Array<Pick<z.infer<typeof preparationChangeSchema>, "field" | "stageId">> = [
    { field: "temperature", stageId: null }, { field: "grind", stageId: null }, { field: "totalTime", stageId: null },
    ...before.steps.map(step => ({ field: "stage" as const, stageId: step.id })),
  ];
  const changes = fields.flatMap(field => {
    if (Object.is(value(before, field), value(after, field))) return [];
    const parameter = field.field === "temperature" ? before.temperatureCelsius : field.field === "grind" ? before.grindDescription : field.field === "totalTime" ? before.expectedTimeSeconds : undefined;
    return [{ ...field, before: value(before, field), after: value(after, field),
      ...(parameter && { beforeSource: parameter.source }),
      ...(field.field === "grind" && before.grindDescription && { beforeRecipeDefault: before.grindDescription.recipeDefault }),
    }];
  });
  return synchronizePreparation({ ...seed, snapshot: after, appliedAdjustment: { ...metadata, version: 1, changes } });
}
export function cancelBrewAdjustment(seed: BrewPreparation): BrewPreparation {
  const result = structuredClone(seed), s = result.snapshot;
  for (const change of result.appliedAdjustment?.changes ?? []) {
    if (!Object.is(value(s, change), change.after)) continue;
    const parameterSource = change.beforeSource === "recipe_default" || change.beforeSource === "suggested_plan" || change.beforeSource === "user_override" ? change.beforeSource : undefined;
    if (change.field === "temperature" && typeof change.before === "number") {
      s.temperatureCelsius.value = change.before;
      if (parameterSource) s.temperatureCelsius.source = parameterSource;
    }
    else if (change.field === "grind") {
      if (change.before === null) delete s.grindDescription;
      else if (typeof change.before === "string" && s.grindDescription) {
        s.grindDescription.value = change.before;
        if (parameterSource) s.grindDescription.source = parameterSource;
        if (change.beforeRecipeDefault !== undefined) s.grindDescription.recipeDefault = change.beforeRecipeDefault;
      }
    } else if (change.field === "totalTime" && typeof change.before === "number") {
      s.expectedTimeSeconds.value = change.before;
      if (change.beforeSource) s.expectedTimeSeconds.source = change.beforeSource;
    }
    else if (change.field === "stage") { const step = s.steps.find(item => item.id === change.stageId); if (step && typeof change.before === "number") step.durationSeconds = change.before; }
  }
  result.appliedAdjustment = null;
  return synchronizePreparation(result);
}
