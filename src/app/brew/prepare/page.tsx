import { BrewPreparationForm } from "@/components/brew-preparation-form";
import { recipeService } from "@/application/recipes";
import { prepareEntryQuerySchema } from "@/domain/prepare-entry-query";
import { safePrepareReturnTo, type StartQuery } from "@/domain/start-navigation";
import Link from "next/link";
export default async function Page({ searchParams }: { searchParams: Promise<StartQuery> }) {
  const [query, recipes] = await Promise.all([searchParams, recipeService.discover()]);
  const parsed = prepareEntryQuerySchema.safeParse(query);
  if (!parsed.success) return <main className="state-page"><h1>Quick Prepare</h1><p role="alert">請使用單一有效的準備入口。</p><Link href="/discover">Discover</Link></main>;
  const input = parsed.data;
  return <BrewPreparationForm {...input} recipes={recipes} quick={!input.sourceBrewId && !input.preparationId} returnTo={input.returnTo ? safePrepareReturnTo(input.returnTo) : undefined} />;
}
