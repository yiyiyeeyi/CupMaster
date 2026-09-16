import { notFound } from "next/navigation";
import { recipeService } from "@/application/recipes";
import { QuickPrepareForm } from "@/components/quick-prepare-form";
export default async function PreparePage({ params }: { params: Promise<{ recipeId: string }> }) { const recipe = await recipeService.detail((await params).recipeId); if (!recipe) notFound(); return <QuickPrepareForm recipe={recipe} />; }
