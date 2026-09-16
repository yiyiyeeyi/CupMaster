import type { Brew, BrewPlan, BrewRecipeSnapshot, QuickPrepareInput, Recipe, ResolvedParameter } from "@/domain";
import { calculateRatio, quickPrepareSchema } from "@/domain";

export interface FactoryDependencies { now?: () => string; createId?: () => string; }
let fallbackSequence = 0;
export function createUniqueId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") { const bytes = crypto.getRandomValues(new Uint8Array(16)); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
  fallbackSequence += 1; return `local-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
}
function resolved<T>(value: T, recipeDefault: T): ResolvedParameter<T> { return { value, recipeDefault, source: Object.is(value, recipeDefault) ? "recipe_default" : "user_override" }; }
function orderedStages(recipe: Recipe) { return [...recipe.currentVersion.steps].sort((a, b) => a.order - b.order).map((step) => ({ id: step.id, order: step.order, title: step.title, targetWaterGrams: step.targetWaterGrams, targetDurationSeconds: step.durationSeconds, pattern: step.pattern, instruction: step.instruction })); }
function clonedSteps(recipe: Recipe) { return [...recipe.currentVersion.steps].sort((a, b) => a.order - b.order).map((step) => ({ ...step })); }
export function createQuickPrepareDefaults(recipe: Recipe): QuickPrepareInput { const version = recipe.currentVersion; return { recipeVersionId: version.id, coffeeDose: version.doseGrams, waterTotal: version.totalWaterGrams, waterTemperature: version.temperatureCelsius, dripper: version.dripper, grindSetting: version.grindDescription }; }
export function resetRecipeParameters(input: QuickPrepareInput, recipe: Recipe): QuickPrepareInput { const defaults = createQuickPrepareDefaults(recipe); return { ...input, coffeeDose: defaults.coffeeDose, waterTotal: defaults.waterTotal, waterTemperature: defaults.waterTemperature, dripper: defaults.dripper, grindSetting: defaults.grindSetting }; }

export function createBrewRecipeSnapshot(recipe: Recipe, input: QuickPrepareInput, createdAt: string): BrewRecipeSnapshot {
  const version = recipe.currentVersion; const ratio = calculateRatio(input.coffeeDose, input.waterTotal);
  if (ratio === null) throw new Error("A valid ratio is required to create a snapshot.");
  const grind = input.grindSetting ? resolved(input.grindSetting, version.grindDescription) : undefined;
  return { sourceRecipeId: recipe.id, sourceRecipeVersion: version.version, recipeType: recipe.type, title: version.title, description: version.description, method: version.method, author: version.author, doseGrams: resolved(input.coffeeDose, version.doseGrams), totalWaterGrams: resolved(input.waterTotal, version.totalWaterGrams), temperatureCelsius: resolved(input.waterTemperature, version.temperatureCelsius), grindDescription: grind, dripper: resolved(input.dripper, version.dripper), ratio, expectedTimeSeconds: { value: version.expectedTimeSeconds, source: "recipe_default" }, steps: clonedSteps(recipe), userOverrides: { ...(input.coffeeDose !== version.doseGrams && { doseGrams: input.coffeeDose }), ...(input.waterTotal !== version.totalWaterGrams && { totalWaterGrams: input.waterTotal }), ...(input.waterTemperature !== version.temperatureCelsius && { temperatureCelsius: input.waterTemperature }), ...(input.dripper !== version.dripper && { dripper: input.dripper }), ...(input.grindSetting && input.grindSetting !== version.grindDescription && { grindDescription: input.grindSetting }) }, ...(input.beanName && { bean: { id: `local-bean:${input.beanName}`, name: input.beanName } }), ...(input.equipmentNotes && { equipment: { dripper: input.dripper, notes: input.equipmentNotes } }), ...(input.userGoal && { userGoal: input.userGoal }), createdAt };
}

export function createBrewPlan(recipe: Recipe, rawInput: QuickPrepareInput, dependencies: FactoryDependencies = {}): { plan: BrewPlan; snapshot: BrewRecipeSnapshot } {
  const input = quickPrepareSchema.parse(rawInput); const now = dependencies.now?.() ?? new Date().toISOString(); const version = recipe.currentVersion; const ratio = calculateRatio(input.coffeeDose, input.waterTotal);
  if (ratio === null) throw new Error("A valid ratio is required to create a BrewPlan.");
  const snapshot = createBrewRecipeSnapshot(recipe, input, now);
  const plan: BrewPlan = { id: dependencies.createId?.() ?? createUniqueId(), sourceRecipeId: recipe.id, sourceRecipeVersion: version.version, recipeTitle: version.title, method: version.method, coffeeDose: resolved(input.coffeeDose, version.doseGrams), waterTotal: resolved(input.waterTotal, version.totalWaterGrams), waterTemperature: resolved(input.waterTemperature, version.temperatureCelsius), ratio, dripper: resolved(input.dripper, version.dripper), ...(input.grindSetting && { grindSetting: resolved(input.grindSetting, version.grindDescription) }), ...(input.beanName && { beanMetadata: { name: input.beanName } }), ...(input.equipmentNotes && { equipmentNotes: input.equipmentNotes }), ...(input.userGoal && { userGoal: input.userGoal }), expectedTotalTime: version.expectedTimeSeconds, stages: orderedStages(recipe), createdAt: now };
  return { plan, snapshot };
}

export function createBrewDraft(recipe: Recipe, input: QuickPrepareInput, dependencies: FactoryDependencies = {}): Brew {
  const now = dependencies.now?.() ?? new Date().toISOString(); const { plan, snapshot } = createBrewPlan(recipe, input, { ...dependencies, now: () => now });
  return { id: dependencies.createId?.() ?? createUniqueId(), sourceRecipeId: recipe.id, sourceType:"recipe", suggestedPlanHandoff:null, brewPlan: plan, recipeSnapshot: snapshot, executionStatus: "not_started", recordStatus: "draft", feedbackStatus: "not_requested", analysisStatus: "not_requested", analysis: null, analysisAttempt: null, currentStageOrder: 0, currentStageStartedAt: null, actualTotalTimeSeconds: null, actualTotalWater: null, startedAt: null, completedAt: null, pausedAt: null, accumulatedPauseSeconds: 0, stageResults: [], flavorFeedback: null, recordDetails: null, createdAt: now, updatedAt: now };
}
