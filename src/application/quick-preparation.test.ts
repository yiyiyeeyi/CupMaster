import { describe, expect, it } from "vitest";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { beginnerRecipe, preparationFromRecipe, resolveQuickPreparation, switchPreparationRecipe } from "./quick-preparation";
import { BrewPreparationService } from "./brew-preparation-service";
import { consumeCompletedPreparation } from "./preparation-completion";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
describe("Quick Prepare entry", () => {
  it("uses gentle-start with no record or only not_started/in_progress/paused drafts", () => {
    const brew = createFullDemoFixtures().brews[0];
    expect(resolveQuickPreparation([], recipeFixtures)?.snapshot.sourceRecipeId).toBe("gentle-start");
    for (const executionStatus of ["not_started", "in_progress", "paused"] as const) expect(resolveQuickPreparation([{ ...brew, executionStatus }], recipeFixtures)?.snapshot.sourceRecipeId).toBe("gentle-start");
  });
  it("chooses completed/abandoned by creation date and ID, excludes legacy and never copies execution or a consumed preparation ID", () => {
    const brew = createFullDemoFixtures().brews[0], before = structuredClone(brew);
    const last = { ...brew, id: "a", sourcePreparationId: "original", executionStatus: "abandoned" as const, createdAt: "2026-10-25T00:00:00.000Z" };
    const seed = resolveQuickPreparation([{ ...last, id: "z" }, { ...last, id: "hidden", legacyPreparationId: "converted", createdAt: "2026-10-26T00:00:00.000Z" }, last, { ...brew, updatedAt: "2026-10-27T00:00:00.000Z", createdAt: "2026-10-24T00:00:00.000Z" }], []);
    expect(seed?.sourceBrewId).toBe("a"); expect(seed?.sourcePreparationId).toBeUndefined(); expect(seed?.appliedAdjustment).toBeNull();
    expect(seed?.snapshot).toEqual(last.recipeSnapshot); expect(brew).toEqual(before);
    if (seed) seed.snapshot.temperatureCelsius.value = 85;
    expect(last.recipeSnapshot.temperatureCelsius.value).not.toBe(85);
  });
  it("keeps historical snapshots when the source recipe is gone or a newer recipe exists", () => {
    const brew = createFullDemoFixtures().brews[0];
    expect(resolveQuickPreparation([{ ...brew, executionStatus: "completed" }], [])?.snapshot).toEqual(brew.recipeSnapshot);
    expect(beginnerRecipe([])).toBeNull();
    expect(beginnerRecipe(recipeFixtures.filter(recipe => recipe.id !== "gentle-start"))?.currentVersion.difficulty).toBe("beginner");
  });
  it("switches all recipe parameters and clears preparation linkage so completion cannot delete the original saved preparation", () => {
    const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const preparations = new LocalBrewPreparationRepository(storage), brews = new LocalBrewRepository(storage);
    const original = preparationFromRecipe(recipeFixtures[0]); original.snapshot.userGoal = "sweet";
    expect(preparations.save(original, "original-preparation", "2026-10-26T00:00:00.000Z").ok).toBe(true);
    const changed = switchPreparationRecipe({ ...original, sourceBrewId: "old-brew", sourcePreparationId: "original-preparation" }, recipeFixtures[1]);
    expect(changed.sourcePreparationId).toBeUndefined(); expect(changed.sourceBrewId).toBeNull(); expect(changed.appliedAdjustment).toBeNull();
    expect(changed.snapshot.steps.map(step => step.id)).toEqual(recipeFixtures[1].currentVersion.steps.map(step => step.id)); expect(changed.plan.sourceRecipeId).toBe(recipeFixtures[1].id);
    expect(changed.snapshot.userGoal).toBe("sweet"); expect(changed.plan.userGoal).toBe("sweet");
    const created = new BrewPreparationService(brews, preparations).create(changed, changed.sourcePreparationId); if (!created.ok) throw Error(created.message);
    const saved = brews.updateDraft({ ...created.value, executionStatus: "completed", recordStatus: "saved" }); if (!saved.ok) throw Error(saved.message);
    expect(consumeCompletedPreparation(saved.value, preparations).ok).toBe(true);
    const read = preparations.read(); if (!read.ok) throw Error(read.message);
    expect(read.value.entries.map(entry => entry.id)).toEqual(["original-preparation"]);
    expect(original.snapshot.sourceRecipeId).toBe(recipeFixtures[0].id);
  });
});
