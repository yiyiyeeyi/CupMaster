import {describe,expect,it} from "vitest";
import {changeGrinder,grindMicrons,type GrinderCalibration} from "./prepare-grind";
const testOnly: GrinderCalibration[] = [
  {grinder:"test A",sourceUrl:"https://example.test/calibration",points:[{setting:20,microns:600}]},
  {grinder:"test B",sourceUrl:"https://example.test/calibration",points:[{setting:30,microns:600}]},
];
describe("grinder source boundary",()=>{
  it("never invents microns for custom grinders or missing calibration points",()=>{
    expect(grindMicrons({grinder:"custom",setting:"24"})).toBeUndefined();
    expect(grindMicrons({grinder:"test A",setting:"21"},testOnly)).toBeUndefined();
  });
  it("changes only the explicitly selected grinder",()=>{
    expect(changeGrinder({grinder:"custom",setting:"24"},"my grinder",false)).toEqual({grinder:"my grinder",setting:"24"});
  });
  it("converts only a sourced exact match unless the setting is fixed",()=>{
    expect(changeGrinder({grinder:"test A",setting:"20"},"test B",false,testOnly)).toEqual({grinder:"test B",setting:"30"});
    expect(changeGrinder({grinder:"test A",setting:"20"},"test B",true,testOnly)).toEqual({grinder:"test B",setting:"20"});
  });
});
