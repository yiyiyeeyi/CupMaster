import { z } from "zod";

const schema = z.object({
  version: z.literal(1),
  interruptions: z.record(z.string(), z.object({ run: z.number().int().positive(), leftAt: z.number().finite().nonnegative() })),
  hideWakeLockHelp: z.boolean(),
});
type State = z.infer<typeof schema>;
type StoragePort = Pick<Storage, "getItem" | "setItem">;
const empty = (): State => ({ version: 1, interruptions: {}, hideWakeLockHelp: false });
const key = "cupmaster:live-brew";

/** Browser-only execution metadata and preferences, separate from saved Brews. */
export class LocalLiveBrewRepository {
  constructor(private readonly storage?: StoragePort) {}
  private port() { return this.storage ?? (typeof window === "undefined" ? null : window.localStorage); }
  read(): { ok: true; value: State } | { ok: false; message: string } {
    try {
      const raw = this.port()?.getItem(key);
      return { ok: true, value: raw ? schema.parse(JSON.parse(raw)) : empty() };
    } catch { return { ok: false, message: "無法讀取沖煮中斷紀錄，原資料已保留。" }; }
  }
  private write(value: State): { ok: true } | { ok: false; message: string } {
    try {
      const port = this.port();
      if (!port) throw new Error("Storage unavailable");
      port.setItem(key, JSON.stringify(schema.parse(value)));
      return { ok: true };
    } catch { return { ok: false, message: "無法儲存沖煮中斷紀錄或提醒設定。" }; }
  }
  markLeft(id: string, run: number, leftAt: number) {
    const read = this.read();
    if (!read.ok) return read;
    if (read.value.interruptions[id]?.run === run) return { ok: true as const };
    return this.write({ ...read.value, interruptions: { ...read.value.interruptions, [id]: { run, leftAt } } });
  }
  clear(id: string) {
    const read = this.read();
    if (!read.ok) return read;
    if (!read.value.interruptions[id]) return { ok: true as const };
    const interruptions = { ...read.value.interruptions };
    delete interruptions[id];
    return this.write({ ...read.value, interruptions });
  }
  dismissWakeLockHelp() {
    const read = this.read();
    return read.ok ? this.write({ ...read.value, hideWakeLockHelp: true }) : read;
  }
}
