import type { PourMethod, RecipeStep } from "./types";
/** pourMethod is canonical. Legacy patterns without an exact equivalent remain display-only. */
export function effectivePourMethod(step:Pick<RecipeStep,"pourMethod"|"pattern">):PourMethod|undefined{
  return step.pourMethod ?? (step.pattern==="center"?"center":step.pattern==="spiral"?"circle":undefined);
}
