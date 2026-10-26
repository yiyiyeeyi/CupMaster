import { notFound } from "next/navigation";
import { recipeService } from "@/application/recipes";
import { BrewPreparationForm } from "@/components/brew-preparation-form";
export default async function PreparePage({ params }: { params: Promise<{ recipeId: string }> }) { const [recipe, recipes] = await Promise.all([recipeService.detail((await params).recipeId), recipeService.discover()]); if (!recipe) notFound(); return <BrewPreparationForm recipe={recipe} recipes={recipes} />; }
