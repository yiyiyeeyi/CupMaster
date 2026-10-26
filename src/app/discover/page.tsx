import type { Metadata } from "next";
import { recipeService } from "@/application/recipes";
import { DiscoverContent } from "@/components/discover-content";
export const metadata: Metadata = { title: "Discover" };
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ preferences?: string }> }) { const [recipes, query] = await Promise.all([recipeService.discover(), searchParams]); return <DiscoverContent recipes={recipes} editPreferences={query.preferences === "edit"} />; }
