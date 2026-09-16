"use client";
import Link from "next/link";
import { useState } from "react";
import { DemoSeedService, type DemoSeedMode } from "@/dev/demo-seed-service";
import { LocalUserProfileRepository } from "@/repositories/local-user-profile-repository";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";

function service() { return new DemoSeedService(new LocalUserProfileRepository(), new LocalBrewRepository(), new LocalSuggestedPlanRepository(), "development"); }
export function DemoSeedPanel() {
  const [counts, setCounts] = useState(() => ({ brews: 0, plans: 0, profile: false, demoBrews: 0, demoPlans: 0 }));
  const [message, setMessage] = useState("Select a deterministic local dataset.");
  const [confirmProfile, setConfirmProfile] = useState<DemoSeedMode | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const refresh = () => setCounts(service().counts());
  function seed(mode: DemoSeedMode, overwriteProfile = false) { const result = service().seed(mode, { overwriteProfile }); if (!result.ok && result.code === "confirmation_required") { setConfirmProfile(mode); setMessage(result.message); return; } setConfirmProfile(null); setMessage(result.ok ? `Seeded ${result.brewCount} Brews and ${result.planCount} Plans. Repeating this action is safe.` : result.message); refresh(); }
  function reset() { if (!confirmReset) { setConfirmReset(true); setMessage("Confirm reset to remove only CupMaster profile, Brew, and Suggested Plan storage."); return; } const result = service().resetAll(); setConfirmReset(false); setMessage(result.ok ? `Reset complete. Removed ${result.removedBrews} Brews and ${result.removedPlans} Plans.` : result.message); refresh(); }
  return <main className="demo-page"><p className="eyebrow">Development tools only</p><h1>CupMaster Demo</h1><p>Fixtures use fixed IDs and validated domain schemas. Seed merges demo IDs without removing non-demo Brew or Plan records.</p><button className="secondary-button" onClick={refresh} type="button">Refresh counts</button><dl className="demo-counts"><div><dt>Profile</dt><dd>{counts.profile ? "Present" : "Empty"}</dd></div><div><dt>Brews</dt><dd>{counts.brews} total · {counts.demoBrews} demo</dd></div><div><dt>Plans</dt><dd>{counts.plans} total · {counts.demoPlans} demo</dd></div></dl><p className="notice" role="status">{message}</p><section className="demo-actions"><button className="primary-button" onClick={() => seed("full")} type="button">Seed Full Demo</button><button className="secondary-button" onClick={() => seed("minimal")} type="button">Seed Minimal First Brew</button><button className="secondary-button" onClick={() => seed("analysis_next_try")} type="button">Seed Analysis + Next Try Flow</button>{confirmProfile && <button className="warning-button" onClick={() => seed(confirmProfile, true)} type="button">Confirm profile replacement and seed</button>}<button className="warning-button" onClick={reset} type="button">{confirmReset ? "Confirm Reset CupMaster Local Data" : "Reset CupMaster Local Data"}</button></section><nav aria-label="Demo destinations" className="demo-links"><Link href="/discover">Discover</Link><Link href="/journal">Journal</Link><Link href="/brew">Brew Hub</Link></nav></main>;
}
