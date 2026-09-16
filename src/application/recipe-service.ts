import { sortRecipesForExperience } from "@/domain";
import type { Recipe, UserExperienceLevel } from "@/domain";
import type { RecipeRepository } from "@/repositories/recipe-repository";

export class RecipeService {
  constructor(private readonly repository: RecipeRepository) {}
  async discover(experience?: UserExperienceLevel): Promise<Recipe[]> { return sortRecipesForExperience(await this.repository.listRecipes(), experience); }
  async detail(id: string): Promise<Recipe | null> { return this.repository.getRecipeById(id); }
}
