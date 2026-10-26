"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LocalUserProfileRepository } from "@/repositories/local-user-profile-repository";
import type { StoredUserProfile } from "@/repositories/user-profile-repository";
type Value = { status: "loading" | "ready"; storedProfile: StoredUserProfile | null; notice: string | null };
const ProfileContext = createContext<Value | null>(null);
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Value["status"]>("loading"); const [storedProfile, setStoredProfile] = useState<StoredUserProfile | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const repository = useMemo(() => new LocalUserProfileRepository(), []);
  useEffect(() => { const timer = window.setTimeout(() => { const result = repository.load(); if (result.status === "found") setStoredProfile(result.value); if (result.status === "recovered") setNotice(result.message); setStatus("ready"); }, 0); return () => window.clearTimeout(timer); }, [repository]);
  return <ProfileContext.Provider value={{ status, storedProfile, notice }}>{children}</ProfileContext.Provider>;
}
export function useProfile() { const value = useContext(ProfileContext); if (!value) throw new Error("useProfile must be used within ProfileProvider"); return value; }
