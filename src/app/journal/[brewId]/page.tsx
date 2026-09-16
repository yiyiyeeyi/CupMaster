import { BrewDetail } from "@/components/brew-detail";
import { BrewAnalysisTeaser } from "@/components/brew-analysis-teaser";
import { BrewSuggestedPlanLoader } from "@/components/brew-suggested-plan-loader";
export default async function BrewDetailPage({ params }: { params: Promise<{ brewId: string }> }) { const {brewId}=await params; return <><BrewDetail brewId={brewId}/><BrewSuggestedPlanLoader brewId={brewId}/><BrewAnalysisTeaser brewId={brewId}/></>; }
