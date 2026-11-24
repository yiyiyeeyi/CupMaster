import { describe, expect, it } from "vitest";
import { amountRatio, changePrepareAmount, isRatioChanged, restorePrepareAmounts, type PrepareAmounts } from "./prepare-amounts";
const original: PrepareAmounts = { dose:20,water:300,doseFixed:false,waterFixed:false };
describe("Quick Prepare amount linkage",()=>{
  it("rounds linked dose when water increases by 10 g", () => {
    const next = changePrepareAmount({ ...original, dose: 15, water: 240 }, "water", 250);
    expect(next).toMatchObject({ dose: 15.6, water: 250 });
    expect(amountRatio(next)?.toFixed(2)).toBe("16.03");
  });
  it("leaves pinned dose intact when water increases by 10 g", () => {
    const next = changePrepareAmount({ ...original, dose: 15, water: 240, doseFixed: true }, "water", 250);
    expect(next).toMatchObject({ dose: 15, water: 250 });
    expect(isRatioChanged(next, { dose: 15, water: 240 })).toBe(true);
  });
  it("uses the changed ratio and rounds linked water to whole grams", () => {
    const changed = changePrepareAmount({ ...original, waterFixed: true }, "dose", 18);
    const next = changePrepareAmount({ ...changed, waterFixed: false }, "dose", 20);
    expect(next).toMatchObject({ dose: 20, water: 333 });
    expect(amountRatio(next)).toBe(16.65);
  });
  it.each([
    [false,false,"dose",25,25,375], [false,false,"water",450,30,450],
    [true,false,"water",400,20,400], [false,true,"dose",25,25,300],
    [true,true,"dose",25,25,300], [true,true,"water",400,20,400],
  ] as const)("fixed %s/%s editing %s", (doseFixed,waterFixed,field,value,dose,water)=>{
    expect(changePrepareAmount({...original,doseFixed,waterFixed},field,value)).toEqual({dose,water,doseFixed,waterFixed});
  });
  it("allows direct edits to pinned fields",()=>{
    expect(changePrepareAmount({...original,doseFixed:true},"dose",30)).toMatchObject({dose:30,water:450});
  });
  it("tracks deviation and restores recipe amounts without changing pins",()=>{
    const changed=changePrepareAmount({...original,waterFixed:true},"dose",15);
    expect(isRatioChanged(changed,original)).toBe(true);
    expect(restorePrepareAmounts(changed,original)).toEqual({...original,waterFixed:true});
    expect(isRatioChanged(restorePrepareAmounts(changed,original),original)).toBe(false);
  });
  it("uses the current ratio after an intentional change",()=>{
    const changed=changePrepareAmount({...original,waterFixed:true},"dose",15);
    expect(changePrepareAmount({...changed,waterFixed:false},"dose",20)).toMatchObject({dose:20,water:400});
  });
  it.each([NaN,Infinity,0,-1])("rejects invalid values %s",value=>{
    expect(changePrepareAmount(original,"dose",value)).toBe(original);
  });
});
