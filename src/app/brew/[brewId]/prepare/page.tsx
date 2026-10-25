import { LegacyPreparationGate } from "@/components/preparation-migration";
import { DraftPrepareForm } from "@/components/draft-prepare-form";
export default async function Page({params}:{params:Promise<{brewId:string}>}){const{brewId}=await params;return <LegacyPreparationGate brewId={brewId}><DraftPrepareForm brewId={brewId}/></LegacyPreparationGate>}
