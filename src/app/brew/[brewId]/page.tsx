import { LiveBrewDraft } from "@/components/live-brew-draft";
export default async function LiveBrewPage({ params }: { params: Promise<{ brewId: string }> }) { return <LiveBrewDraft brewId={(await params).brewId} />; }
