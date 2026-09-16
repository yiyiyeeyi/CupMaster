import type { UserExperienceLevel, UserNeed, UserProfile } from "@/domain";

export interface OnboardingDraft { displayName: string; experienceLevel?: UserExperienceLevel; selectedNeeds: UserNeed[]; }
export interface StoredUserProfile { profile: UserProfile; selectedNeeds: UserNeed[]; onboardingCompleted: boolean; }
export type ProfileLoadResult = { status: "found"; value: StoredUserProfile } | { status: "empty" } | { status: "recovered"; message: string };
export type ProfileSaveResult = { ok: true; value: StoredUserProfile } | { ok: false; message: string };

export interface UserProfileRepository {
  load(): ProfileLoadResult;
  save(draft: Required<OnboardingDraft>): ProfileSaveResult;
  remove(): { ok: true } | { ok: false; message: string };
}
