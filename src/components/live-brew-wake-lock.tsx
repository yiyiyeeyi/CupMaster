"use client";

import { useEffect, useRef, useState } from "react";
import { ScreenWakeLockService, type ScreenWakeLockState } from "@/infrastructure/screen-wake-lock";
import { LocalLiveBrewRepository } from "@/repositories/local-live-brew-repository";
import { guidedBrewCopy as copy } from "./guided-brew-copy";
import styles from "./live-brew-wake-lock.module.css";

export function LiveBrewWakeLock({ preparing, active = true }: { preparing: boolean; active?: boolean }) {
  const [service] = useState(() => new ScreenWakeLockService());
  const [preferences] = useState(() => new LocalLiveBrewRepository());
  const [state, setState] = useState<ScreenWakeLockState>("idle");
  const [dismissed, setDismissed] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!active) return;
    const unsubscribe = service.subscribe(setState);
    const acquire = () => { if (document.visibilityState === "visible") void service.request(); else service.stop(); };
    const readTimer = window.setTimeout(() => { const read = preferences.read(); if (read.ok) setDismissed(read.value.hideWakeLockHelp); setPreferencesLoaded(true); }, 0);
    document.addEventListener("visibilitychange", acquire);
    const release = () => service.stop();
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", acquire);
    acquire();
    return () => { window.clearTimeout(readTimer); document.removeEventListener("visibilitychange", acquire); window.removeEventListener("pagehide", release); window.removeEventListener("pageshow", acquire); unsubscribe(); service.stop(); };
  }, [active, preferences, service]);
  useEffect(() => {
    if (open) sheet.current?.showModal(); else sheet.current?.close();
  }, [open]);
  const failed = state === "unsupported" || state === "denied" || state === "released";
  if (!active || !preparing || !preferencesLoaded || dismissed || !failed) return null;
  return <>
    <p className={styles.hint}>{copy.wakeLockHint} <button aria-label={copy.wakeLockMore} className={styles.info} onClick={() => setOpen(true)} type="button">ⓘ</button></p>
    <dialog aria-labelledby="wake-lock-help-title" className={styles.sheet} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} ref={sheet}>
      <header><h2 id="wake-lock-help-title">{copy.wakeLockHint}</h2><button className="text-button" onClick={() => setOpen(false)} type="button">{copy.close}</button></header>
      <p>{copy.wakeLockInstructions}</p><p>{copy.wakeLockIphone}</p><p>{copy.wakeLockAndroid}</p>
      {error && <p role="alert">{error}</p>}
      <button className="secondary-button" onClick={() => { const result = preferences.dismissWakeLockHelp(); if (result.ok) { setOpen(false); setDismissed(true); } else setError(copy.wakeLockPreferenceFailed); }} type="button">{copy.wakeLockDismiss}</button>
    </dialog>
  </>;
}
