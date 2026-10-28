import {describe,expect,it} from "vitest";
import {CollectionService} from "./collection-service";
import {LocalBeanRepository} from "@/repositories/local-bean-repository";
import {LocalBrewRepository} from "@/repositories/local-brew-repository";
import {LocalBrewPreparationRepository} from "@/repositories/local-brew-preparation-repository";
import {BrewPreparationService} from "./brew-preparation-service";
import {preparationFromRecipe} from "./quick-preparation";
import {recipeFixtures} from "@/data/fixtures/recipes";
class Memory{data=new Map<string,string>();getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}}
function setup(){const storage=new Memory(),beans=new LocalBeanRepository(storage),brews=new LocalBrewRepository(storage),plans=new LocalBrewPreparationRepository(storage);return{storage,beans,brews,plans,service:new CollectionService(beans,brews,plans),create:new BrewPreparationService(brews,plans)};}
describe("Collection service",()=>{
  it("reads legacy candidates without writes, imports only confirmed selection, and keeps Brew history",()=>{
    const s=setup(),seed=preparationFromRecipe(recipeFixtures[0]);seed.snapshot.bean={id:"legacy",name:"Legacy Coffee",roaster:"R"};
    const created=s.create.create(seed);if(!created.ok)throw Error("setup");
    const before=s.storage.getItem("cupmaster:brews"),read=s.service.load();expect(read.ok&&read.value.beans).toEqual([]);expect(read.ok&&read.value.candidates).toHaveLength(1);
    expect(s.storage.getItem("cupmaster:beans")).toBeNull();
    if(!read.ok)return;expect(s.service.confirmImport([read.value.candidates[0].key]).ok).toBe(true);
    const after=s.service.load();expect(after.ok&&after.value.beans).toHaveLength(1);expect(after.ok&&after.value.candidates).toEqual([]);expect(s.storage.getItem("cupmaster:brews")).toBe(before);
  });
  it("shows only persisted preparations in the plan tab data",()=>{
    const s=setup();expect(s.plans.save(preparationFromRecipe(recipeFixtures[0]),"p","2026-10-28T00:00:00.000Z").ok).toBe(true);
    const read=s.service.load();expect(read.ok&&read.value.preparations.map(plan=>plan.id)).toEqual(["p"]);
  });
  it("skip is persisted without creating Bean entities",()=>{
    const s=setup();expect(s.service.confirmImport([]).ok).toBe(true);expect(s.beans.read()).toMatchObject({ok:true,value:{legacyImportReviewed:true,beans:[]}});
  });
});
