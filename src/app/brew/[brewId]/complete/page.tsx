import { redirect } from "next/navigation";
export default async function BrewCompletePage({ params }: { params: Promise<{ brewId: string }> }) {
  redirect(`/journal/${(await params).brewId}`);
}
