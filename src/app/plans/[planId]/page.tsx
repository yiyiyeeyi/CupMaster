import { LegacyPreparationGate } from "@/components/preparation-migration";
export default async function Page({ params }: { params: Promise<{ planId: string }> }) { return <LegacyPreparationGate planId={(await params).planId} />; }
