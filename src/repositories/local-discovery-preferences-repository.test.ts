import { describe, expect, it } from "vitest";
import { LocalDiscoveryPreferencesRepository, DISCOVERY_PREFERENCES_KEY } from "./local-discovery-preferences-repository";
import { LocalUserProfileRepository, LOCAL_PROFILE_KEY } from "./local-user-profile-repository";
import { effectiveDiscoveryPreferences } from "@/domain/discovery-preferences";
describe("Discovery preferences", () => {
  it("new preferences win over completed or incomplete legacy Onboarding, without rewriting it", () => {
    const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const legacy = new LocalUserProfileRepository(storage);
    expect(legacy.save({ displayName: "Tester", experienceLevel: "advanced", selectedNeeds: ["improve_flavor"] }).ok).toBe(true);
    const raw = data.get(LOCAL_PROFILE_KEY), read = legacy.load(); if (read.status !== "found") throw Error("missing legacy");
    expect(effectiveDiscoveryPreferences(null, read.value).experienceLevel).toBe("advanced");
    const prefs = new LocalDiscoveryPreferencesRepository(storage), value = { experienceLevel: null, selectedNeeds: [], updatedAt: "2026-10-26T00:00:00.000Z" };
    expect(prefs.save(value).ok).toBe(true); expect(effectiveDiscoveryPreferences(value, read.value).experienceLevel).toBeNull();
    expect(effectiveDiscoveryPreferences(value, { ...read.value, onboardingCompleted: false }).selectedNeeds).toEqual([]);
    expect(data.get(LOCAL_PROFILE_KEY)).toBe(raw);
    expect(new LocalDiscoveryPreferencesRepository(storage).load()).toEqual({ ok: true, value });
  });
  it("permits anonymous preferences with only PRD needs and preserves corrupt originals on failure", () => {
    const data = new Map<string, string>([[LOCAL_PROFILE_KEY, "broken legacy"]]); let fail = false;
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw Error("quota"); data.set(key, value); } };
    const prefs = new LocalDiscoveryPreferencesRepository(storage), value = { experienceLevel: "beginner" as const, selectedNeeds: ["learn_basics" as const], updatedAt: "2026-10-26T00:00:00.000Z" };
    expect(prefs.save(value).ok).toBe(true); expect(data.get(LOCAL_PROFILE_KEY)).toBe("broken legacy");
    const raw = data.get(DISCOVERY_PREFERENCES_KEY); fail = true; expect(prefs.save({ ...value, selectedNeeds: [] }).ok).toBe(false); expect(data.get(DISCOVERY_PREFERENCES_KEY)).toBe(raw);
    fail = false; data.set(DISCOVERY_PREFERENCES_KEY, JSON.stringify({ version: 1, data: { ...value, selectedNeeds: ["invented_need"] } }));
    expect(prefs.load().ok).toBe(false); const corrupt = data.get(DISCOVERY_PREFERENCES_KEY);
    expect(prefs.save(value).ok).toBe(false); expect(data.get(DISCOVERY_PREFERENCES_KEY)).toBe(corrupt);
  });
});
