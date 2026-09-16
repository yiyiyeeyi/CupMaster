import { localProfileEnvelopeSchema, LOCAL_PROFILE_VERSION } from "@/data/local-profile-schema";
import type { OnboardingDraft, ProfileLoadResult, ProfileSaveResult, UserProfileRepository } from "./user-profile-repository";

export const LOCAL_PROFILE_KEY = "cupmaster:user-profile";
type StorageLike = Pick<Storage, "getItem" | "setItem"> & { removeItem?: (key: string) => void };

export class LocalUserProfileRepository implements UserProfileRepository {
  constructor(private readonly storage?: StorageLike) {}

  private getStorage(): StorageLike | undefined {
    if (this.storage) return this.storage;
    try { return typeof window === "undefined" ? undefined : window.localStorage; }
    catch { return undefined; }
  }

  load(): ProfileLoadResult {
    const storage = this.getStorage();
    if (!storage) return { status: "recovered", message: "Local storage is unavailable. You can continue, but changes may not persist." };
    let raw: string | null;
    try { raw = storage.getItem(LOCAL_PROFILE_KEY); }
    catch { return { status: "recovered", message: "Saved profile could not be read. You can safely continue." }; }
    if (!raw) return { status: "empty" };
    try {
      const parsed = localProfileEnvelopeSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return { status: "recovered", message: "Saved profile was incompatible or incomplete. Please review it again." };
      return { status: "found", value: { profile: parsed.data.data.profile, selectedNeeds: parsed.data.data.selectedNeeds, onboardingCompleted: parsed.data.data.onboardingCompleted } };
    } catch {
      return { status: "recovered", message: "Saved profile was damaged. A safe blank profile is being used." };
    }
  }

  save(draft: Required<OnboardingDraft>): ProfileSaveResult {
    const storage = this.getStorage();
    if (!storage) return { ok: false, message: "Your profile works for this session, but local storage is unavailable." };
    const now = new Date().toISOString();
    const previous = this.load();
    const profile = { id: previous.status === "found" ? previous.value.profile.id : "local-user", displayName: draft.displayName.trim(), experienceLevel: draft.experienceLevel, currentNeeds: draft.selectedNeeds, createdAt: previous.status === "found" ? previous.value.profile.createdAt : now, updatedAt: now };
    const envelope = localProfileEnvelopeSchema.safeParse({ version: LOCAL_PROFILE_VERSION, data: { displayName: profile.displayName, experienceLevel: profile.experienceLevel, selectedNeeds: draft.selectedNeeds, onboardingCompleted: true, profile } });
    if (!envelope.success) return { ok: false, message: "Profile details are invalid. Please review your answers." };
    try { storage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(envelope.data)); }
    catch { return { ok: false, message: "Profile could not be saved on this device. Check browser storage permissions." }; }
    return { ok: true, value: { profile, selectedNeeds: draft.selectedNeeds, onboardingCompleted: true } };
  }
  remove() { const storage = this.getStorage(); if (!storage?.removeItem) return { ok: false as const, message: "Local profile storage is unavailable." }; try { storage.removeItem(LOCAL_PROFILE_KEY); return { ok: true as const }; } catch { return { ok: false as const, message: "Local profile data could not be removed." }; } }
}
