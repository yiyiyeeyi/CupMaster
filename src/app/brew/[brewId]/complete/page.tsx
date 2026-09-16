import { BrewComplete } from "@/components/brew-complete";
export default async function BrewCompletePage({ params }: { params: Promise<{ brewId: string }> }) { return <BrewComplete brewId={(await params).brewId} />; }
