import {describe,expect,it} from "vitest";
import {brewStepTiming} from "./brew-step-timing";
import type {BrewStageResult,RecipeStep} from "./types";
const steps:RecipeStep[]=[{id:"a",order:0,title:"A",targetWaterGrams:40,durationSeconds:45,instruction:""},{id:"b",order:1,title:"B",targetWaterGrams:100,instruction:""}];
const result=(seconds:number):BrewStageResult=>({stageId:"b",stageOrder:1,actualStartedAt:new Date(Date.parse("2026-10-28T00:00:00Z")+seconds*1000).toISOString(),actualCompletedAt:"2026-10-28T00:01:00Z",actualDurationSeconds:1,actualWeight:null,weightDifference:null,wasSkipped:false});
describe("brew step timing",()=>{
  it("reports actual start and late or early seconds",()=>{expect(brewStepTiming(steps,"b",[result(47)],"2026-10-28T00:00:00Z")).toEqual({actual:47,difference:2});expect(brewStepTiming(steps,"b",[result(42)],"2026-10-28T00:00:00Z")).toEqual({actual:42,difference:-3});});
  it("does not invent missing times or planned durations",()=>{expect(brewStepTiming(steps,"b",[],null)).toEqual({});expect(brewStepTiming([{...steps[0],durationSeconds:undefined},steps[1]],"b",[result(47)],"2026-10-28T00:00:00Z")).toEqual({actual:47});});
});
