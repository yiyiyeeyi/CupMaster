import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";
import type { UserProfile } from "@/domain";
import type { Database } from "@/types/database.types";
import { toBrewInsert } from "./mappers/brew-mapper";
import { toProfileInsert } from "./mappers/profile-mapper";
import { toSuggestedPlanInsert } from "./mappers/suggested-plan-mapper";
import { SupabaseBrewRepository } from "./supabase-brew-repository";
import { SupabaseSuggestedPlanRepository } from "./supabase-suggested-plan-repository";
import { SupabaseUserProfileRepository } from "./supabase-user-profile-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const user: User = { id: userId, aud: "authenticated", role: "authenticated", email: "test@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-08-01T00:00:00.000Z" };
const profile: UserProfile = { id: userId, displayName: "Cloud Brewer", experienceLevel: "intermediate", currentNeeds: ["track_and_compare"], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" };
const fixtures = createFullDemoFixtures(); const brew = fixtures.brews[0]; const plan = fixtures.plans[0];
function fakeClient(responses: Array<{ body: unknown; status?: number }>) {
  const requests: Request[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => { const request = new Request(input, init); requests.push(request); const next = responses.shift() ?? { body: null }; return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } }); });
  const client = createClient<Database>("https://example.supabase.co", "sb_publishable_test", { global: { fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user }, error: null });
  return { client, requests };
}

describe("Supabase remote repository infrastructure", () => {
  it("loads and maps the current Profile", async () => { const row = toProfileInsert(profile, { revision: 3 }); const fake = fakeClient([{ body: row }]); const result = await new SupabaseUserProfileRepository(fake.client).load(); expect(result).toEqual(expect.objectContaining({ ok: true, revision: 3 })); expect(result.ok && result.value?.profile).toEqual(profile); });
  it("creates a Brew with the authenticated owner", async () => { const row = toBrewInsert(userId, brew, 1); const fake = fakeClient([{ body: row }]); const result = await new SupabaseBrewRepository(fake.client).createDraft(brew); expect(result.ok && result.value.id).toBe(brew.id); expect(await fake.requests[0].clone().json()).toMatchObject({ user_id: userId, revision: 1 }); });
  it("reads a Brew by id through its mapper", async () => { const fake = fakeClient([{ body: toBrewInsert(userId, brew, 4) }]); const result = await new SupabaseBrewRepository(fake.client).getById(brew.id); expect(result).toEqual(expect.objectContaining({ ok: true, revision: 4 })); });
  it("returns revision_conflict when conditional Brew update changes no row", async () => { const fake = fakeClient([{ body: null }]); const result = await new SupabaseBrewRepository(fake.client).updateIfRevision(brew, 4); expect(result).toEqual(expect.objectContaining({ ok: false, code: "revision_conflict" })); expect(fake.requests[0].url).toContain("revision=eq.4"); });
  it("creates a Suggested Plan with the authenticated owner", async () => { const row = toSuggestedPlanInsert(userId, plan, 1); const fake = fakeClient([{ body: row }]); const result = await new SupabaseSuggestedPlanRepository(fake.client).create(plan); expect(result.ok && result.value.id).toBe(plan.id); expect(await fake.requests[0].clone().json()).toMatchObject({ user_id: userId }); });
  it("returns revision_conflict when conditional Plan update changes no row", async () => { const fake = fakeClient([{ body: null }]); const result = await new SupabaseSuggestedPlanRepository(fake.client).updateIfRevision(plan, 5); expect(result).toEqual(expect.objectContaining({ ok: false, code: "revision_conflict" })); });
  it("maps RLS denial without leaking raw server details", async () => { const fake = fakeClient([{ status: 403, body: { code: "42501", message: "raw policy detail", details: null, hint: null } }]); const result = await new SupabaseBrewRepository(fake.client).getById(brew.id); expect(result).toEqual({ ok: false, code: "permission_denied", message: "Cloud access was denied." }); });
  it("does not require an authenticated user id from callers", () => { expect(SupabaseBrewRepository.length).toBeLessThanOrEqual(1); expect(SupabaseSuggestedPlanRepository.length).toBeLessThanOrEqual(1); expect(SupabaseUserProfileRepository.length).toBeLessThanOrEqual(1); });
  it("covers every local method name plus remote revision updates", () => { expect(Object.getOwnPropertyNames(SupabaseBrewRepository.prototype)).toEqual(expect.arrayContaining(["createDraft", "getById", "findBySourceSuggestedPlanId", "listAll", "listDrafts", "listJournalEntries", "upsertMany", "removeByIdPrefix", "updateDraft", "deleteDraft", "updateIfRevision"])); expect(Object.getOwnPropertyNames(SupabaseSuggestedPlanRepository.prototype)).toEqual(expect.arrayContaining(["create", "getById", "findByResultingBrewId", "list", "listBySourceBrewId", "upsertMany", "removeByIdPrefix", "update", "markUsed", "updateIfRevision"])); expect(Object.getOwnPropertyNames(SupabaseUserProfileRepository.prototype)).toEqual(expect.arrayContaining(["load", "save", "remove", "updateIfRevision"])); });
  it("is not wired into current runtime", () => { for (const file of ["src/app/layout.tsx", "src/components/profile-provider.tsx", "src/application/brew-service.ts"]) expect(readFileSync(resolve(process.cwd(), file), "utf8")).not.toMatch(/Supabase(Brew|SuggestedPlan|UserProfile)Repository/); });
});
