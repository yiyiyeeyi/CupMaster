import { describe, expect, it } from "vitest";
import { createBrewDraft, createQuickPrepareDefaults } from "@/application/brew-factory";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { brewSchema, localBrewEnvelopeSchema } from "@/data/local-brew-schema";
import { LocalBrewRepository, LOCAL_BREW_KEY } from "./local-brew-repository";
class MemoryStorage { values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } }
function draft(id = "brew-1") { return createBrewDraft(recipeFixtures[0], createQuickPrepareDefaults(recipeFixtures[0]), { now: () => "2026-07-15T12:00:00.000Z", createId: () => id }); }

describe("LocalBrewRepository", () => {
  it("validates the local Brew envelope", () => expect(localBrewEnvelopeSchema.safeParse({ version: 1, data: { brews: [draft()] } }).success).toBe(true));
  it("falls back for damaged JSON", () => { const storage = new MemoryStorage(); storage.setItem(LOCAL_BREW_KEY, "{bad"); const result = new LocalBrewRepository(storage).listDrafts(); expect(result.ok).toBe(false); expect(result.value).toEqual([]); });
  it("preserves valid Brews when one item is damaged", () => { const storage = new MemoryStorage(); storage.setItem(LOCAL_BREW_KEY, JSON.stringify({ version: 1, data: { brews: [draft(), { broken: true }] } })); const result = new LocalBrewRepository(storage).listDrafts(); expect(result.value).toHaveLength(1); expect(result.ok && result.notice).toContain("ignored"); });
  it("serializes and hydrates a Draft", () => { const storage = new MemoryStorage(); const repository = new LocalBrewRepository(storage); repository.createDraft(draft()); expect(repository.getById("brew-1").value).toEqual(draft()); });
  it("creates, gets, and lists Drafts", () => { const repository = new LocalBrewRepository(new MemoryStorage()); expect(repository.createDraft(draft()).ok).toBe(true); expect(repository.getById("brew-1").value?.id).toBe("brew-1"); expect(repository.listDrafts().value).toHaveLength(1); });
  it("updates an existing Draft", () => { const repository = new LocalBrewRepository(new MemoryStorage()); repository.createDraft(draft()); const changed = { ...draft(), updatedAt: "2026-07-15T13:00:00.000Z", currentStageOrder: 1 }; expect(repository.updateDraft(changed).ok).toBe(true); expect(repository.getById("brew-1").value?.currentStageOrder).toBe(1); });
  it("deletes an existing Draft", () => { const repository = new LocalBrewRepository(new MemoryStorage()); repository.createDraft(draft()); expect(repository.deleteDraft("brew-1").ok).toBe(true); expect(repository.getById("brew-1").value).toBeNull(); });
  it("does not create a duplicate lifecycle", () => { const repository = new LocalBrewRepository(new MemoryStorage()); expect(repository.createDraft(draft()).ok).toBe(true); expect(repository.createDraft(draft()).ok).toBe(false); expect(repository.listDrafts().value).toHaveLength(1); });
  it("returns null for a missing Brew id", () => expect(new LocalBrewRepository(new MemoryStorage()).getById("missing").value).toBeNull());
  it("rejects an invalid Draft schema", () => expect(brewSchema.safeParse({ id: "broken" }).success).toBe(false));
});
