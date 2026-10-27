import {describe,expect,it} from "vitest";
import {preparationFromRecipe,switchPreparationRecipe} from "@/application/quick-preparation";
import {recipeFixtures} from "@/data/fixtures/recipes";
import {applyPrepareAmounts} from "./prepare-amount-application";
describe("amounts in preparation",()=>{
  it("scales stage targets, keeps gear and methods, and never mutates the seed",()=>{
    const seed=preparationFromRecipe(recipeFixtures[0]);
    seed.snapshot.equipment={dripper:seed.snapshot.dripper.value,grinder:"my grinder",grinderSetting:"24",accessories:["my accessory"]};
    seed.snapshot.steps[0].pourMethod="outward";
    const original=structuredClone(seed),next=applyPrepareAmounts(seed,{dose:30,water:480});
    expect(seed).toEqual(original);
    expect(next.snapshot.equipment).toEqual(original.snapshot.equipment);
    expect(next.snapshot.steps[0].pourMethod).toBe("outward");
    expect(next.snapshot.steps.at(-1)?.targetWaterGrams).toBe(480);
    expect(next.plan.waterTotal.value).toBe(480);
    expect(next.plan.stages[0].pourMethod).toBe("outward");
  });
  it("switching recipes never replaces the user's grinder",()=>{
    const seed=preparationFromRecipe(recipeFixtures[0]);
    seed.snapshot.equipment={dripper:seed.snapshot.dripper.value,grinder:"owned grinder",grinderSetting:"21"};
    const next=switchPreparationRecipe(seed,recipeFixtures[1]);
    expect(next.snapshot.equipment).toMatchObject({grinder:"owned grinder",grinderSetting:"21"});
    expect(next.snapshot.grindDescription?.value).toBe("21");
  });
});
