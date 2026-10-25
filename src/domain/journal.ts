import type { Brew } from "./types";
import type { SavedBrewPreparation } from "./brew-preparation";

export type JournalFilter = "all" | "completed" | "preparations";
export type JournalItem = { kind: "completed"; id: string; at: string; brew: Brew } | { kind: "preparations"; id: string; at: string; preparation: SavedBrewPreparation };
export interface JournalGroup { kind: JournalItem["kind"]; date: string; items: JournalItem[]; }
export function journalFilter(value: string | null): JournalFilter {
  return value === "completed" || value === "preparations" ? value : "all";
}
export function journalDateKey(at: string | Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
export function groupJournal(brews: Brew[], preparations: SavedBrewPreparation[], filter: JournalFilter, timeZone?: string): JournalGroup[] {
  const items: JournalItem[] = [
    ...preparations.map(preparation => ({ kind: "preparations" as const, id: preparation.id, at: preparation.updatedAt, preparation })),
    ...brews.filter(brew => brew.executionStatus === "completed" && !brew.legacyPreparationId).map(brew => ({ kind: "completed" as const, id: brew.id, at: brew.completedAt ?? brew.updatedAt, brew })),
  ].filter(item => filter === "all" || item.kind === filter);
  items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "preparations" ? -1 : 1) || Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
  const groups: JournalGroup[] = [];
  for (const item of items) {
    const date = journalDateKey(item.at, timeZone), previous = groups.at(-1);
    if (previous?.kind === item.kind && previous.date === date) previous.items.push(item);
    else groups.push({ kind: item.kind, date, items: [item] });
  }
  return groups;
}
