import {describe,expect,it} from "vitest";
import {recipeFixtures} from "@/data/fixtures/recipes";
import {preparationFromRecipe,switchPreparationRecipe} from "@/application/quick-preparation";
import {synchronizePreparation} from "./brew-preparation";
import {compareGrindSettings,formatGrindSetting,grinders,grinderDefinition,grindSettingSchema,switchGrinderSetting} from "./grinders";
describe("structured grinder settings",()=>{
  it("clears incompatible formats rather than converting",()=>{
    expect(switchGrinderSetting({grinderId:"fellow-ode-gen-2",format:"compound",parts:[5,1]},"timemore-c3")).toBeUndefined();
    expect(switchGrinderSetting({grinderId:"timemore-c3",format:"single",value:18},"baratza-encore-esp")).toEqual({grinderId:"baratza-encore-esp",format:"single",value:18});
  });
  it("registers exactly seven sourced models; unknowns use numeric input",()=>{expect(grinders).toHaveLength(7);expect(grinders.every(g=>g.source.startsWith("https://"))).toBe(true);expect(grinderDefinition("unknown").format).toBe("number");});
  it("preserves compound notation without treating it as a decimal",()=>{
    const ode=grindSettingSchema.parse({grinderId:"fellow-ode-gen-2",format:"compound",parts:[5,1]});
    expect(formatGrindSetting(ode)).toBe("5.1");
    expect(formatGrindSetting(grindSettingSchema.parse({grinderId:"1zpresso-k-ultra",format:"compound",parts:[0,9,2]}))).toBe("0.9.2");
    expect(grindSettingSchema.safeParse({grinderId:"fellow-ode-gen-2",format:"number",value:5.1}).success).toBe(false);
    expect(grindSettingSchema.safeParse({...ode,parts:[11,1]}).success).toBe(false);
  });
  it("allows decimals only for numeric formats and compares only one grinder",()=>{
    const a=grindSettingSchema.parse({grinderId:"custom:mine",format:"number",value:2.5});
    expect(formatGrindSetting(a)).toBe("2.5");expect(compareGrindSettings(a,{grinderId:"custom:mine",format:"number",value:3})).toBe(-1);
    expect(compareGrindSettings(a,{...a,grinderId:"custom:other"})).toBeNull();
    expect(grindSettingSchema.safeParse({grinderId:"timemore-c3",format:"single",value:2.5}).success).toBe(false);
  });
  it("derives both old display fields from canonical data and keeps recipe switches consistent",()=>{
    const seed=preparationFromRecipe(recipeFixtures[0]);seed.snapshot.grind={grinderId:"timemore-c3",format:"single",value:18};
    seed.snapshot.equipment={dripper:"V60",grinderSetting:"wrong"};seed.snapshot.grindDescription={value:"wrong",recipeDefault:"fine",source:"user_override"};
    const normalized=synchronizePreparation(seed);expect(normalized.snapshot.equipment?.grinderSetting).toBe("18");
    expect(normalized.snapshot.grindDescription?.value).toBe("18 格");expect(normalized.plan.grindSetting?.value).toBe("18 格");
    expect(switchPreparationRecipe(normalized,recipeFixtures[1]).snapshot.grind).toEqual(seed.snapshot.grind);
  });
  it("never guesses structured data from legacy strings",()=>{
    const seed=preparationFromRecipe(recipeFixtures[0]);seed.snapshot.equipment={dripper:"V60",grinderSetting:"5.1"};
    expect(synchronizePreparation(seed).snapshot.grind).toBeUndefined();expect(synchronizePreparation(seed).snapshot.equipment?.grinderSetting).toBe("5.1");
  });
});
