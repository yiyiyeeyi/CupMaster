import { BrewDetail } from "@/components/brew-detail";
import { BrewAnalysisTeaser } from "@/components/brew-analysis-teaser";
import { BrewSuggestedPlanLoader } from "@/components/brew-suggested-plan-loader";
export default async function BrewDetailPage({ params, searchParams }: { params: Promise<{ brewId: string }>; searchParams: Promise<{ justCompleted?: string }> }) {
  const [{ brewId }, query] = await Promise.all([params, searchParams]);
  return <><BrewDetail brewId={brewId} justCompleted={query.justCompleted === "1"}/><BrewSuggestedPlanLoader brewId={brewId}/><BrewAnalysisTeaser brewId={brewId}/></>;
}
