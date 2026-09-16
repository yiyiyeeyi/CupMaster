import type { Metadata } from "next";
import { recipeService } from "@/application/recipes";
import { DiscoverContent } from "@/components/discover-content";
export const metadata: Metadata = { title: "Discover" };
export default async function DiscoverPage() { const recipes = await recipeService.discover(); return <DiscoverContent recipes={recipes} />; }
