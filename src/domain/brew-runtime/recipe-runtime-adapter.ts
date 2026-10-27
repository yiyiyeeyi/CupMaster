import type { RecipeStep } from "../types";
import type {
  BrewRecipeRuntimeDefinition,
  BrewRecipeStageDefinition,
  BrewStageGuidance,
} from "./brew-runtime-types";

export interface RuntimeRecipeSource {
  recipeId: string;
  recipeName: string;
  steps: readonly RecipeStep[];
}

function runtimeGuidance(step: RecipeStep): BrewStageGuidance | undefined {
  const guidance = step.guidance;
  if (guidance === undefined) return undefined;
  return {
    ...(guidance.start !== undefined && { start: guidance.start }),
    ...(guidance.end !== undefined && { end: guidance.end }),
    ...(guidance.details !== undefined && {
      details: guidance.details.map((detail) => ({
        id: detail.id,
        atElapsedMs: detail.atSeconds * 1_000,
        message: detail.message,
      })),
    }),
  };
}

export function createBrewRuntimeRecipeDefinition(
  source: RuntimeRecipeSource,
): BrewRecipeRuntimeDefinition {
  const stages: BrewRecipeStageDefinition[] = source.steps.map((step) => ({
    id: step.id,
    order: step.order,
    name: step.title,
    ...(step.pourMethod !== "drain" && step.durationSeconds !== undefined && { targetPourDurationMs: step.durationSeconds * 1_000 }),
    autoAdvanceEnabled: true,
    ...(step.guidance !== undefined && { guidance: runtimeGuidance(step) }),
  }));
  return {
    recipeId: source.recipeId,
    recipeName: source.recipeName,
    stages,
    completeAfterLastPourStops: true,
  };
}
