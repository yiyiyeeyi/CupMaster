import { z } from "zod";
import { discoveryPreferencesSchema, type DiscoveryPreferences } from "@/domain/discovery-preferences";
export const DISCOVERY_PREFERENCES_KEY = "cupmaster:discovery-preferences";
const envelope = z.object({ version: z.literal(1), data: discoveryPreferencesSchema });
type Port = Pick<Storage, "getItem" | "setItem">;
export class LocalDiscoveryPreferencesRepository {
  constructor(private readonly storage?: Port) {}
  private port() { const port = this.storage ?? (typeof window === "undefined" ? null : window.localStorage); if (!port) throw Error("storage"); return port; }
  load(): { ok: true; value: DiscoveryPreferences | null } | { ok: false; message: string } {
    try { const raw = this.port().getItem(DISCOVERY_PREFERENCES_KEY); return { ok: true, value: raw ? envelope.parse(JSON.parse(raw)).data : null }; }
    catch { return { ok: false, message: "無法讀取選填偏好，原資料已保留；仍可挑選食譜與沖煮。" }; }
  }
  save(value: DiscoveryPreferences) {
    try {
      const read = this.load(); if (!read.ok) return read;
      const data = envelope.parse({ version: 1, data: value }); this.port().setItem(DISCOVERY_PREFERENCES_KEY, JSON.stringify(data));
      return { ok: true as const, value: data.data };
    } catch { return { ok: false as const, message: "偏好未能保存，請重試；不影響挑選食譜與沖煮。" }; }
  }
}
