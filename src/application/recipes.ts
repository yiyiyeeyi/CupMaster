import { RecipeService } from "./recipe-service";
import { MockRecipeRepository } from "@/repositories/mock-recipe-repository";

export const recipeService = new RecipeService(new MockRecipeRepository());
