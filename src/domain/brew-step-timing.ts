import type {BrewStageResult,RecipeStep} from "./types";
export function brewStepTiming(steps:RecipeStep[],stepId:string,results:BrewStageResult[],startedAt?:string|null):{actual?:number;difference?:number}{
  const ordered=[...steps].sort((a,b)=>a.order-b.order),index=ordered.findIndex(step=>step.id===stepId),result=results.find(result=>result.stageId===stepId);
  if(index<0||!result||!startedAt)return {};
  const elapsed=(Date.parse(result.actualStartedAt)-Date.parse(startedAt))/1000;
  if(!Number.isFinite(elapsed)||elapsed<0)return {};
  const actual=Math.round(elapsed),previous=ordered.slice(0,index);
  return {actual,...(previous.every(step=>step.durationSeconds!==undefined)?{difference:actual-previous.reduce((sum,step)=>sum+(step.durationSeconds??0),0)}:{})};
}
