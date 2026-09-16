"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LocalUserProfileRepository } from "@/repositories/local-user-profile-repository";
import type { OnboardingDraft, ProfileSaveResult, StoredUserProfile } from "@/repositories/user-profile-repository";
type Value = { status: "loading" | "ready"; storedProfile: StoredUserProfile | null; notice: string | null; completeOnboarding(draft: Required<OnboardingDraft>): ProfileSaveResult };
const ProfileContext = createContext<Value | null>(null);
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Value["status"]>("loading"); const [storedProfile, setStoredProfile] = useState<StoredUserProfile | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const repository = useMemo(() => new LocalUserProfileRepository(), []);
  useEffect(() => { const timer = window.setTimeout(() => { const result = repository.load(); if (result.status === "found") setStoredProfile(result.value); if (result.status === "recovered") setNotice(result.message); setStatus("ready"); }, 0); return () => window.clearTimeout(timer); }, [repository]);
  const completeOnboarding = useCallback((draft: Required<OnboardingDraft>) => { const result = repository.save(draft); if (result.ok) { setStoredProfile(result.value); setNotice(null); } else { const now = new Date().toISOString(); setStoredProfile({ profile: { id: storedProfile?.profile.id ?? "session-user", displayName: draft.displayName.trim(), experienceLevel: draft.experienceLevel, currentNeeds: draft.selectedNeeds, createdAt: storedProfile?.profile.createdAt ?? now, updatedAt: now }, selectedNeeds: draft.selectedNeeds, onboardingCompleted: true }); setNotice(result.message); } return result; }, [repository, storedProfile]);
  return <ProfileContext.Provider value={{ status, storedProfile, notice, completeOnboarding }}>{children}</ProfileContext.Provider>;
}
export function useProfile() { const value = useContext(ProfileContext); if (!value) throw new Error("useProfile must be used within ProfileProvider"); return value; }
