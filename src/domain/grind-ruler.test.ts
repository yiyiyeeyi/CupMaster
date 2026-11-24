import { describe, expect, it } from "vitest";
import { grinderDefinition, grindSettingSchema } from "./grinders";
import { cupLevels, grindRuler } from "./grind-ruler";

describe("grindRuler", () => {
  it("maps single-number grinders one click per tick", () => {
    const ruler = grindRuler(grinderDefinition("timemore-c3"), { grinderId: "timemore-c3", format: "single", value: 18 })!;
    expect(ruler.indexOf({ grinderId: "timemore-c3", format: "single", value: 18 })).toBe(18);
    expect(ruler.settingAt(16)).toEqual({ grinderId: "timemore-c3", format: "single", value: 16 });
    expect(ruler.dots).toBe(true);
    expect(ruler.tick(16).label).toBe("16");
  });
  it("respects bounded ranges", () => {
    const ruler = grindRuler(grinderDefinition("baratza-encore-esp"))!;
    expect(ruler.count).toBe(40);
    expect(ruler.settingAt(0)).toEqual({ grinderId: "baratza-encore-esp", format: "single", value: 1 });
  });
  it("walks K-Ultra rotation.number.click", () => {
    const ruler = grindRuler(grinderDefinition("1zpresso-k-ultra"))!;
    expect(ruler.settingAt(75)).toEqual({ grinderId: "1zpresso-k-ultra", format: "compound", parts: [0, 7, 5] });
    expect(ruler.indexOf({ grinderId: "1zpresso-k-ultra", format: "compound", parts: [1, 2, 3] })).toBe(123);
    expect(ruler.tick(100).label).toBe("1圈");
    expect(ruler.tick(70).label).toBe("7");
    expect(ruler.tick(71).major).toBe(false);
  });
  it("keeps Ode Gen 2 settings valid, ending at 11", () => {
    const ruler = grindRuler(grinderDefinition("fellow-ode-gen-2"))!;
    expect(ruler.count).toBe(31);
    expect(ruler.settingAt(13)).toEqual({ grinderId: "fellow-ode-gen-2", format: "compound", parts: [5, 1] });
    for (let i = 0; i < ruler.count; i++) expect(grindSettingSchema.safeParse(ruler.settingAt(i)).success).toBe(true);
  });
  it("has no ruler for typed-number grinders", () => {
    expect(grindRuler(grinderDefinition("my custom grinder"))).toBeNull();
  });
});

describe("cupLevels", () => {
  it("grows with water and dose, capped at the brim", () => {
    const base = cupLevels(20, 300);
    expect(cupLevels(20, 400).water).toBeGreaterThan(base.water);
    expect(cupLevels(26, 300).bed).toBeGreaterThan(base.bed);
    expect(base.bed).toBeLessThan(base.water);
    expect(cupLevels(100, 2000).water).toBe(1);
  });
});
