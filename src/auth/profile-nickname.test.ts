import { describe, expect, it, vi } from "vitest";
import { createClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { needsNickname } from "./profile-nickname";
import { ProfileBootstrapService } from "./profile-bootstrap-service";

describe("nickname confirmation", () => {
  it("asks only for the exact legacy formula", () => {
    expect(needsNickname("coffee.name", "coffee+ .name@example.test", {})).toBe(true);
    expect(needsNickname("Coffee Friend", "coffee@example.test", {})).toBe(false);
    expect(needsNickname("coffee", "coffee@example.test", { displayNameConfirmed: true })).toBe(false);
  });
  it.each(["x", "a".repeat(64)])("does not derive a profile from email %s", async prefix => {
    const fetch = vi.fn(async () => new Response("null", { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = createClient<Database>("https://example.supabase.co", "sb_publishable_test", { global: { fetch }, auth: { persistSession: false, autoRefreshToken: false } });
    const user: User = { id: "11111111-1111-4111-8111-111111111111", email: prefix + "@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-27T00:00:00Z" };
    vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user }, error: null });
    expect(await new ProfileBootstrapService(client).ensureCurrentUserProfile()).toEqual({ ok: true, value: null });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]).toBeDefined();
  });
  it("writes a confirmed nickname with unset experience and retries idempotently", async () => {
    let stored: Record<string, unknown> | null = null;
    const writes: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body: unknown = JSON.parse(String(init.body));
        if (body && typeof body === "object" && !Array.isArray(body)) { stored = { ...body }; writes.push(stored); }
      }
      return new Response(JSON.stringify(stored), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createClient<Database>("https://example.supabase.co", "sb_publishable_test", { global: { fetch }, auth: { persistSession: false, autoRefreshToken: false } });
    const user: User = { id: "11111111-1111-4111-8111-111111111111", email: "x@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-27T00:00:00Z" };
    vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user }, error: null });
    const service = new ProfileBootstrapService(client);
    expect((await service.confirmNickname(user.id, "小雨")).ok).toBe(true);
    expect((await service.confirmNickname(user.id, "不可覆寫")).ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ display_name: "小雨", experience_level: "beginner", preferences: { displayNameConfirmed: true, experienceLevelSource: "unset" } });
    expect((await service.confirmNickname("other-account", "小雨")).ok).toBe(false);
    expect(writes).toHaveLength(1);
  });
});
