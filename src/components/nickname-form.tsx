"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileBootstrapService } from "@/auth/profile-bootstrap-service";
import { useAuth } from "./auth-provider";
import { useProfile } from "@/hooks/use-profile";

export function NicknameForm({ next }: { next: string }) {
  const auth = useAuth(), local = useProfile(), router = useRouter();
  const [service] = useState(() => new ProfileBootstrapService());
  const [name, setName] = useState(""), [ready, setReady] = useState(false), [error, setError] = useState<string | null>(null);
  const lock = useRef(false), active = useRef(true), [busy, setBusy] = useState(false);
  const userId = auth.user?.id;
  const suggested = local.storedProfile?.profile.displayName ?? "";
  useEffect(() => {
    active.current = true;
    if (!userId) return;
    let cancelled = false;
    void service.readNickname(userId).then(result => {
      if (cancelled) return;
      if (!result.ok) { setError(result.error.message); setReady(true); return; }
      if (!result.value.required) { router.replace(next); return; }
      setName(current => current || result.value.name || suggested); setReady(true);
    }).catch(() => { if (!cancelled) { setReady(true); setError("暱稱暫時無法讀取，請重試。"); } });
    return () => { cancelled = true; active.current = false; };
  }, [userId, service, router, next, suggested]);
  async function save() {
    if (!userId || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const result = await service.confirmNickname(userId, name);
      if (!active.current) return;
      if (!result.ok) { setError(result.error.message); return; }
      await auth.refreshSession();
      if (active.current) router.replace(next);
    } catch { if (active.current) setError("儲存失敗，輸入已保留，請重試。"); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  return <main className="auth-page"><p className="eyebrow">YOUR NAME</p><h1>希望我們怎麼稱呼你？</h1><p>保留目前的暱稱，或改成喜歡的名字。</p><form className="auth-form" onSubmit={event => { event.preventDefault(); void save(); }}><label>暱稱<input autoComplete="nickname" required minLength={2} maxLength={40} value={name} onChange={event => setName(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={!ready || busy} type="submit">{busy ? "儲存中…" : "保留／確認暱稱"}</button></form><Link href={next}>稍後再填，繼續使用</Link><p className="auth-boundary">暱稱尚未完成時，紀錄只存在這個瀏覽器。</p></main>;
}
