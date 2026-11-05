import { describe, expect, it } from "vitest";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { calculateRatio, recipeSchema, sortRecipesForExperience, userProfileSchema } from "@/domain";
import { MockRecipeRepository } from "./mock-recipe-repository";

describe("MockRecipeRepository and recipe domain", () => {
  const repository = new MockRecipeRepository();
  it("lists the seeded recipes including 4:6 Method", async () => { const recipes = await repository.listRecipes(); expect(recipes).toHaveLength(6); expect(recipes.map(({ id }) => id)).toContain("four-six-method"); });
  it("gets a recipe by id", async () => { expect((await repository.getRecipeById("gentle-start"))?.id).toBe("gentle-start"); });
  it("returns null for an unknown recipe", async () => { expect(await repository.getRecipeById("missing")).toBeNull(); });
  it("sorts beginner recipes deterministically", () => { const first = sortRecipesForExperience(recipeFixtures, "beginner").map((item) => item.id); const second = sortRecipesForExperience(recipeFixtures, "beginner").map((item) => item.id); expect(first).toEqual(second); expect(["gentle-start", "quick-morning"]).toContain(first[0]); });
  it("calculates ratio and rejects unusable inputs", () => { expect(calculateRatio(15, 240)).toBe(16); expect(calculateRatio(0, 240)).toBeNull(); });
  it("validates every fixture against the recipe schema", () => { expect(recipeFixtures.every((recipe) => recipeSchema.safeParse(recipe).success)).toBe(true); });
  it("rejects illegal domain values", () => { expect(userProfileSchema.safeParse({ id: "u", displayName: "Yiyi", experienceLevel: "expert", currentNeeds: [], createdAt: "bad", updatedAt: "bad" }).success).toBe(false); expect(recipeSchema.safeParse({}).success).toBe(false); });
});
