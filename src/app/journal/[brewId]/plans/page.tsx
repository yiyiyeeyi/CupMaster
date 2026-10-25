import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ brewId: string }> }) { redirect(`/journal/${(await params).brewId}`); }
