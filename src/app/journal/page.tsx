import { JournalHome } from "@/components/journal-home";
import { Suspense } from "react";
export default function JournalPage() { return <Suspense fallback={<main className="route-loading"><h1>Journal</h1></main>}><JournalHome /></Suspense>; }
