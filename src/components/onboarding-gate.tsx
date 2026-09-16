"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/hooks/use-profile";
export function OnboardingGate() { const { status, storedProfile } = useProfile(); const router = useRouter(); useEffect(() => { if (status === "ready") router.replace(storedProfile?.onboardingCompleted ? "/discover" : "/onboarding"); }, [router, status, storedProfile]); return <main className="route-loading" aria-live="polite"><p className="eyebrow">CupMaster</p><h1>Preparing your next cup…</h1><p>Loading your local profile.</p></main>; }
