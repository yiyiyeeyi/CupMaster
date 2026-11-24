import { describe, expect, it, vi } from "vitest";
import { needsNickname, nicknameSchema } from "./profile-nickname";
import { ProfileBootstrapService } from "./profile-bootstrap-service";

describe("nickname confirmation", () => {
  it("asks only for the exact legacy formula", () => {
    expect(needsNickname("coffee.name", "coffee+ .name@example.test", {})).toBe(true);
    expect(needsNickname("Coffee Friend", "coffee@example.test", {})).toBe(false);
    expect(needsNickname("coffee", "coffee@example.test", { displayNameConfirmed: true })).toBe(false);
  });
  it("counts characters like the database check, not UTF-16 units", () => {
    expect(nicknameSchema.safeParse("☕").success).toBe(false);
    expect(nicknameSchema.safeParse("😀").success).toBe(false);
    expect(nicknameSchema.safeParse("😀😀").success).toBe(true);
    expect(nicknameSchema.safeParse("😀".repeat(40)).success).toBe(true);
    expect(nicknameSchema.safeParse("😀".repeat(41)).success).toBe(false);
  });
  it("reads the current owner's profile without deriving one from email", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, value: null }));
    try {
      const getUser = async () => ({ ok: true as const, value: { id, email: "brewer@example.test" } });
      expect(await new ProfileBootstrapService({ getUser }).ensureCurrentUserProfile()).toEqual({ ok: true, value: null });
      expect(fetch).toHaveBeenCalledWith("/api/cloud/nickname", expect.objectContaining({
        headers: expect.objectContaining({ "x-cupmaster-account": id }),
        body: JSON.stringify({ action: "ensure", args: [] }),
      }));
    } finally {
      fetch.mockRestore();
    }
  });
});
