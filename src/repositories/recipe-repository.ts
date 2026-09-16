import type { Recipe } from "@/domain";

export interface RecipeRepository { listRecipes(): Promise<Recipe[]>; getRecipeById(id: string): Promise<Recipe | null>; }
export class RecipeRepositoryError extends Error { constructor(message = "Unable to load recipes.") { super(message); this.name = "RecipeRepositoryError"; } }
