import { effectivePourMethod } from "@/domain/pour-method";
import {brewStepTiming} from "@/domain/brew-step-timing";
import type { BrewStageResult, RecipeStep } from "@/domain";
import { formatDuration } from "@/domain";
import { brewSheetCopy as copy } from "./brew-sheet-copy";
import "./brew-sheet.css";

export interface BrewSheetValues {
  dose?: number; water?: number; temperature?: number; grind?: string; grinder?: string; seconds?: number; timeReference?: number; doseSource?: string; waterSource?: string; temperatureSource?: string; secondsSource?: string;
}
export function BrewParameterGrid({ values, label = copy.planned }: { values: BrewSheetValues; label?: string }) {
  const cells = [
    { label: copy.dose, value: values.dose, unit: "g", source:values.doseSource, icon: "◌" },
    { label: copy.water, value: values.water, unit: "g", source:values.waterSource, icon: "♧" },
    { label: copy.ratio, value: values.dose && values.water ? `1:${Number((values.water / values.dose).toFixed(2))}` : undefined, icon: "∶" },
    { label: copy.temperature, value: values.temperature, unit: "°C", source:values.temperatureSource, icon: "♨" },
    { label: copy.grind, value: values.grind || undefined, unit: values.grinder, icon: "⋮" },
    { label: copy.time, source:values.secondsSource, value: values.seconds === undefined ? undefined : formatDuration(values.seconds), unit: values.timeReference === undefined ? undefined : `${copy.recipeTime} ${formatDuration(values.timeReference)}`, icon: "◷" },
  ].filter(cell => cell.value !== undefined);
  if (!cells.length) return null;
  return <dl className="brew-parameter-grid" aria-label={label}>{cells.map(cell => <div key={cell.label}><span className="brew-parameter-icon" aria-hidden="true">{cell.icon}</span><dd>{cell.value}<small>{cell.unit}</small></dd><dt>{cell.label}{cell.source && <small> · {cell.source}</small>}</dt></div>)}</dl>;
}
export function BrewSteps({ steps, results, startedAt }: { steps: RecipeStep[]; results?: BrewStageResult[]; startedAt?: string | null }) {
  const ordered = [...steps].sort((a,b) => a.order-b.order);
  return <section className="brew-sheet-steps"><h2>{copy.steps}</h2><ol>{ordered.map((step, index) => {
    const planned = ordered.slice(0,index).reduce((sum,step)=>sum+(step.durationSeconds ?? 0),0);
    const {actual,difference}=brewStepTiming(steps,step.id,results??[],startedAt);
    const canonical = effectivePourMethod(step);
    const method = canonical ? copy.pourMethods[canonical] : step.pattern ? copy.patterns[step.pattern] : undefined;
    return <li key={step.id}><span className="brew-step-icon" aria-hidden="true">{step.pourMethod === "drain" ? "⋮" : "◎"}</span><div><h3>{step.title}<time>{formatDuration(actual ?? planned)}</time>{difference!==undefined&&difference!==0&&<span className="brew-step-difference">{difference>0?copy.late:copy.early} {Math.abs(difference)} {copy.seconds}</span>}</h3>{method && <p>{method}</p>}<p>{step.instruction}</p></div><strong aria-label={copy.target}>{step.targetWaterGrams}<small> g</small></strong></li>;
  })}</ol></section>;
}
