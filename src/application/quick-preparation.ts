import type { Brew, Recipe } from "@/domain";
import { synchronizePreparation, type BrewPreparation } from "@/domain/brew-preparation";
import { sortRecipesForExperience } from "@/domain/recipe-utils";
import type { BrewRepository } from "@/repositories/brew-repository";
import { createBrewPlan, createQuickPrepareDefaults } from "./brew-factory";

export interface PreparationSeed extends BrewPreparation { sourcePreparationId?: string; }
export function beginnerRecipe(recipes: Recipe[]) {
  return recipes.find(recipe => recipe.id === "gentle-start") ?? sortRecipesForExperience(recipes, "beginner")[0] ?? null;
}
export function preparationFromRecipe(recipe: Recipe): PreparationSeed {
  return { ...createBrewPlan(recipe, createQuickPrepareDefaults(recipe)), sourceBrewId: null, appliedAdjustment: null };
}
export function switchPreparationRecipe(seed: PreparationSeed, recipe: Recipe): PreparationSeed {
  const next = preparationFromRecipe(recipe);
  if (seed.snapshot.bean) next.snapshot.bean = structuredClone(seed.snapshot.bean);
  if (seed.snapshot.equipment?.notes) next.snapshot.equipment = { dripper: next.snapshot.dripper.value, notes: seed.snapshot.equipment.notes };
  if (seed.snapshot.userGoal) next.snapshot.userGoal = seed.snapshot.userGoal;
  // Return a fresh seed: sourcePreparationId and old recommendation/lineage cannot cross recipes.
  return synchronizePreparation(next);
}
export function resolveQuickPreparation(brews: Brew[], recipes: Recipe[]): PreparationSeed | null {
  const last = brews.filter(brew => !brew.legacyPreparationId && ["completed", "abandoned"].includes(brew.executionStatus))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))[0];
  if (last) return { snapshot: structuredClone(last.recipeSnapshot), plan: structuredClone(last.brewPlan), sourceBrewId: last.id, appliedAdjustment: null };
  const recipe = beginnerRecipe(recipes);
  return recipe ? preparationFromRecipe(recipe) : null;
}
export function loadQuickPreparation(repository: BrewRepository, recipes: Recipe[]) {
  const read = repository.listAll();
  if (!read.ok && read.value.length === 0) return { ok: false as const, message: read.message };
  const seed = resolveQuickPreparation(read.value, recipes);
  return seed ? { ok: true as const, value: seed, notice: read.ok ? read.notice : read.message } : { ok: false as const, message: "目前沒有可用食譜，請返回 Discover。" };
}
