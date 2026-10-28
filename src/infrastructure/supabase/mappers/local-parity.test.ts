import {afterEach,describe,expect,it,vi} from "vitest";
import type {Brew,PourMethod,TasteTag} from "@/domain";
import type {BeanRecord} from "@/domain/beans";
import {beanSnapshot} from "@/domain/beans";
import type {AppliedBrewAdjustment,SavedBrewPreparation} from "@/domain/brew-preparation";
import {grinders,grinderDefinition,grindSettingSchema,type GrindSetting} from "@/domain/grinders";
import {brewPersistenceSchema} from "@/data/local-brew-schema";
import {createFullDemoFixtures} from "@/dev/demo-fixtures";
import {fromBrewRow,toBrewInsert} from "./brew-mapper";
import {fromBeanRow,toBeanRow,fromPreparationRow,toPreparationRow,fromLibraryStateRow,toLibraryStateRow,toLibraryStatePayload} from "./library-mappers";

const userId="11111111-1111-4111-8111-111111111111",at="2026-10-28T00:00:00.000Z",deletedAt="2026-10-28T02:00:00.000Z";
const methods:PourMethod[]=["circle","center","outward","inward","coin","excavate","drain"];
const tags:TasteTag[]=["sweet","sour","bitter","clean","full","light","aromatic","astringent","balanced"];
const settings:GrindSetting[]=[{grinderId:"timemore-c3",format:"single",value:18},{grinderId:"1zpresso-k-ultra",format:"compound",parts:[0,9,2]},{grinderId:"custom:mine",format:"number",value:2.5}];
function fullBean():BeanRecord{return {id:"parity-bean",name:"哥倫比亞 水洗",roaster:"Roaster",origin:"Colombia",process:"Washed",roastLevel:"Light",farm:"El Paraiso",variety:"Caturra",roastDate:"2026-10-20",cropYear:"2026",altitude:"1800–2200 m",agtron:75,blend:"Single farm",flavors:["citrus","tea"],legacyKeys:['["old name","roaster"]'],unlinkPending:false,createdAt:at,updatedAt:at};}
function fullBrew(setting:GrindSetting):Brew{
  const fixtures=createFullDemoFixtures(),base=fixtures.brews.find(brew=>brew.id==="demo-brew-b-complete"),source=fixtures.plans[0];
  if(!base||!source)throw Error("Missing existing parity fixture");
  const applied:AppliedBrewAdjustment={version:1,adjustment:{...source.adjustments[0],variable:"target_total_time",scope:"overall",stageId:null,direction:"increase",previousValue:244,suggestedValue:254,unit:"seconds",description:"Add ten seconds"},sourceAnalysisId:source.sourceAnalysisId,sourceRecommendationId:source.sourceRecommendationId,sourceFingerprint:source.sourceFingerprint,analysisGeneratedAt:source.sourceAnalysisGeneratedAt,rationale:source.rationale,confidence:source.confidence,evidence:source.evidence,changes:[{field:"totalTime",stageId:null,before:244,after:254,beforeSource:"user_override"}],appliedValue:254};
  const gear={grinderId:setting.grinderId,grinder:"Historical grinder",grinderSetting:setting.format==="compound"?setting.parts.join("."):String(setting.value),accessories:["Lilydrip","paper filter"]};
  const steps=methods.map((pourMethod,index)=>({...base.recipeSnapshot.steps[0],id:`step-${index}`,order:index,title:`Pour ${index+1}`,durationSeconds:20,targetWaterGrams:40*(index+1),pourMethod,guidance:{start:"Start slowly",end:"Wait",details:[{id:`hint-${index}`,atSeconds:2,message:"Keep steady"}]}}));
  return brewPersistenceSchema.parse({...base,beanId:fullBean().id,sourcePreparationId:"saved-preparation",legacyPreparationId:"legacy-preparation",appliedAdjustment:applied,executionRun:3,currentStagePausedSeconds:1.25,sourceType:"previous_brew",sourceBrewId:source.sourceBrewId,sourceAnalysisId:source.sourceAnalysisId,sourceRecommendationId:source.sourceRecommendationId,sourceFingerprint:source.sourceFingerprint,
    recipeSnapshot:{...base.recipeSnapshot,grind:setting,bean:beanSnapshot(fullBean()),brewTemperatureMode:"iced",iceGrams:100,equipment:{...gear,dripper:base.recipeSnapshot.dripper.value,equipmentId:"gear-id",notes:"Keep this setup"},userGoal:"Clean cup",steps},
    brewPlan:{...base.brewPlan,grind:setting,brewTemperatureMode:"iced",iceGrams:100,equipment:gear,beanMetadata:{name:fullBean().name!},equipmentNotes:"Keep this setup",userGoal:"Clean cup",stages:steps.map(step=>({id:step.id,order:step.order,title:step.title,targetWaterGrams:step.targetWaterGrams,targetDurationSeconds:step.durationSeconds,pattern:step.pattern,pourMethod:step.pourMethod,instruction:step.instruction,guidance:step.guidance}))},
    stageResults:steps.map((step,index)=>({stageId:step.id,stageOrder:index,actualStartedAt:new Date(Date.parse(at)+index*20_000).toISOString(),actualCompletedAt:new Date(Date.parse(at)+(index+1)*20_000).toISOString(),actualDurationSeconds:20,actualWeight:null,weightDifference:null,wasSkipped:false})),
    flavorFeedback:{id:"parity-feedback",brewId:base.id,stars:5,aroma:4,tasteTags:tags,acidity:3,sweetness:4,bitterness:2,body:3,clarity:5,aftertaste:4,balance:4,flavorNotes:["floral","clean"],freeformNotes:"Sweet finish",createdAt:at,updatedAt:at}});
}
function fullPreparation(setting=settings[0]):SavedBrewPreparation{const brew=fullBrew(setting);return {id:"saved-preparation",beanId:brew.beanId,snapshot:brew.recipeSnapshot,plan:brew.brewPlan,sourceBrewId:brew.sourceBrewId??null,appliedAdjustment:brew.appliedAdjustment??null,legacyPlanId:"legacy-plan",legacyBrewId:"legacy-brew",createdAt:at,updatedAt:at};}
afterEach(()=>vi.restoreAllMocks());

