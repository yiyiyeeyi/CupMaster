import { BrewDetail } from "@/components/brew-detail";

export default async function BrewDetailPage({ params, searchParams }: { params: Promise<{ brewId: string }>; searchParams: Promise<{ justCompleted?: string }> }) {
  const [{ brewId }, query] = await Promise.all([params, searchParams]);
  return <BrewDetail brewId={brewId} justCompleted={query.justCompleted === "1"}/>;
}
