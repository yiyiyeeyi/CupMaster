import { recipeFixtures } from "@/data/fixtures/recipes";
import type { Recipe } from "@/domain";
import type { RecipeRepository } from "./recipe-repository";

export class MockRecipeRepository implements RecipeRepository {
  constructor(private readonly recipes: Recipe[] = recipeFixtures) {}
  async listRecipes(): Promise<Recipe[]> { return [...this.recipes]; }
  async getRecipeById(id: string): Promise<Recipe | null> { return this.recipes.find((recipe) => recipe.id === id) ?? null; }
}
