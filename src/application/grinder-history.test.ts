import {afterEach,describe,expect,it,vi} from "vitest";
import {grinders,deriveGrind,grindSettingSchema,grinderDefinition} from "@/domain/grinders";
import {isValidPreparation,synchronizePreparation} from "@/domain/brew-preparation";
import {beanBrews} from "@/domain/beans";
import {recipeFixtures} from "@/data/fixtures/recipes";
import {LocalBeanRepository} from "@/repositories/local-bean-repository";
import {LocalBrewRepository} from "@/repositories/local-brew-repository";
import {LocalBrewPreparationRepository} from "@/repositories/local-brew-preparation-repository";
import {BrewPreparationService} from "./brew-preparation-service";
import {CollectionService} from "./collection-service";
import {selectPreparationBean} from "./bean-service";
import {preparationFromRecipe} from "./quick-preparation";

class Memory{
  data=new Map<string,string>();
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){this.data.set(key,value);}
}
afterEach(()=>vi.restoreAllMocks());
describe("historical grind settings survive registry changes",()=>{
  it.each(["narrowed range","changed format","removed model"] as const)("keeps Brew, Journal, preparation and Bean Detail data after %s",change=>{
    const storage=new Memory(),beans=new LocalBeanRepository(storage),brews=new LocalBrewRepository(storage),preparations=new LocalBrewPreparationRepository(storage);
    const bean=beans.save({name:"History"},"bean");if(!bean.ok)throw Error(bean.message);
    const seed=selectPreparationBean(preparationFromRecipe(recipeFixtures[0]),bean.value);
    seed.snapshot.grind={grinderId:"timemore-c3",format:"single",value:18};
    const create=new BrewPreparationService(brews,preparations,undefined,undefined,beans);
    const created=create.create(seed);if(!created.ok)throw Error(created.message);
    const completed={...created.value,executionStatus:"completed" as const,recordStatus:"saved" as const,completedAt:new Date().toISOString()};
    expect(brews.updateDraft(completed).ok).toBe(true);
    expect(preparations.save(seed,"prep",new Date().toISOString()).ok).toBe(true);
    const before=storage.getItem("cupmaster:brews"),definition=grinderDefinition("timemore-c3");
    vi.spyOn(grinders,"find").mockReturnValue(change==="removed model"?undefined:change==="changed format"?{...definition,format:"compound",parts:[{label:"圈",min:0},{label:"格",min:0,max:9}]}:{...definition,parts:[{label:"格",min:0,max:10}]});
    // New input is still checked against today's registry, while history is not.
    expect(grindSettingSchema.safeParse(seed.snapshot.grind).success).toBe(false);
    expect(isValidPreparation(synchronizePreparation(seed))).toBe(false);
    expect(create.create(seed).ok).toBe(false);
    const read=brews.getById(completed.id);expect(read.ok).toBe(true);expect(read.value?.recipeSnapshot).toEqual(completed.recipeSnapshot);
    expect(brews.listJournalEntries()).toMatchObject({ok:true,value:[{id:completed.id}]});
    const saved=preparations.read();expect(saved.ok&&saved.value.entries[0].snapshot.grind).toEqual(seed.snapshot.grind);
    if(!read.value)throw Error("Missing history");
    const displayed=deriveGrind(read.value.recipeSnapshot);
    expect(displayed.equipment?.grinderSetting).toBe("18");expect(displayed.grindDescription?.value.split(" ")[0]).toBe("18");
    const detail=new CollectionService(beans,brews,preparations).load();expect(detail.ok).toBe(true);
    if(!detail.ok)throw Error(detail.message);
    expect(detail.value.brewWarning).toBeUndefined();expect(beanBrews(bean.value,detail.value.allBeans,detail.value.brews).map(b=>b.id)).toEqual([completed.id]);
    expect(storage.getItem("cupmaster:brews")).toBe(before);
  });
  it("leaves malformed structured data untouched without throwing",()=>{
    const snapshot=preparationFromRecipe(recipeFixtures[0]).snapshot;
    snapshot.grind={grinderId:"unknown",format:"number",value:NaN};
    expect(deriveGrind(snapshot)).toBe(snapshot);
  });
});
