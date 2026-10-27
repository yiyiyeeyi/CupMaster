import { z } from "zod";
import { brewPersistenceSchema, brewPlanSchema, brewRecipeSnapshotSchema } from "@/data/local-brew-schema";
import { appliedBrewAdjustmentSchema, applyBrewAdjustment, synchronizePreparation, isValidPreparation, type AppliedBrewAdjustment, type BrewPreparation } from "@/domain/brew-preparation";
import { suggestedBrewPlanSchema } from "@/domain/suggested-plan";
import { localSuggestedPlanShapeSchema, migrateSuggestedPlanCandidate } from "@/data/local-suggested-plan-schema";

export const BREW_PREPARATIONS_KEY = "cupmaster:brew-preparations";
const entrySchema = z.object({ id: z.string(), snapshot: brewRecipeSnapshotSchema, plan: brewPlanSchema, sourceBrewId: z.string().nullable(),
  appliedAdjustment: appliedBrewAdjustmentSchema.nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), legacyPlanId: z.string().optional(), legacyBrewId: z.string().optional() });
const stateSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema), redirects: z.record(z.string(), z.string()),
  lineage: z.record(z.string(), z.object({ sourceBrewId: z.string().nullable(), appliedAdjustment: appliedBrewAdjustmentSchema.nullable() })),
  processedRaw: z.string().nullable(), backups: z.array(z.object({ plans: z.string(), brews: z.string().nullable() })), warnings: z.array(z.string()), deletedIds: z.array(z.string()).default([]) });
