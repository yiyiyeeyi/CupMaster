import type { BrewPreparation } from "./brew-preparation";
import { synchronizePreparation } from "./brew-preparation";
import type { PrepareAmounts } from "./prepare-amounts";
/** Scale cumulative stage targets along with the chosen total, retaining gear and pour methods. */
export function applyPrepareAmounts<T extends BrewPreparation>(seed:T,amounts:Pick<PrepareAmounts,"dose"|"water">):T{
  const result=structuredClone(seed), snapshot=result.snapshot, previous=snapshot.totalWaterGrams.value;
  snapshot.doseGrams.value=amounts.dose;snapshot.totalWaterGrams.value=amounts.water;
  snapshot.doseGrams.source=amounts.dose===snapshot.doseGrams.recipeDefault?"recipe_default":"user_override";
  snapshot.totalWaterGrams.source=amounts.water===snapshot.totalWaterGrams.recipeDefault?"recipe_default":"user_override";
  if(previous>0 && previous!==amounts.water) snapshot.steps=snapshot.steps.map(step=>({...step,targetWaterGrams:Math.round(step.targetWaterGrams/previous*amounts.water*100)/100}));
  return {...result,...synchronizePreparation(result)};
}
