import { describe, expect, it } from "vitest";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";
import { applyBrewAdjustment, cancelBrewAdjustment, type BrewPreparation } from "@/domain/brew-preparation";
import { LocalBrewPreparationRepository, BREW_PREPARATIONS_KEY } from "@/repositories/local-brew-preparation-repository";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { BrewPreparationService } from "./brew-preparation-service";
import { BrewService } from "./brew-service";
import { validateLocalCloudMigrationGraph } from "@/domain/cloud-migration";

class Memory {
  data = new Map<string, string>(); fail = false;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error("quota"); this.data.set(key, value); }
}
function setup() {
  const fixtures = createFullDemoFixtures(), storage = new Memory();
  storage.setItem("cupmaster:brews", JSON.stringify({ version: 1, data: { brews: fixtures.brews } }));
  storage.setItem("cupmaster:suggested-plans", JSON.stringify({ version: 2, data: { plans: fixtures.plans } }));
  const preparations = new LocalBrewPreparationRepository(storage), brews = new LocalBrewRepository(storage);
  let sequence = 0;
  return { fixtures, storage, preparations, brews, service: new BrewPreparationService(brews, preparations, () => `new-${++sequence}`, () => "2026-10-25T00:00:00.000Z") };
}
function seed() {
  const s = setup(), brew = s.fixtures.brews[0], plan = s.fixtures.plans[0];
  const value: BrewPreparation = { snapshot: structuredClone(brew.recipeSnapshot), plan: structuredClone(brew.brewPlan), sourceBrewId: brew.id, appliedAdjustment: null };
  const metadata = { adjustment: { ...plan.adjustments[0], variable: "target_total_time" as const, scope: "overall" as const, stageId: null,
    previousValue: value.snapshot.expectedTimeSeconds.value, suggestedValue: value.snapshot.expectedTimeSeconds.value + 10 },
    sourceAnalysisId: plan.sourceAnalysisId, sourceRecommendationId: plan.sourceRecommendationId, sourceFingerprint: plan.sourceFingerprint,
    analysisGeneratedAt: plan.sourceAnalysisGeneratedAt, rationale: plan.rationale, confidence: plan.confidence, evidence: plan.evidence };
  return { ...s, value, metadata };
}
describe("local brew preparation", () => {
  it("cancels total time and linked stage only when unchanged, leaving the source immutable", () => {
    const { value, metadata } = seed(), before = structuredClone(value);
    const applied = applyBrewAdjustment(value, metadata);
    expect(applied.appliedAdjustment?.changes.map(change => change.field)).toEqual(["totalTime", "stage"]);
    expect(cancelBrewAdjustment(applied).snapshot.expectedTimeSeconds.value).toBe(value.snapshot.expectedTimeSeconds.value);
    expect(cancelBrewAdjustment(applied).snapshot.steps).toEqual(value.snapshot.steps);
    expect(value).toEqual(before);
  });
  it("preserves edited linked fields and unrelated edits without source flags", () => {
    const { value, metadata } = seed(), applied = applyBrewAdjustment(value, metadata);
    applied.snapshot.expectedTimeSeconds.value += 2;
    applied.snapshot.steps.at(-1)!.durationSeconds! += 2;
    applied.snapshot.doseGrams.value += 1;
    const cancelled = cancelBrewAdjustment(applied);
    expect(cancelled.snapshot.expectedTimeSeconds.value).toBe(applied.snapshot.expectedTimeSeconds.value);
    expect(cancelled.snapshot.steps.at(-1)?.durationSeconds).toBe(applied.snapshot.steps.at(-1)?.durationSeconds);
    expect(cancelled.snapshot.doseGrams.value).toBe(applied.snapshot.doseGrams.value);
    expect(cancelled.appliedAdjustment).toBeNull();
  });
  it("cancels temperature only when unchanged, and retains a user edit", () => {
    const { value, metadata } = seed();
    value.snapshot.temperatureCelsius.value = value.snapshot.temperatureCelsius.recipeDefault;
    value.snapshot.temperatureCelsius.source = "recipe_default";
    const applied = applyBrewAdjustment(value, { ...metadata, adjustment: { ...metadata.adjustment, variable: "water_temperature", suggestedValue: value.snapshot.temperatureCelsius.value + 1 } });
    expect(applied.snapshot.temperatureCelsius.source).toBe("user_override");
    const cancelled = cancelBrewAdjustment(applied);
    expect(cancelled.snapshot.temperatureCelsius).toEqual(value.snapshot.temperatureCelsius);
    expect(cancelled.plan.waterTemperature.source).toBe("recipe_default");
    expect(cancelled.snapshot.userOverrides).not.toHaveProperty("temperatureCelsius");
    applied.snapshot.temperatureCelsius.value += 1;
    expect(cancelBrewAdjustment(applied).snapshot.temperatureCelsius.value).toBe(applied.snapshot.temperatureCelsius.value);
    expect(cancelBrewAdjustment(applied).snapshot.temperatureCelsius.source).toBe("user_override");
  });
  it("restores grind source and recipe default after persistence, but preserves manual edits", () => {
    const { value, metadata, preparations } = seed();
    value.snapshot.grindDescription = { value: "medium", recipeDefault: "medium", source: "recipe_default" };
    const applied = applyBrewAdjustment(value, { ...metadata, adjustment: { ...metadata.adjustment, variable: "grind", suggestedValue: "finer", direction: "finer" } });
    expect(preparations.save(applied, "grind", "2026-10-25T00:00:00.000Z").ok).toBe(true);
    const read = preparations.read(); if (!read.ok) throw new Error(read.message);
    const saved = read.value.entries.find(entry => entry.id === "grind")!;
    saved.snapshot.grindDescription!.recipeDefault = "changed default";
    const cancelled = cancelBrewAdjustment(saved);
    expect(cancelled.snapshot.grindDescription).toEqual(value.snapshot.grindDescription);
    expect(cancelled.snapshot.userOverrides).not.toHaveProperty("grindDescription");
    saved.snapshot.grindDescription!.value = "manual";
    expect(cancelBrewAdjustment(saved).snapshot.grindDescription).toEqual(saved.snapshot.grindDescription);
  });
  it("round-trips saved preparations and keeps legacy used URLs mapped to their real Brew", () => {
    const { value, preparations } = seed();
    expect(preparations.save(value, "saved-for-later", "2026-10-25T00:00:00.000Z").ok).toBe(true);
    const read = preparations.read();
    expect(read.ok && read.value.entries.find(entry => entry.id === "saved-for-later")?.snapshot).toEqual(value.snapshot);
    const migrated = preparations.migrate(); if (!migrated.ok) throw new Error(migrated.message);
    const used = Object.keys(migrated.value.lineage)[0];
    const plan = setup().fixtures.plans.find(item => item.resultingBrewId === used)!;
    expect(preparations.legacyResult(plan.id)).toBe(used);
  });
  it("restores each matching field independently and permits at most one adjustment", () => {
    const { value, metadata } = seed(), applied = applyBrewAdjustment(value, metadata);
    applied.snapshot.expectedTimeSeconds.value += 3;
    const cancelled = cancelBrewAdjustment(applied);
    expect(cancelled.snapshot.expectedTimeSeconds.value).toBe(applied.snapshot.expectedTimeSeconds.value);
    expect(cancelled.snapshot.steps.at(-1)?.durationSeconds).toBe(value.snapshot.steps.at(-1)?.durationSeconds);
    expect(() => applyBrewAdjustment(applied, metadata)).toThrow();
    expect(applyBrewAdjustment(cancelled, metadata).appliedAdjustment).not.toBeNull();
  });
  it("backs up untouched originals and migrates idempotently with hidden non-startable legacy Brews", () => {
    const s = setup(), originalPlans = s.storage.getItem("cupmaster:suggested-plans"), originalBrews = s.storage.getItem("cupmaster:brews");
    const result = s.preparations.migrate(); if (!result.ok) throw new Error(result.message);
    expect(result.value.backups[0]).toEqual({ plans: originalPlans, brews: originalBrews });
    expect(s.storage.getItem("cupmaster:suggested-plans")).toBe(originalPlans);
    expect(s.storage.getItem("cupmaster:brews")).toBe(originalBrews);
    const raw = s.storage.getItem(BREW_PREPARATIONS_KEY);
    expect(s.preparations.migrate().ok).toBe(true); expect(s.storage.getItem(BREW_PREPARATIONS_KEY)).toBe(raw);
    const aliases = Object.keys(result.value.redirects); expect(aliases.length).toBeGreaterThan(0);
    for (const id of aliases) {
      expect(s.brews.listAll().value.some(brew => brew.id === id)).toBe(false);
      expect(s.brews.listDrafts().value.some(brew => brew.id === id)).toBe(false);
      expect(new BrewService(s.brews).startBrewSession(id).ok).toBe(false);
      expect(s.brews.getById(id).value?.legacyPreparationId).toBe(result.value.redirects[id]);
    }
    expect(Object.keys(result.value.lineage).length).toBeGreaterThan(0);
  });
  it("preserves actual confirmed legacy preparation values instead of reapplying a recommendation", () => {
    const s = setup(), plan = s.fixtures.plans.find(item => item.resultingBrewId && s.fixtures.brews.find(brew => brew.id === item.resultingBrewId)?.executionStatus === "not_started")!;
    const brew = s.fixtures.brews.find(item => item.id === plan.resultingBrewId)!;
    const result = s.preparations.migrate(); if (!result.ok) throw new Error(result.message);
    expect(result.value.entries.find(item => item.legacyPlanId === plan.id)?.snapshot).toEqual(brew.recipeSnapshot);
  });
  it("retains invalid entries and contradictions in backup with warnings, without inventing cups", () => {
    const s = setup(), plan = { ...s.fixtures.plans[0], status: "used", resultingBrewId: null, usedAt: null };
    const raw = JSON.stringify({ version: 1, data: { plans: [plan, { id: "broken" }, plan] } });
    s.storage.setItem("cupmaster:suggested-plans", raw);
    const result = s.preparations.migrate(); if (!result.ok) throw new Error(result.message);
    expect(result.value.backups[0].plans).toBe(raw); expect(result.value.warnings.length).toBeGreaterThan(1);
    expect(result.value.entries).toHaveLength(1); expect(result.value.lineage).toEqual({});
  });
  it("retries a failed atomic conversion without changing originals or duplicating targets", () => {
    const s = setup(), plans = s.storage.getItem("cupmaster:suggested-plans"); s.storage.fail = true;
    expect(s.preparations.migrate().ok).toBe(false); expect(s.storage.getItem(BREW_PREPARATIONS_KEY)).toBeNull();
    expect(s.storage.getItem("cupmaster:suggested-plans")).toBe(plans);
    s.storage.fail = false; expect(s.preparations.migrate().ok).toBe(true);
  });
  it("quarantines conflicting IDs and shared resulting Brew mappings instead of choosing an arbitrary recommendation", () => {
    for (const sharedResult of [false, true]) {
      const s = setup(), plan = sharedResult ? s.fixtures.plans.find(item => item.resultingBrewId)! : s.fixtures.plans[0];
      const conflicting = { ...plan, id: sharedResult ? `${plan.id}-other` : plan.id, rationale: "Different evidence" };
      s.storage.setItem("cupmaster:suggested-plans", JSON.stringify({ version: 2, data: { plans: [plan, conflicting] } }));
      const result = s.preparations.migrate(); if (!result.ok) throw new Error(result.message);
      expect(result.value.entries).toHaveLength(0); expect(result.value.lineage).toEqual({}); expect(result.value.redirects).toEqual({});
      expect(result.value.warnings.some(warning => warning.includes("ambiguous_mapping"))).toBe(true);
      expect(result.value.backups[0].plans).toContain("Different evidence");
    }
  });
  it("makes unlimited fresh cups with no recipe lookup and never copies execution, feedback or analysis", () => {
    const { value, service, brews } = seed();
    const results = [service.create(value), service.create(value), service.create(value)];
    expect(new Set(results.flatMap(result => result.ok ? [result.value.id] : [] )).size).toBe(3);
    for (const result of results) { if (!result.ok) throw new Error(result.message);
      expect(result.value).toMatchObject({ executionStatus: "not_started", stageResults: [], startedAt: null, flavorFeedback: null, analysis: null, sourceBrewId: value.sourceBrewId });
      expect(brews.getById(result.value.id).value?.sourceBrewId).toBe(value.sourceBrewId);
    }
  });
  it("preserves new metadata locally and fails cloud preflight instead of dropping it or writing new tables", () => {
    const { value, metadata, service } = seed(), result = service.create(applyBrewAdjustment(value, metadata));
    if (!result.ok) throw new Error(result.message);
    const graph = validateLocalCloudMigrationGraph({ profile: null, brews: [result.value], suggestedPlans: [] });
    expect(graph.errors).toContainEqual(expect.objectContaining({ code: "unsupported_local_preparation" }));
  });
});
