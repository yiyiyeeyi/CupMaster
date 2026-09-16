import { DemoSeedPanel } from "@/components/demo-seed-panel";
export default function DemoPage() { if (process.env.NODE_ENV !== "development") return <main className="state-page"><p className="eyebrow">Unavailable</p><h1>Development tools are disabled.</h1><p>This route cannot write demo data in production.</p></main>; return <DemoSeedPanel />; }
