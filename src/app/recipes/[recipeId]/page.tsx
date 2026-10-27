import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { recipeService } from "@/application/recipes";
import { BrewParameterGrid, BrewSteps } from "@/components/brew-sheet";
import { preparationCopy } from "@/components/brew-preparation-copy";
type Props = { params: Promise<{ recipeId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const recipe = await recipeService.detail((await params).recipeId); return { title: recipe?.currentVersion.title ?? "Recipe not found" }; }
export default async function RecipeDetailPage({ params }: Props) {
  const recipe = await recipeService.detail((await params).recipeId); if (!recipe) notFound(); const item = recipe.currentVersion; const steps = [...item.steps].sort((a, b) => a.order - b.order);
  return <main className="recipe-detail"><div className="detail-topbar"><Link className="back-link" href="/discover">← Discover</Link></div><header><p className="eyebrow">OFFICIAL RECIPE</p><h1>{item.title}</h1><p>{item.author}</p><p className="lead">{item.description}</p><p className="lead">{item.dripper}</p></header><BrewParameterGrid values={{ dose:item.doseGrams, water:item.totalWaterGrams, temperature:item.temperatureCelsius, grind:item.grindDescription, seconds:item.expectedTimeSeconds }} /><BrewSteps steps={steps} /><div className="sticky-cta"><Link className="primary-button" href={`/recipes/${recipe.id}/prepare`}>{preparationCopy.start}</Link></div></main>;
}
