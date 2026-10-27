export interface PrepareAmounts { dose: number; water: number; doseFixed: boolean; waterFixed: boolean; }
export function amountRatio(value: Pick<PrepareAmounts,"dose" | "water">): number | null {
  return Number.isFinite(value.dose) && Number.isFinite(value.water) && value.dose > 0 && value.water > 0 ? value.water / value.dose : null;
}
/** Pins protect a value from linkage; direct edits remain possible. */
export function changePrepareAmount(current: PrepareAmounts, field: "dose" | "water", value: number): PrepareAmounts {
  const ratio = amountRatio(current);
  if (!Number.isFinite(value) || value <= 0 || ratio === null) return current;
  const next = { ...current, [field]: value };
  if (field === "dose" && !current.waterFixed) next.water = Math.round(value * ratio * 100) / 100;
  if (field === "water" && !current.doseFixed) next.dose = Math.round(value / ratio * 100) / 100;
  return next;
}
export function restorePrepareAmounts(current: PrepareAmounts, recipe: Pick<PrepareAmounts,"dose" | "water">): PrepareAmounts {
  return { ...current, dose:recipe.dose, water:recipe.water };
}
export function isRatioChanged(current: Pick<PrepareAmounts,"dose" | "water">, recipe: Pick<PrepareAmounts,"dose" | "water">): boolean {
  const actual = amountRatio(current), original = amountRatio(recipe);
  return actual !== null && original !== null && Math.abs(actual-original) > .005;
}
