import type { Brew } from "@/domain";
import type { BrewRepository } from "@/repositories/brew-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";

/** Called only after the Brew's authoritative write succeeds. Journal repairs interruptions. */
export function consumeCompletedPreparation(brew: Brew, preparations = new LocalBrewPreparationRepository()) {
  if (brew.executionStatus !== "completed" || brew.recordStatus !== "saved" || !brew.sourcePreparationId) return { ok: true as const };
  return preparations.remove(brew.sourcePreparationId);
}
export function writeBrewWithPreparationCleanup(repository: BrewRepository, brew: Brew, preparations = new LocalBrewPreparationRepository()) {
  const written = repository.updateDraft(brew);
  if (written.ok) consumeCompletedPreparation(written.value, preparations);
  // Preparation removal is secondary; its failure must never undo a saved Brew.
  return written;
}