type State = z.infer<typeof stateSchema>;
type Port = Pick<Storage, "getItem" | "setItem">;
const empty = (): State => ({ version: 1, entries: [], redirects: {}, lineage: {}, processedRaw: null, backups: [], warnings: [], deletedIds: [] });
export class LocalBrewPreparationRepository {
  constructor(private readonly storage?: Port) {}
  private port() { const port = this.storage ?? (typeof window === "undefined" ? null : window.localStorage); if (!port) throw new Error("本機儲存不可用。"); return port; }
  read(): { ok: true; value: State } | { ok: false; message: string } {
    try { const raw = this.port().getItem(BREW_PREPARATIONS_KEY); return { ok: true, value: raw ? stateSchema.parse(JSON.parse(raw)) : empty() }; }
    catch { return { ok: false, message: "無法讀取準備紀錄，原資料已保留。" }; }
  }
  private write(value: State) {
    try { const validated = stateSchema.parse(value); this.port().setItem(BREW_PREPARATIONS_KEY, JSON.stringify(validated));
      if (this.port().getItem(BREW_PREPARATIONS_KEY) !== JSON.stringify(validated)) throw new Error("readback");
      return { ok: true as const, value: validated };
    } catch { return { ok: false as const, message: "無法保存準備紀錄，請確認儲存空間後重試。" }; }
  }
  save(seed: BrewPreparation, id: string, at: string) {
    seed = synchronizePreparation(seed);
    if (!isValidPreparation(seed)) return { ok: false as const, message: "請檢查沖煮參數與階段秒數。" };
    const read = this.read(); if (!read.ok) return read;
    if (read.value.deletedIds.includes(id)) return { ok: false as const, message: "這份準備紀錄已刪除，請返回 Journal。" };
    const existing = read.value.entries.find(entry => entry.id === id);
    const entry = entrySchema.safeParse({ ...existing, ...seed, id, createdAt: existing?.createdAt ?? at, updatedAt: at });
    if (!entry.success) return { ok: false as const, message: "準備資料不完整，未保存。" };
    return this.write({ ...read.value, entries: [...read.value.entries.filter(item => item.id !== id), entry.data] });
  }
  remove(id: string) {
    const read = this.read(); if (!read.ok) return read;
    if (read.value.deletedIds.includes(id)) return { ok: true as const };
    return this.write({ ...read.value, entries: read.value.entries.filter(entry => entry.id !== id), deletedIds: [...read.value.deletedIds, id] });
  }
  /** One atomic envelope contains converted data, mappings and untouched originals. */
  migrate() {
    const read = this.read(); if (!read.ok) return read;
    try {
      const raw = this.port().getItem("cupmaster:suggested-plans");
      if (!raw || raw === read.value.processedRaw) return read;
      const state = structuredClone(read.value), brewRaw = this.port().getItem("cupmaster:brews");
      const envelope = localSuggestedPlanShapeSchema.parse(JSON.parse(raw));
      const brewEnvelope = z.object({ version: z.literal(1), data: z.object({ brews: z.array(z.unknown()) }) }).parse(brewRaw ? JSON.parse(brewRaw) : { version: 1, data: { brews: [] } });
      const brews = brewEnvelope.data.brews.flatMap(candidate => { const parsed = brewPersistenceSchema.safeParse(candidate); return parsed.success ? [parsed.data] : []; });
      const ids = new Set<string>();
      const originals = new Map<string, string>(), conflicts = new Set<string>(), owners = new Map<string, Set<string>>();
      for (const candidate of envelope.data.plans) {
        const identity = z.object({ id: z.string(), resultingBrewId: z.string().nullable().optional() }).safeParse(candidate);
        if (!identity.success) continue;
        const rawCandidate = JSON.stringify(candidate, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value);
        const previous = originals.get(identity.data.id);
        if (previous !== undefined && previous !== rawCandidate) conflicts.add(identity.data.id);
        originals.set(identity.data.id, rawCandidate);
        if (identity.data.resultingBrewId) {
          const group = owners.get(identity.data.resultingBrewId) ?? new Set<string>(); group.add(identity.data.id); owners.set(identity.data.resultingBrewId, group);
        }
      }
      for (const group of owners.values()) if (group.size > 1) for (const id of group) conflicts.add(id);
      state.backups.push({ plans: raw, brews: brewRaw });
      for (const candidate of envelope.data.plans) {
        const migrated = migrateSuggestedPlanCandidate(candidate), parsed = suggestedBrewPlanSchema.safeParse(migrated.candidate);
        if (!parsed.success) { state.warnings.push("無法轉換的 Plan 原件已保留。"); continue; }
        const plan = parsed.data;
        if (conflicts.has(plan.id)) { state.warnings.push(`${plan.id}: ambiguous_mapping`); continue; }
        if (ids.has(plan.id)) { state.warnings.push(`${plan.id}: duplicate_plan`); continue; } ids.add(plan.id);
        state.warnings.push(...migrated.warnings.map(warning => `${plan.id}: ${warning.code}`));
        try {
          const base = brewRecipeSnapshotSchema.parse(plan.baseRecipeSnapshot);
          const result = brews.find(brew => brew.id === plan.resultingBrewId);
          if (result && ((result.sourceSuggestedPlanId && result.sourceSuggestedPlanId !== plan.id)
            || (result.sourceBrewId && result.sourceBrewId !== plan.sourceBrewId))) { state.warnings.push(`${plan.id}: mapping_mismatch`); continue; }
          if (plan.resultingBrewId && !result) state.warnings.push(`${plan.id}: resulting_brew_missing`);
          const source = brews.find(brew => brew.id === plan.sourceBrewId);
          if (!source) state.warnings.push(`${plan.id}: source_brew_missing`);
          const templatePlan = result?.brewPlan ?? source?.brewPlan ?? (base.sourceRecipeId && base.sourceRecipeVersion ? {
            id: `legacy-plan:${plan.id}`, sourceRecipeId: base.sourceRecipeId, sourceRecipeVersion: base.sourceRecipeVersion, recipeTitle: base.title, method: base.method,
            coffeeDose: base.doseGrams, waterTotal: base.totalWaterGrams, waterTemperature: base.temperatureCelsius, ratio: base.ratio, dripper: base.dripper,
            grindSetting: base.grindDescription, expectedTotalTime: base.expectedTimeSeconds.value, stages: [], createdAt: plan.createdAt,
          } : null);
          if (!templatePlan) { state.warnings.push(`${plan.id}: preparation_plan_missing`); continue; }
          const metadata: Omit<AppliedBrewAdjustment, "version" | "changes"> = { adjustment: plan.adjustments[0], sourceAnalysisId: plan.sourceAnalysisId,
            sourceRecommendationId: plan.sourceRecommendationId, sourceFingerprint: plan.sourceFingerprint, analysisGeneratedAt: plan.sourceAnalysisGeneratedAt,
            rationale: plan.rationale, confidence: plan.confidence, evidence: plan.evidence };
          const seed = applyBrewAdjustment({ snapshot: base, plan: templatePlan, sourceBrewId: source?.id ?? null, appliedAdjustment: null }, metadata);
          const confirmed = result ? synchronizePreparation({ ...seed, snapshot: result.recipeSnapshot, plan: result.brewPlan }) : seed;
          if (result && (result.executionStatus !== "not_started" || result.startedAt || result.stageResults.length)) {
            if (state.lineage[result.id] && JSON.stringify(state.lineage[result.id]) !== JSON.stringify({ sourceBrewId: source?.id ?? null, appliedAdjustment: confirmed.appliedAdjustment })) { state.warnings.push(`${plan.id}: lineage_conflict`); continue; }
            state.lineage[result.id] = { sourceBrewId: source?.id ?? null, appliedAdjustment: confirmed.appliedAdjustment }; continue;
          }
          const id = `legacy-plan:${plan.id}`;
          if (state.deletedIds.includes(id)) continue;
          if (result && state.redirects[result.id] && state.redirects[result.id] !== id) { state.warnings.push(`${plan.id}: duplicate_result`); continue; }
          const entry = entrySchema.parse({ ...confirmed, ...(result && { snapshot: result.recipeSnapshot, plan: result.brewPlan }), id,
            createdAt: plan.createdAt, updatedAt: plan.updatedAt, legacyPlanId: plan.id, ...(result && { legacyBrewId: result.id }) });
          const existing = state.entries.find(item => item.id === id);
          if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) { state.warnings.push(`${plan.id}: conversion_conflict`); continue; }
          if (!existing) state.entries.push(entry);
          if (result) {
            state.redirects[result.id] = id;
          }
        } catch { state.warnings.push(`${plan.id}: invalid_preparation`); }
      }
      state.processedRaw = raw;
      return this.write(state);
    } catch { return { ok: false as const, message: "舊準備資料尚未轉換，原件未變動，請重試。" }; }
  }
  legacyResult(planId: string): string | null {
    const read = this.read(); if (!read.ok) return null;
    for (const backup of [...read.value.backups].reverse()) {
      let raw: unknown;
      try { raw = JSON.parse(backup.plans); } catch { continue; }
      const envelope = localSuggestedPlanShapeSchema.safeParse(raw); if (!envelope.success) continue;
      for (const candidate of envelope.data.data.plans) {
        const parsed = z.object({ id: z.string(), resultingBrewId: z.string().nullable().optional() }).safeParse(candidate);
        if (parsed.success && parsed.data.id === planId && parsed.data.resultingBrewId && read.value.lineage[parsed.data.resultingBrewId]) return parsed.data.resultingBrewId;
      }
    }
    return null;
  }
}
