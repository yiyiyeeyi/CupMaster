import {describe,expect,it} from "vitest";
import {bestStars,previousRatingDelta} from "./brew-ratings";
import {createBrewDraft,createQuickPrepareDefaults} from "@/application/brew-factory";
import {recipeFixtures} from "@/data/fixtures/recipes";
import type {Brew,FlavorRating} from "./types";
import {beanIdentity,type BeanRecord} from "./beans";
function cup(id:string,minute:number,stars?:FlavorRating,beanId="bean"):Brew{
  const base=createBrewDraft(recipeFixtures[0],createQuickPrepareDefaults(recipeFixtures[0]),{createId:()=>id,now:()=>new Date(Date.UTC(2026,9,28,0,minute)).toISOString()});
  return {...base,beanId,executionStatus:"completed",completedAt:base.createdAt,flavorFeedback:{id:`f-${id}`,brewId:id,stars,overallImpression:"liked",flavorNotes:[],createdAt:base.createdAt,updatedAt:base.updatedAt}};
}
describe("real star aggregates and prior cup",()=>{
  it("does not convert legacy impression or count unfinished cups",()=>{const legacy=cup("old",1),unfinished={...cup("draft",2,5),executionStatus:"in_progress" as const};expect(bestStars([legacy,unfinished])).toBeUndefined();expect(bestStars([legacy,cup("rated",3,4),unfinished])).toBe(4);});
  it("compares only the same bean, regardless of intervening other beans",()=>{const a=cup("a",1,2),other=cup("other",2,5,"another"),b=cup("b",3,4);expect(previousRatingDelta(b,[a,other,b])).toBe(2);expect(previousRatingDelta(a,[a,other,b])).toBeUndefined();});
  it("does not skip a prior unrated cup to compare an older rated cup",()=>{const a=cup("a",1,2),b=cup("b",2),c=cup("c",3,5);expect(previousRatingDelta(c,[a,b,c])).toBeUndefined();expect(previousRatingDelta(b,[a,b,c])).toBeUndefined();});
  it("handles down and equal ratings without changing data",()=>{const a=cup("a",1,5),b=cup("b",2,3),c=cup("c",3,3),before=structuredClone([a,b,c]);expect(previousRatingDelta(b,[a,b,c])).toBe(-2);expect(previousRatingDelta(c,[a,b,c])).toBe(0);expect([a,b,c]).toEqual(before);});
  it("links uniquely imported legacy names and preserves ambiguity",()=>{
    const old=cup("old",1,2);delete old.beanId;old.recipeSnapshot.bean={id:"legacy",name:"Old name",roaster:"R"};
    const current=cup("new",2,4),bean:BeanRecord={id:"bean",name:"New name",roaster:"R",legacyKeys:[beanIdentity("Old name","R")!],createdAt:current.createdAt,updatedAt:current.updatedAt};
    expect(previousRatingDelta(current,[old,current],[bean])).toBe(2);
    expect(previousRatingDelta(current,[old,current],[bean,{...bean,id:"duplicate"}])).toBeUndefined();
  });
});
