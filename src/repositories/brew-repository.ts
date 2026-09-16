import type { Brew } from "@/domain";
export type BrewReadResult<T>={ok:true;value:T;notice?:string}|{ok:false;message:string;value:T};
export type BrewWriteResult={ok:true;value:Brew}|{ok:false;message:string};
export interface BrewRepository{createDraft(draft:Brew):BrewWriteResult;getById(id:string):BrewReadResult<Brew|null>;findBySourceSuggestedPlanId(planId:string):BrewReadResult<Brew|null>;listAll():BrewReadResult<Brew[]>;listDrafts():BrewReadResult<Brew[]>;listJournalEntries():BrewReadResult<Brew[]>;upsertMany(drafts:Brew[],idPrefix:string):BrewReadResult<Brew[]>;removeByIdPrefix(idPrefix:string):{ok:true;removed:number}|{ok:false;message:string};updateDraft(draft:Brew):BrewWriteResult;deleteDraft(id:string):{ok:true}|{ok:false;message:string}}
