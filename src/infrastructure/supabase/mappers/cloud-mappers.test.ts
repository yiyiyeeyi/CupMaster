import { describe, expect, it } from "vitest";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";
import type { UserProfile } from "@/domain";
import { CloudMappingError } from "../cloud-row-schemas";
import { fromProfileRow, toProfileInsert } from "./profile-mapper";
import { fromBrewRow, toBrewInsert, toBrewUpdate } from "./brew-mapper";
import { fromSuggestedPlanRow, toSuggestedPlanInsert, toSuggestedPlanUpdate } from "./suggested-plan-mapper";

const userId = "11111111-1111-4111-8111-111111111111";
const profile: UserProfile = { id: userId, displayName: "Cloud Brewer", experienceLevel: "intermediate", currentNeeds: ["track_and_compare"], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" };
const fixtures = createFullDemoFixtures();
const brew = fixtures.brews.find((item) => item.id === "demo-brew-b-complete")!;
const plan = fixtures.plans.find((item) => item.id === "demo-plan-accepted")!;
const profileRow = () => toProfileInsert(profile, { revision: 3 });
const brewRow = () => toBrewInsert(userId, brew, 4);
const planRow = () => toSuggestedPlanInsert(userId, plan, 5);

describe("Cloud row mappers", () => {
  it("maps Profile domain to an insert row", () => expect(profileRow()).toMatchObject({ id: userId, display_name: "Cloud Brewer", experience_level: "intermediate" }));
  it("maps a Profile row back to domain", () => expect(fromProfileRow(profileRow()).entity).toEqual(profile));
  it("rejects an invalid experience level", () => expect(() => fromProfileRow({ ...profileRow(), experience_level: "expert" })).toThrow(CloudMappingError));
  it("maps Brew domain to an insert row", () => expect(brewRow()).toMatchObject({ id: brew.id, user_id: userId, execution_status: "completed" }));
  it("maps a Brew row back to domain", () => expect(fromBrewRow(brewRow()).entity).toEqual(brew));
  it("validates Snapshot JSONB", () => expect(() => fromBrewRow({ ...brewRow(), recipe_snapshot: { title: "broken" } })).toThrow(CloudMappingError));
  it("validates Stage Result JSONB", () => expect(() => fromBrewRow({ ...brewRow(), stage_results: [{ stageOrder: -1 }] })).toThrow(CloudMappingError));
  it("validates Flavor Feedback JSONB", () => expect(() => fromBrewRow({ ...brewRow(), flavor_feedback: { overallImpression: "invented" } })).toThrow(CloudMappingError));
  it("validates Record Details JSONB", () => expect(() => fromBrewRow({ ...brewRow(), record_details: { actualDoseGrams: -1 } })).toThrow(CloudMappingError));
  it("validates Analysis JSONB", () => expect(() => fromBrewRow({ ...brewRow(), analysis: { status: "completed" } })).toThrow(CloudMappingError));
  it("maps Suggested Plan domain to an insert row", () => expect(planRow()).toMatchObject({ id: plan.id, source_brew_id: plan.sourceBrewId, status: "draft" }));
  it("maps a Suggested Plan row back to domain", () => expect(fromSuggestedPlanRow(planRow()).entity).toEqual(plan));
  it("accepts draft plus resulting Brew with null usedAt", () => expect(fromSuggestedPlanRow(planRow()).entity.resultingBrewId).toBe(plan.resultingBrewId));
  it("rejects used Plan without usedAt", () => expect(() => fromSuggestedPlanRow({ ...planRow(), status: "used", used_at: null })).toThrow(CloudMappingError));
  it("maps snake_case and camelCase explicitly", () => expect(fromProfileRow({ ...profileRow(), display_name: "Mapped Name" }).entity.displayName).toBe("Mapped Name"));
  it("preserves IDs", () => expect([fromBrewRow(brewRow()).entity.id, fromSuggestedPlanRow(planRow()).entity.id]).toEqual([brew.id, plan.id]));
  it("preserves ISO timestamps", () => expect(fromBrewRow(brewRow()).entity.updatedAt).toBe(brew.updatedAt));
  it("maps revision separately from domain", () => expect([fromProfileRow(profileRow()).revision, fromBrewRow(brewRow()).revision, fromSuggestedPlanRow(planRow()).revision]).toEqual([3, 4, 5]));
  it("rejects soft-deleted rows as active entities", () => expect(() => fromBrewRow({ ...brewRow(), deleted_at: "2026-08-03T00:00:00.000Z" })).toThrowError(/Soft-deleted/));
  it("does not mutate mapper inputs", () => { const brewBefore = structuredClone(brew), planBefore = structuredClone(plan); toBrewUpdate(brew, 2); toSuggestedPlanUpdate(plan, 2); expect(brew).toEqual(brewBefore); expect(plan).toEqual(planBefore); });
});
