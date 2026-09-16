import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260804061934_create_cupmaster_core.sql"), "utf8");

describe("Cloud 1 migration contract", () => {
  it("is non-empty", () => expect(sql.length).toBeGreaterThan(1000));
  it("creates all three core tables", () => ["profiles", "brews", "suggested_plans"].forEach((table) => expect(sql).toContain(`create table public.${table}`)));
  it("enables RLS on every user table", () => ["profiles", "brews", "suggested_plans"].forEach((table) => expect(sql).toContain(`alter table public.${table} enable row level security`)));
  it("uses auth.uid ownership for Profile", () => expect(sql).toMatch(/profiles_select_own[\s\S]*auth\.uid\(\)[\s\S]*= id/));
  it("uses auth.uid ownership for Brews", () => expect(sql).toMatch(/brews_select_own[\s\S]*auth\.uid\(\)[\s\S]*= user_id/));
  it("uses auth.uid ownership for Plans", () => expect(sql).toMatch(/suggested_plans_select_own[\s\S]*auth\.uid\(\)[\s\S]*= user_id/));
  it("does not create permissive anon policy", () => { expect(sql).not.toMatch(/to anon/i); expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i); });
  it("contains exact status constraints", () => { expect(sql).toContain("'not_started', 'in_progress', 'paused', 'completed', 'abandoned'"); expect(sql).toContain("'not_requested', 'pending', 'completed', 'failed'"); });
  it("contains the Suggested Plan v2 invariant", () => expect(sql).toContain("suggested_plans_v2_lifecycle_check"));
  it("contains required indexes", () => ["brews_user_updated_idx", "brews_user_execution_idx", "suggested_plans_source_brew_idx", "suggested_plans_one_plan_per_result_idx"].forEach((index) => expect(sql).toContain(index)));
  it("creates cyclic references only after both tables", () => expect(sql.indexOf("alter table public.brews add constraint brews_source_suggested_plan_fk")).toBeGreaterThan(sql.indexOf("create table public.suggested_plans")));
  it("uses deferred graph foreign keys", () => expect(sql.match(/deferrable initially deferred/g)?.length).toBe(3));
  it("contains no hard-coded user UUID", () => expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i));
  it("contains no service-role secret", () => expect(sql).not.toMatch(/service.?role|sb_secret_/i));
  it("contains no Demo fixture data", () => expect(sql).not.toMatch(/demo-brew|demo-plan|Demo Brewer/));
});
