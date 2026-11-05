import { effectivePourMethod } from "./pour-method";
import type { PourPathPlaybackProps, RecipeStep } from "./types";

export function createPourPathPlaybackProps(
  step: Pick<RecipeStep, "pourMethod" | "pattern" | "pourPath"> | undefined,
  elapsedSeconds: number,
): PourPathPlaybackProps {
  return {
    method: step ? effectivePourMethod(step) : undefined,
    ...(step?.pourPath && { pourPath: step.pourPath }),
    elapsedSeconds: Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0),
  };
}
