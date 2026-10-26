"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { effectiveDiscoveryPreferences, type DiscoveryPreferences } from "@/domain/discovery-preferences";
import { LocalDiscoveryPreferencesRepository } from "@/repositories/local-discovery-preferences-repository";
import { useProfile } from "@/hooks/use-profile";
import { startCopy as copy } from "./start-copy";
type PreferencesInput = Omit<DiscoveryPreferences, "updatedAt">;
type Context = { ready: boolean; value: PreferencesInput; notice: string | null; save(value: PreferencesInput): void };
const PreferencesContext = createContext<Context | null>(null);
export function DiscoveryPreferencesProvider({ children }: { children: React.ReactNode }) {
  const legacy = useProfile(), [repository] = useState(() => new LocalDiscoveryPreferencesRepository());
  const [current, setCurrent] = useState<DiscoveryPreferences | null>(null), [ready, setReady] = useState(false), [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    function load() { const result = repository.load(); if (result.ok) setCurrent(result.value); setNotice(result.ok ? null : result.message); setReady(true); }
    const timer = window.setTimeout(load, 0);
    function storage(event: StorageEvent) { if (event.key === null || event.key === "cupmaster:discovery-preferences") load(); }
    window.addEventListener("storage", storage); return () => { window.clearTimeout(timer); window.removeEventListener("storage", storage); };
  }, [repository]);
  function save(value: PreferencesInput) {
    const result = repository.save({ ...value, updatedAt: new Date().toISOString() });
    if (result.ok) setCurrent(result.value);
    setNotice(result.ok ? copy.saved : result.message);
  }
  return <PreferencesContext.Provider value={{ ready: ready && legacy.status === "ready", value: effectiveDiscoveryPreferences(current, legacy.storedProfile), notice, save }}>{children}</PreferencesContext.Provider>;
}
export function useDiscoveryPreferences() { const value = useContext(PreferencesContext); if (!value) throw Error("DiscoveryPreferencesProvider missing"); return value; }
