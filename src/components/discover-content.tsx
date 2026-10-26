"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { Recipe } from "@/domain";
import { sortRecipesForExperience } from "@/domain/recipe-utils";
import { beginnerRecipe } from "@/application/quick-preparation";
import { RecipeCard } from "./recipe-card";
import { DiscoveryPreferencesCard } from "./discovery-preferences-card";
import { useDiscoveryPreferences } from "./discovery-preferences-provider";
import { startCopy as copy } from "./start-copy";
export function DiscoverContent({ recipes, editPreferences = false }: { recipes: Recipe[]; editPreferences?: boolean }) {
  const { value } = useDiscoveryPreferences();
  const sorted = useMemo(() => {
    if (value.experienceLevel) return sortRecipesForExperience(recipes, value.experienceLevel);
    const first = beginnerRecipe(recipes);
    return first ? [first, ...recipes.filter(recipe => recipe.id !== first.id)] : [];
  }, [recipes, value.experienceLevel]);
  return <main className="discover-page"><header className="topbar"><p className="wordmark">CupMaster</p><Link aria-label={copy.profile} className="profile-link" href="/me">Me</Link></header>
    <section className="discover-intro"><p className="eyebrow">Discover</p><h1>{copy.chooseRecipe}</h1><p>{copy.intro}</p></section>
    <DiscoveryPreferencesCard initiallyOpen={editPreferences} />
    {sorted.length === 0 ? <section className="empty-state"><h2>{copy.noRecipes}</h2><p>{copy.shelfHint}</p></section> : <section aria-label="Recipes" className="recipe-grid">{sorted.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} recommended={index === 0 && (value.experienceLevel !== null || recipe.currentVersion.difficulty === "beginner")} />)}</section>}
  </main>;
}
