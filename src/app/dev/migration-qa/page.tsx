import { MigrationQaPanel } from "@/components/migration-qa-panel";
export default function MigrationQaPage() { if (process.env.NODE_ENV !== "development") return <main className="state-page"><p className="eyebrow">Unavailable</p><h1>Migration QA tools are disabled.</h1><p>This route cannot inspect or modify migration test state in production.</p></main>; return <MigrationQaPanel />; }
