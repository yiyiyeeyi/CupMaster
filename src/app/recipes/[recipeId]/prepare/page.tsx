import { notFound } from "next/navigation";
import { recipeService } from "@/application/recipes";
import { BrewPreparationForm } from "@/components/brew-preparation-form";
export default async function PreparePage({ params }: { params: Promise<{ recipeId: string }> }) { const recipe = await recipeService.detail((await params).recipeId); if (!recipe) notFound(); return <BrewPreparationForm recipe={recipe} />; }
