import { describe, expect, it } from "vitest";
import { createBrewDraft, createQuickPrepareDefaults } from "./brew-factory";
import { BrewService } from "./brew-service";
import { flavorFeedbackInputSchema,flavorFeedbackSchema,feedbackRatingLabel,buildBrewAnalysisInput } from "@/domain";
import {RuleBasedBrewAnalysisProvider} from "./rule-based-brew-analysis-provider";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { LocalBrewRepository, LOCAL_BREW_KEY } from "@/repositories/local-brew-repository";

class MemoryStorage { values = new Map<string,string>(); failWrites = false; getItem(key:string) { return this.values.get(key) ?? null; } setItem(key:string,value:string) { if (this.failWrites) throw new Error("quota"); this.values.set(key,value); } }
const input = { stars:4 as const, overallImpression: "liked" as const, acidity: 4 as const, flavorNotes: ["clean" as const], freeformNotes: "  Bright cup  " };
function setup(status: "completed" | "in_progress" = "completed") { const storage = new MemoryStorage(); const repository = new LocalBrewRepository(storage); const draft = createBrewDraft(recipeFixtures[0], createQuickPrepareDefaults(recipeFixtures[0]), { now:()=>"2026-07-18T00:00:00.000Z", createId:()=>"brew-1" }); repository.createDraft({ ...draft, executionStatus:status, completedAt:status === "completed" ? "2026-07-18T00:03:00.000Z" : null, feedbackStatus:status === "completed" ? "awaiting_feedback" : "not_requested" }); return { storage, repository }; }
describe("Flavor Feedback", () => {
  it("requires whole stars for new submissions but keeps legacy storage readable",()=>{
    const {stars,...legacy}=input;
    expect(stars).toBe(4);expect(flavorFeedbackInputSchema.safeParse(legacy).success).toBe(false);
    for(const value of [0,6,2.5])expect(flavorFeedbackInputSchema.safeParse({...input,stars:value}).success).toBe(false);
    expect(flavorFeedbackSchema.safeParse({...legacy,id:"f",brewId:"b",createdAt:"2026-10-28T00:00:00Z",updatedAt:"2026-10-28T00:00:00Z"}).success).toBe(true);
    expect(feedbackRatingLabel(legacy)).toBe("喜歡");expect(feedbackRatingLabel({...legacy,stars:1})).toBe("★☆☆☆☆");
  });
  it("saves stars, aroma and tags without fabricating an impression or invoking analysis",()=>{
    const {storage,repository}=setup();const result=new BrewService(repository).upsertFlavorFeedback("brew-1",{stars:5,aroma:4,tasteTags:["sweet","clean"],flavorNotes:[]});
    expect(result).toMatchObject({ok:true,value:{analysisStatus:"not_requested",flavorFeedback:{stars:5,aroma:4,tasteTags:["sweet","clean"]}}});
    const reloaded=new LocalBrewRepository(storage).getById("brew-1").value?.flavorFeedback;
    expect(reloaded).toMatchObject({stars:5,aroma:4,tasteTags:["sweet","clean"]});expect(reloaded?.overallImpression).toBeUndefined();
    expect(flavorFeedbackInputSchema.safeParse({...input,aroma:2.5}).success).toBe(false);
    expect(flavorFeedbackInputSchema.safeParse({...input,tasteTags:["sweet","sweet"]}).success).toBe(false);
    expect(flavorFeedbackInputSchema.safeParse({...input,tasteTags:["invented"]}).success).toBe(false);
  });
  it("keeps legacy balance, impression and flavor notes while adding stars",()=>{
    const {repository}=setup(),brew=repository.getById("brew-1").value!;
    repository.updateDraft({...brew,flavorFeedback:{id:"f",brewId:brew.id,overallImpression:"liked",balance:2,flavorNotes:["floral"],createdAt:brew.createdAt,updatedAt:brew.updatedAt}});
    expect(new BrewService(repository).upsertFlavorFeedback(brew.id,{stars:3,flavorNotes:["floral"]})).toMatchObject({ok:true,value:{flavorFeedback:{stars:3,balance:2,overallImpression:"liked",flavorNotes:["floral"]}}});
  });
  it("uses stars before legacy impression in rule analysis without converting either",async()=>{
    const {repository}=setup(),brew=repository.getById("brew-1").value!;
    const feedback={id:"f",brewId:brew.id,overallImpression:"liked" as const,stars:1 as const,flavorNotes:[],createdAt:brew.createdAt,updatedAt:brew.updatedAt};
    const result=await new RuleBasedBrewAnalysisProvider().analyze(buildBrewAnalysisInput({...brew,flavorFeedback:feedback}));
    expect(result.observations.find(item=>item.id==="user-rating")?.evidence).toContainEqual({field:"feedback.stars",label:"User rating",value:"1/5"});
  });
  it("adds feedback to a completed Brew",()=>{ const {repository}=setup(); const result=new BrewService(repository,{now:()=>"2026-07-18T01:00:00.000Z",createId:()=>"feedback-1"}).upsertFlavorFeedback("brew-1",input); expect(result.ok && result.value.flavorFeedback?.id).toBe("feedback-1"); });
  it("rejects an in-progress Brew",()=>expect(new BrewService(setup("in_progress").repository).upsertFlavorFeedback("brew-1",input)).toMatchObject({ok:false,code:"invalid_execution_status"}));
  it("returns brew_not_found",()=>expect(new BrewService(new LocalBrewRepository(new MemoryStorage())).upsertFlavorFeedback("missing",input)).toMatchObject({ok:false,code:"brew_not_found"}));
  it("validates overall impression",()=>expect(flavorFeedbackInputSchema.safeParse({...input,overallImpression:"great"}).success).toBe(false));
  it("validates rating range and integers",()=>{ expect(flavorFeedbackInputSchema.safeParse({...input,acidity:6}).success).toBe(false); expect(flavorFeedbackInputSchema.safeParse({...input,acidity:2.5}).success).toBe(false); });
  it("validates flavor note union and duplicates",()=>{ expect(flavorFeedbackInputSchema.safeParse({...input,flavorNotes:["invented"]}).success).toBe(false); expect(flavorFeedbackInputSchema.safeParse({...input,flavorNotes:["clean","clean"]}).success).toBe(false); });
  it("validates notes length",()=>expect(flavorFeedbackInputSchema.safeParse({...input,freeformNotes:"x".repeat(501)}).success).toBe(false));
  it("creates timestamps and completes feedback without changing other statuses",()=>{ const {repository}=setup(); const result=new BrewService(repository,{now:()=>"2026-07-18T01:00:00.000Z",createId:()=>"feedback-1"}).upsertFlavorFeedback("brew-1",input); if(!result.ok) throw new Error(result.message); expect(result.value.flavorFeedback).toMatchObject({createdAt:"2026-07-18T01:00:00.000Z",updatedAt:"2026-07-18T01:00:00.000Z",freeformNotes:"Bright cup"}); expect(result.value).toMatchObject({feedbackStatus:"completed",analysisStatus:"not_requested",recordStatus:"saved"}); });
  it("allows missing Bean and Equipment",()=>{ const {repository}=setup(); const result=new BrewService(repository).upsertFlavorFeedback("brew-1",input); expect(result.ok).toBe(true); });
  it("preserves id and createdAt while editing",()=>{ const {repository}=setup(); new BrewService(repository,{now:()=>"2026-07-18T01:00:00.000Z",createId:()=>"feedback-1"}).upsertFlavorFeedback("brew-1",input); const result=new BrewService(repository,{now:()=>"2026-07-18T02:00:00.000Z",createId:()=>"feedback-2"}).upsertFlavorFeedback("brew-1",{...input,overallImpression:"neutral"}); if(!result.ok) throw new Error(result.message); expect(result.value.flavorFeedback).toMatchObject({id:"feedback-1",createdAt:"2026-07-18T01:00:00.000Z",updatedAt:"2026-07-18T02:00:00.000Z",overallImpression:"neutral"}); });
  it("skips without creating feedback and can later add it",()=>{ const {repository}=setup(); const skipped=new BrewService(repository).skipFlavorFeedback("brew-1"); expect(skipped.ok && skipped.value).toMatchObject({feedbackStatus:"skipped",flavorFeedback:null}); const added=new BrewService(repository).upsertFlavorFeedback("brew-1",input); expect(added.ok && added.value.feedbackStatus).toBe("completed"); });
  it("persists feedback across repository reload",()=>{ const {storage,repository}=setup(); new BrewService(repository).upsertFlavorFeedback("brew-1",input); expect(new LocalBrewRepository(storage).getById("brew-1").value?.flavorFeedback?.overallImpression).toBe("liked"); });
  it("migrates old v1 data missing flavorFeedback",()=>{ const {storage,repository}=setup(); const brew=repository.getById("brew-1").value!; const legacy={...brew}; delete (legacy as Partial<typeof legacy>).flavorFeedback; storage.values.set(LOCAL_BREW_KEY,JSON.stringify({version:1,data:{brews:[legacy]}})); expect(new LocalBrewRepository(storage).getById("brew-1").value?.flavorFeedback).toBeNull(); });
  it("persists skipped across reload",()=>{ const {storage,repository}=setup(); new BrewService(repository).skipFlavorFeedback("brew-1"); expect(new LocalBrewRepository(storage).getById("brew-1").value?.feedbackStatus).toBe("skipped"); });
  it("maps persistence failure",()=>{ const {storage,repository}=setup(); storage.failWrites=true; expect(new BrewService(repository).upsertFlavorFeedback("brew-1",input)).toMatchObject({ok:false,code:"persistence_failed"}); });
});
