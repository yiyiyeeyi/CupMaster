import { BrewPreparationForm } from "@/components/brew-preparation-form";
export default async function Page({ searchParams }: { searchParams: Promise<{ sourceBrewId?: string; recommendationId?: string; preparationId?: string }> }) {
  return <BrewPreparationForm {...await searchParams} />;
}
