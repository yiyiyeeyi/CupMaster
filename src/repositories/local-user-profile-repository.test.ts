import { describe, expect, it } from "vitest";
import { localProfileEnvelopeSchema } from "@/data/local-profile-schema";
import { LocalUserProfileRepository, LOCAL_PROFILE_KEY } from "./local-user-profile-repository";

class MemoryStorage { private values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } }
const validDraft = { displayName: "Yiyi", experienceLevel: "beginner" as const, selectedNeeds: ["learn_basics", "improve_consistency"] as const };

describe("LocalUserProfileRepository", () => {
  it("validates the versioned local schema", () => { const storage = new MemoryStorage(); const repository = new LocalUserProfileRepository(storage); repository.save({ ...validDraft, selectedNeeds: [...validDraft.selectedNeeds] }); const raw = storage.getItem(LOCAL_PROFILE_KEY); expect(raw).not.toBeNull(); expect(localProfileEnvelopeSchema.safeParse(JSON.parse(raw ?? "")).success).toBe(true); });
  it("falls back safely for damaged JSON", () => { const storage = new MemoryStorage(); storage.setItem(LOCAL_PROFILE_KEY, "{damaged"); expect(new LocalUserProfileRepository(storage).load().status).toBe("recovered"); });
  it("saves completed onboarding", () => { const result = new LocalUserProfileRepository(new MemoryStorage()).save({ ...validDraft, selectedNeeds: [...validDraft.selectedNeeds] }); expect(result.ok && result.value.onboardingCompleted).toBe(true); });
  it("preserves the experience mapping", () => { const repository = new LocalUserProfileRepository(new MemoryStorage()); repository.save({ ...validDraft, experienceLevel: "developing", selectedNeeds: [] }); const result = repository.load(); expect(result.status === "found" && result.value.profile.experienceLevel).toBe("developing"); });
  it("preserves multiple selected needs", () => { const repository = new LocalUserProfileRepository(new MemoryStorage()); repository.save({ ...validDraft, selectedNeeds: [...validDraft.selectedNeeds] }); const result = repository.load(); expect(result.status === "found" ? result.value.selectedNeeds : []).toEqual(validDraft.selectedNeeds); });
  it("rejects incompatible versions", () => { const storage = new MemoryStorage(); storage.setItem(LOCAL_PROFILE_KEY, JSON.stringify({ version: 0, data: {} })); expect(new LocalUserProfileRepository(storage).load().status).toBe("recovered"); });
});
