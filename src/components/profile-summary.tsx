"use client";
import Link from "next/link";
import { useProfile } from "@/hooks/use-profile";
import { useAuth } from "./auth-provider";
import { DiscoveryPreferencesCard } from "./discovery-preferences-card";
export function ProfileSummary() {
  const { status, storedProfile, notice } = useProfile();
  const auth = useAuth();
  if (status === "loading") return <main className="route-loading"><p>Loading your profile…</p></main>;
  return <main className="profile-page"><div className="detail-topbar"><Link className="back-link" href="/discover">← Discover</Link></div><p className="eyebrow">Me</p><h1>{storedProfile?.profile.displayName ?? "Your profile"}</h1>{notice && <p className="notice">{notice}</p>}<section className="auth-status-card" aria-labelledby="account-heading"><p className="eyebrow">Account</p><h2 id="account-heading">{auth.status === "authenticated" ? "Cloud account connected" : auth.status === "loading" ? "Checking account…" : "Local Mode"}</h2>{auth.status === "authenticated" ? <><p>{auth.user?.email}</p><p>Signed in. Cloud sync is not enabled yet; local data remains on this device.</p>{auth.profileBootstrap === "error" && <p className="field-error">Cloud profile preparation can be retried later. Your session remains active.</p>}<Link className="primary-button" href="/migration">Review local data for migration</Link><button className="secondary-button" onClick={() => void auth.signOut()} type="button">Sign out</button></> : <><p>Continue using CupMaster locally. Local data stays on this device.</p><Link className="primary-button" href="/auth?next=/me">Sign in for future cloud sync</Link></>}</section><DiscoveryPreferencesCard initiallyOpen /><section className="upcoming-list" aria-label="Upcoming profile areas"><h2>More in Me</h2>{["Gear Guide", "My Gear", "My Library", "Settings"].map((item) => <div key={item}><span>{item}</span><small>Upcoming</small></div>)}</section></main>;
}
