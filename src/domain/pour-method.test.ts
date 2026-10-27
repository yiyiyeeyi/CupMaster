import {describe,expect,it} from "vitest";
import {effectivePourMethod} from "./pour-method";
describe("canonical pour method",()=>{
  it("prefers the explicit method to a conflicting legacy pattern",()=>expect(effectivePourMethod({pourMethod:"drain",pattern:"spiral"})).toBe("drain"));
  it("maps only exact legacy equivalents",()=>{
    expect(effectivePourMethod({pattern:"center"})).toBe("center");expect(effectivePourMethod({pattern:"spiral"})).toBe("circle");
    for(const pattern of ["pulse","continuous","immersion"] as const)expect(effectivePourMethod({pattern})).toBeUndefined();
  });
});
