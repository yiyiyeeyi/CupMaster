import { LegacyPreparationGate } from "@/components/preparation-migration";
import { LiveBrewDraft } from "@/components/live-brew-draft";
export default async function LiveBrewPage({ params }: { params: Promise<{ brewId: string }> }) { return <LegacyPreparationGate brewId={(await params).brewId}><LiveBrewDraft brewId={(await params).brewId} /></LegacyPreparationGate>; }
