"use client";
import { useEffect, useState } from "react";
import type { Brew } from "@/domain";
import type { SourceBrewSuggestedPlanProjection } from "@/application/suggested-plan-projection";
import { JournalLoader } from "@/application/journal-loader";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { BrewSuggestedPlanContext } from "./brew-suggested-plan-context";

type State = { brew: Brew; projection: SourceBrewSuggestedPlanProjection } | null;
export function BrewSuggestedPlanLoader({ brewId }: { brewId: string }) {
  const [state, setState] = useState<State>(null);
  useEffect(() => { const timer = setTimeout(() => { const result = new JournalLoader(new LocalBrewRepository(), new LocalSuggestedPlanRepository()).getSuggestedPlansForSourceBrew(brewId); if (result.ok) setState({ brew: result.brew, projection: result.projection }); }, 0); return () => clearTimeout(timer); }, [brewId]);
  return state ? <BrewSuggestedPlanContext brew={state.brew} sourceProjection={state.projection} /> : null;
}
