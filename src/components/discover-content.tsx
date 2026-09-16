"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { Recipe } from "@/domain";
import { sortRecipesForExperience } from "@/domain";
import { useProfile } from "@/hooks/use-profile";
import { RecipeCard } from "./recipe-card";
export function DiscoverContent({ recipes }: { recipes: Recipe[] }) {
  const { status, storedProfile, notice } = useProfile(); const experience = storedProfile?.profile.experienceLevel;
  const sorted = useMemo(() => sortRecipesForExperience(recipes, experience), [recipes, experience]);
  return <main className="discover-page"><header className="topbar"><p className="wordmark">CupMaster</p><Link aria-label="Open your profile" className="profile-link" href="/me">Me</Link></header><section className="discover-intro"><p className="eyebrow">Discover</p><h1>{status === "ready" && storedProfile ? `Welcome, ${storedProfile.profile.displayName}.` : "Choose your next cup."}</h1><p>Pick a clear starting plan. No Bean profile, equipment setup, or sign-in required.</p>{experience && <p className="recommendation-note">Ordered deterministically based on your experience level.</p>}{notice && <p className="notice" role="status">{notice}</p>}</section>
    {sorted.length === 0 ? <section className="empty-state"><h2>No recipes are available yet.</h2><p>The recipe shelf is being prepared. Return soon to choose a guided starting point.</p></section> : <section aria-label="Recipes" className="recipe-grid">{sorted.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} recommended={Boolean(experience) && index === 0} />)}</section>}
  </main>;
}