describe("REQ-37b lossless local parity mappers",()=>{
  it.each(settings)("round-trips every optional Brew payload with $format grind",setting=>{
    const brew=fullBrew(setting),before=structuredClone(brew),row=toBrewInsert(userId,brew,7);
    expect(fromBrewRow(row)).toEqual({entity:brew,revision:7});expect(brew).toEqual(before);
    expect(fromBrewRow(row).entity.flavorFeedback?.overallImpression).toBeUndefined();
    expect(fromBrewRow(row).entity.recipeSnapshot.steps.map(step=>step.pourMethod)).toEqual(methods);
    expect(row).toMatchObject({bean_id:"parity-bean",source_preparation_id:"saved-preparation",legacy_preparation_id:"legacy-preparation",applied_adjustment_present:true});
  });
  it("preserves absent versus explicitly null appliedAdjustment",()=>{
    const brew=fullBrew(settings[0]);delete brew.appliedAdjustment;
    const absent=fromBrewRow(toBrewInsert(userId,brew)).entity;
    expect(absent).not.toHaveProperty("appliedAdjustment");
    const explicit=fromBrewRow(toBrewInsert(userId,{...brew,appliedAdjustment:null})).entity;
    expect(explicit).toHaveProperty("appliedAdjustment",null);
  });
  it.each([false,true])("round-trips full Bean payload, deleted=%s",deleted=>{
    const bean:BeanRecord={...fullBean(),...(deleted&&{deletedAt,unlinkPending:true})},before=structuredClone(bean);
    expect(fromBeanRow(toBeanRow(userId,bean,3))).toEqual({entity:bean,revision:3});expect(bean).toEqual(before);
  });
  it.each([false,true])("round-trips saved preparation payload, deleted=%s",deleted=>{
    const record={id:"saved-preparation",entry:fullPreparation(),deletedAt:deleted?deletedAt:null},before=structuredClone(record);
    expect(fromPreparationRow(toPreparationRow(userId,record,4,at))).toEqual({entity:record,revision:4});expect(record).toEqual(before);
  });
  it("round-trips an id-only preparation tombstone but rejects a null active payload",()=>{
    const tombstone={id:"deleted-only",entry:null,deletedAt};
    expect(fromPreparationRow(toPreparationRow(userId,tombstone,2,at))).toEqual({entity:tombstone,revision:2});
    expect(()=>toPreparationRow(userId,{...tombstone,deletedAt:null},2,at)).toThrow();
  });
  it("uploads only library metadata whitelist, never backups or raw migration data",()=>{
    const clean={legacyImportReviewed:true,redirects:{"legacy-brew":"saved-preparation"},lineage:{"new-brew":{sourceBrewId:"old-brew",appliedAdjustment:fullPreparation().appliedAdjustment}},deletedIds:["deleted-only"]};
    const local={...clean,backups:[{plans:"PRIVATE_RAW_PLANS",brews:"PRIVATE_RAW_BREWS"}],processedRaw:"PRIVATE_RAW_INPUT",warnings:["local-only"]},before=structuredClone(local);
    const row=toLibraryStateRow(userId,local,5,at);
    expect(row.payload).toEqual(clean);expect(toLibraryStatePayload(local)).toEqual(clean);expect(fromLibraryStateRow(row)).toEqual({entity:clean,revision:5});
    expect(JSON.stringify(row)).not.toMatch(/backups|processedRaw|warnings|PRIVATE_RAW/);expect(local).toEqual(before);
  });
  it("round-trips legacy impression, literal grind text and pattern without conversion",()=>{
    const fixtures=createFullDemoFixtures(),old=fixtures.brews.find(brew=>brew.id==="demo-brew-b-complete");if(!old)throw Error("Missing legacy fixture");
    const legacy=brewPersistenceSchema.parse(old);legacy.recipeSnapshot.grindDescription={value:"+1.5 圈",recipeDefault:"+1.5 圈",source:"user_override"};
    legacy.recipeSnapshot.equipment={dripper:legacy.recipeSnapshot.dripper.value,grinder:"Old mill",grinderSetting:"5.1"};
    legacy.recipeSnapshot.steps[0].pattern="pulse";delete legacy.recipeSnapshot.steps[0].pourMethod;
    const before=structuredClone(legacy),result=fromBrewRow(toBrewInsert(userId,legacy)).entity;
    expect(result).toEqual(legacy);expect(result.recipeSnapshot.grind).toBeUndefined();expect(result.recipeSnapshot.steps[0].pourMethod).toBeUndefined();expect(result.flavorFeedback?.stars).toBeUndefined();expect(result.flavorFeedback?.overallImpression).toBe("liked");expect(legacy).toEqual(before);
  });
  it.each(["range","format"] as const)("reads Brew and preparation history after registry %s changes",change=>{
    const brew=fullBrew(settings[0]),preparation=fullPreparation(),row=toBrewInsert(userId,brew),preparationRow=toPreparationRow(userId,{id:preparation.id,entry:preparation,deletedAt:null},1,at),definition=grinderDefinition("timemore-c3");
    vi.spyOn(grinders,"find").mockReturnValue(change==="range"?{...definition,parts:[{label:"格",min:0,max:10}]}:{...definition,format:"compound",parts:[{label:"圈",min:0,max:1},{label:"格",min:0,max:9}]});
    expect(grindSettingSchema.safeParse(settings[0]).success).toBe(false);
    expect(fromBrewRow(row).entity).toEqual(brew);expect(fromPreparationRow(preparationRow).entity.entry).toEqual(preparation);
  });
  it("rejects mismatched payload identities without changing the provided row",()=>{
    const bean=toBeanRow(userId,fullBean()),preparation=toPreparationRow(userId,{id:"saved-preparation",entry:fullPreparation(),deletedAt:null});
    expect(()=>fromBeanRow({...bean,id:"different"})).toThrow();expect(()=>fromPreparationRow({...preparation,id:"different"})).toThrow();
  });
});
