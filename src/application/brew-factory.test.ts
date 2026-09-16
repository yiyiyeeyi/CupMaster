import { describe, expect, it } from "vitest";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { formatRatio, quickPrepareSchema } from "@/domain";
import { createBrewDraft, createBrewPlan, createQuickPrepareDefaults, resetRecipeParameters } from "./brew-factory";

const recipe = recipeFixtures[0];
const defaults = createQuickPrepareDefaults(recipe);
const deps = { now: () => "2026-07-15T12:00:00.000Z", createId: () => "test-id" };

describe("Quick Prepare validation and factories", () => {
  it("accepts valid Quick Prepare data", () => expect(quickPrepareSchema.safeParse(defaults).success).toBe(true));
  it("rejects invalid dose", () => expect(quickPrepareSchema.safeParse({ ...defaults, coffeeDose: 0 }).success).toBe(false));
  it("rejects water less than or equal to dose", () => expect(quickPrepareSchema.safeParse({ ...defaults, waterTotal: defaults.coffeeDose }).success).toBe(false));
  it("rejects invalid temperature", () => expect(quickPrepareSchema.safeParse({ ...defaults, waterTemperature: 110 }).success).toBe(false));
  it("rejects an empty dripper", () => expect(quickPrepareSchema.safeParse({ ...defaults, dripper: "  " }).success).toBe(false));
  it("normalizes optional empty strings", () => { const parsed = quickPrepareSchema.parse({ ...defaults, grindSetting: " ", beanName: "", equipmentNotes: "  ", userGoal: "" }); expect(parsed.grindSetting).toBeUndefined(); expect(parsed.beanName).toBeUndefined(); expect(parsed.equipmentNotes).toBeUndefined(); expect(parsed.userGoal).toBeUndefined(); });
  it("formats a valid ratio", () => expect(formatRatio(20, 300)).toBe("1:15.0"));
  it("never formats NaN or Infinity", () => { expect(formatRatio(Number.NaN, 300)).toBeNull(); expect(formatRatio(0, Number.POSITIVE_INFINITY)).toBeNull(); });
  it("marks unchanged parameters as recipe defaults", () => expect(createBrewPlan(recipe, defaults, deps).plan.coffeeDose.source).toBe("recipe_default"));
  it("marks changed parameters as user overrides", () => expect(createBrewPlan(recipe, { ...defaults, coffeeDose: 18 }, deps).plan.coffeeDose.source).toBe("user_override"));
  it("resets only recipe parameters", () => { const input = { ...defaults, coffeeDose: 18, beanName: "Colombia", equipmentNotes: "My kettle", userGoal: "Sweeter" }; const reset = resetRecipeParameters(input, recipe); expect(reset.coffeeDose).toBe(recipe.currentVersion.doseGrams); expect(reset.beanName).toBe("Colombia"); expect(reset.equipmentNotes).toBe("My kettle"); expect(reset.userGoal).toBe("Sweeter"); });
  it("creates a complete BrewPlan", () => { const { plan } = createBrewPlan(recipe, defaults, deps); expect(plan.sourceRecipeId).toBe(recipe.id); expect(plan.stages.length).toBe(recipe.currentVersion.steps.length); expect(plan.createdAt).toBe(deps.now()); });
  it("uses resolved values in the snapshot", () => { const { snapshot } = createBrewPlan(recipe, { ...defaults, waterTotal: 260 }, deps); expect(snapshot.totalWaterGrams.value).toBe(260); expect(snapshot.totalWaterGrams.recipeDefault).toBe(recipe.currentVersion.totalWaterGrams); });
  it("orders snapshot steps", () => { const copy = structuredClone(recipe); copy.currentVersion.steps.reverse(); expect(createBrewPlan(copy, defaults, deps).snapshot.steps.map((step) => step.order)).toEqual([...copy.currentVersion.steps].map((step) => step.order).sort((a, b) => a - b)); });
  it("does not change snapshot values when the source recipe changes", () => { const copy = structuredClone(recipe); const { snapshot } = createBrewPlan(copy, defaults, deps); copy.currentVersion.title = "Changed"; copy.currentVersion.doseGrams = 99; expect(snapshot.title).not.toBe("Changed"); expect(snapshot.doseGrams.recipeDefault).not.toBe(99); });
  it("does not share step references with the source recipe", () => { const copy = structuredClone(recipe); const { snapshot } = createBrewPlan(copy, defaults, deps); copy.currentVersion.steps[0].title = "Changed step"; expect(snapshot.steps[0].title).not.toBe("Changed step"); });
  it("creates the required initial Draft state", () => { const draft = createBrewDraft(recipe, defaults, deps); expect(draft).toMatchObject({ executionStatus: "not_started", recordStatus: "draft", feedbackStatus: "not_requested", analysisStatus: "not_requested", currentStageOrder: 0, startedAt: null, completedAt: null, pausedAt: null, accumulatedPauseSeconds: 0, stageResults: [] }); });
  it("creates a Draft without Bean or Equipment", () => { const draft = createBrewDraft(recipe, { ...defaults, grindSetting: undefined }, deps); expect(draft.recipeSnapshot.bean).toBeUndefined(); expect(draft.recipeSnapshot.equipment).toBeUndefined(); expect(draft.brewPlan.equipmentNotes).toBeUndefined(); expect(draft.feedbackStatus).toBe("not_requested"); expect(draft.analysisStatus).toBe("not_requested"); });
});
