import { SourceBrewPlans } from "@/components/source-brew-plans";
export default async function SourceBrewPlansPage({ params }: { params: Promise<{ brewId: string }> }) { const { brewId } = await params; return <SourceBrewPlans brewId={brewId} />; }
