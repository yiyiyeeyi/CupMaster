import {describe,expect,it} from "vitest";
import {LocalBeanRepository,BEANS_KEY} from "@/repositories/local-bean-repository";
import {LocalBrewRepository} from "@/repositories/local-brew-repository";
import {LocalBrewPreparationRepository} from "@/repositories/local-brew-preparation-repository";
import {recipeFixtures} from "@/data/fixtures/recipes";
import {beanBrews,legacyBeanCandidates} from "@/domain/beans";
import {preparationFromRecipe} from "./quick-preparation";
import {BeanService,selectPreparationBean} from "./bean-service";
import {BrewPreparationService} from "./brew-preparation-service";
import {validateLocalCloudMigrationGraph} from "@/domain/cloud-migration";
class Memory{data=new Map<string,string>();failKey:string|null=null;getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){if(key===this.failKey)throw Error("quota");this.data.set(key,value);}}
function setup(){const storage=new Memory(),beans=new LocalBeanRepository(storage),brews=new LocalBrewRepository(storage),preparations=new LocalBrewPreparationRepository(storage);return{storage,beans,brews,preparations,service:new BeanService(beans,brews,preparations),brewService:new BrewPreparationService(brews,preparations,undefined,undefined,beans)};}
describe("local Bean catalog",()=>{
  it("permits empty optional fields and persists the full bean profile",()=>{
    const s=setup();expect(s.beans.save({},"empty").ok).toBe(true);
    const input={name:"水洗",roaster:"Roaster",origin:"衣索比亞",process:"水洗",roastLevel:"淺",farm:"Farm",variety:"Heirloom",roastDate:"2026-10-01",cropYear:"2026",altitude:"1800–2200m",agtron:70,blend:"單一產區",flavors:["花香","柑橘"]};
    expect(s.beans.save(input,"full").ok).toBe(true);const loaded=s.beans.read();expect(loaded.ok&&loaded.value.beans.find(b=>b.id==="full")).toMatchObject(input);
  });
  it("preserves damaged storage and reports write failure without clearing input data",()=>{
    const s=setup();s.storage.data.set(BEANS_KEY,"broken");expect(s.beans.save({name:"new"},"new").ok).toBe(false);expect(s.storage.data.get(BEANS_KEY)).toBe("broken");
    s.storage.data.delete(BEANS_KEY);s.storage.failKey=BEANS_KEY;expect(s.beans.save({name:"retry"},"same-id").ok).toBe(false);s.storage.failKey=null;expect(s.beans.save({name:"retry"},"same-id").ok).toBe(true);
  });
  it("creates a bean snapshot for each Brew and keeps history after edits and deletion",()=>{
    const s=setup(),saved=s.beans.save({name:"Original",roaster:"R",origin:"A"},"bean");if(!saved.ok)throw Error("setup");
    const selected=selectPreparationBean(preparationFromRecipe(recipeFixtures[0]),saved.value);s.preparations.save(selected,"prepare","2026-10-27T00:00:00.000Z");
    const created=s.brewService.create(selected);if(!created.ok)throw Error(created.message);
    const before=structuredClone(created.value.recipeSnapshot);s.beans.save({name:"Edited",origin:"B"},"bean");
    expect(s.brews.getById(created.value.id).value?.recipeSnapshot).toEqual(before);expect(created.value.beanId).toBe("bean");
    expect(s.service.remove("bean").ok).toBe(true);const after=s.brews.getById(created.value.id).value;expect(after?.beanId).toBeUndefined();expect(after?.recipeSnapshot).toEqual(before);
    const prep=s.preparations.read();expect(prep.ok&&prep.value.entries[0].beanId).toBeUndefined();expect(prep.ok&&prep.value.entries[0].snapshot.bean?.name).toBe("Original");
  });
  it("retries failed unlinking without losing historical snapshots",()=>{
    const s=setup(),saved=s.beans.save({name:"Keep"},"bean");if(!saved.ok)throw Error("setup");
    const created=s.brewService.create(selectPreparationBean(preparationFromRecipe(recipeFixtures[0]),saved.value));if(!created.ok)throw Error("setup");
    s.storage.failKey="cupmaster:brews";expect(s.service.remove("bean").ok).toBe(false);expect(s.brews.getById(created.value.id).value?.beanId).toBe("bean");
    s.storage.failKey=null;expect(s.service.remove("bean").ok).toBe(true);expect(s.brews.getById(created.value.id).value?.recipeSnapshot).toEqual(created.value.recipeSnapshot);
  });
  it("only imports after explicit selection; skip and repeated confirmation are safe",()=>{
    const s=setup();const seed=preparationFromRecipe(recipeFixtures[0]);seed.snapshot.bean={id:"old",name:"Old",roaster:"R"};const created=s.brewService.create(seed);if(!created.ok)throw Error("setup");
    const original=structuredClone(created.value),candidates=legacyBeanCandidates([created.value,created.value],[]);expect(candidates).toHaveLength(1);expect(candidates[0].count).toBe(2);
    expect(s.beans.read()).toMatchObject({ok:true,value:{beans:[]}});
    expect(s.beans.confirmLegacyImport(candidates,[])).toMatchObject({ok:true,value:{beans:[],legacyImportReviewed:true}});
    expect(s.beans.confirmLegacyImport(candidates,[candidates[0].key]).ok).toBe(true);expect(s.beans.confirmLegacyImport(candidates,[candidates[0].key])).toMatchObject({ok:true,value:{beans:expect.any(Array)}});
    const read=s.beans.read();expect(read.ok&&read.value.beans).toHaveLength(1);expect(s.brews.getById(created.value.id).value).toEqual(original);
  });
  it("counts matching legacy records without inventing ratings",()=>{
    const s=setup(),saved=s.beans.save({name:"Coffee",roaster:"R"},"bean");if(!saved.ok)throw Error("setup");
    const seed=preparationFromRecipe(recipeFixtures[0]);seed.snapshot.bean={id:"old",name:"Coffee",roaster:"R"};const created=s.brewService.create(seed);if(!created.ok)throw Error("setup");
    const brew={...created.value,executionStatus:"completed" as const};expect(beanBrews(saved.value,[saved.value],[brew])).toHaveLength(1);
    expect(beanBrews(saved.value,[saved.value],[{...brew,beanId:"other"}])).toEqual([]);
  });
  it("keeps a stale deleted selection brewable without relinking it",()=>{
    const s=setup(),saved=s.beans.save({name:"Coffee"},"bean");if(!saved.ok)throw Error("setup");
    const selected=selectPreparationBean(preparationFromRecipe(recipeFixtures[0]),saved.value);s.service.remove("bean");
    const created=s.brewService.create(selected);expect(created.ok).toBe(true);expect(created.ok&&created.value.beanId).toBeUndefined();expect(created.ok&&created.value.recipeSnapshot.bean?.name).toBe("Coffee");
  });
  it("blocks both linked Brews and the standalone bean library from cloud migration",()=>{
    const s=setup(),saved=s.beans.save({name:"Coffee"},"bean");if(!saved.ok)throw Error("setup");
    const created=s.brewService.create(selectPreparationBean(preparationFromRecipe(recipeFixtures[0]),saved.value));if(!created.ok)throw Error("setup");
    expect(validateLocalCloudMigrationGraph({profile:null,brews:[created.value],suggestedPlans:[]}).valid).toBe(false);
    expect(validateLocalCloudMigrationGraph({profile:null,brews:[],suggestedPlans:[],beanCatalogUnavailable:true}).valid).toBe(false);
    const unlinked=structuredClone(created.value);delete unlinked.beanId;unlinked.recipeSnapshot.bean={id:"old",name:"Old",roaster:"R"};expect(validateLocalCloudMigrationGraph({profile:null,brews:[unlinked],suggestedPlans:[]}).valid).toBe(false);
    expect(validateLocalCloudMigrationGraph({profile:null,brews:[],suggestedPlans:[],beans:[saved.value]}).errors).toContainEqual(expect.objectContaining({code:"unsupported_local_beans"}));
  });
});
