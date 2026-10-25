import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ brewId: string; recommendationId: string }> }) { const p = await params; redirect(`/brew/prepare?sourceBrewId=${encodeURIComponent(p.brewId)}&recommendationId=${encodeURIComponent(p.recommendationId)}`); }
