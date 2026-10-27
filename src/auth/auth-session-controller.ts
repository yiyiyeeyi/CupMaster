import type { Session } from "@supabase/supabase-js";
import type { AuthRepository } from "./auth-repository";
import type { AuthState } from "./auth-types";
import { authError } from "./auth-errors";
import { initialAuthState } from "./auth-types";
import { SupabaseEnvironmentError } from "@/lib/supabase/env";

type Subscriber = (state: AuthState) => void;
export class AuthSessionController {
  private generation = 0;
  private state: AuthState = initialAuthState; private listeners = new Set<Subscriber>(); private unsubscribeAuth: (() => void) | null = null; private started = false;
  constructor(private readonly repositoryFactory: () => AuthRepository, private readonly bootstrap?: () => Promise<{ ok: boolean; value?: unknown }>) {}
  subscribe(listener: Subscriber) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  private publish(state: AuthState) { this.state = state; this.listeners.forEach((listener) => listener(state)); }
  private async applySession(session: Session | null, notice: string | null = null) {
    const generation = ++this.generation;
    if (!session) { this.publish({ ...initialAuthState, status: "local", notice }); return; }
    this.publish({ status: "authenticated", session, user: session.user, error: null, notice, profileBootstrap: "idle" });
    if (this.bootstrap) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (generation !== this.generation) return;
      try {
        const result = await this.bootstrap();
        if (generation !== this.generation) return;
        this.publish({ ...this.state, profileBootstrap: !result.ok ? "error" : result.value === null ? "missing" : "ready", ...(!result.ok && { notice: authError("profile_bootstrap_failed").message }) });
      } catch { if (generation === this.generation) this.publish({ ...this.state, profileBootstrap: "error" }); }
    }
  }
  async start() { if (this.started) return; this.started = true; try { const repository = this.repositoryFactory(); this.unsubscribeAuth = repository.onAuthStateChange((_event, session) => { void this.applySession(session); }); const generation = this.generation; const result = await repository.getSession(); if (generation !== this.generation || !this.started) return; if (result.ok) await this.applySession(result.value); else this.publish({ ...initialAuthState, status: "error", error: result.error }); } catch (error) { this.publish({ ...initialAuthState, status: "error", error: authError(error instanceof SupabaseEnvironmentError ? "cloud_unavailable" : "session_unavailable") }); } }
  stop() { this.generation++; this.unsubscribeAuth?.(); this.unsubscribeAuth = null; this.started = false; }
  continueLocally(notice = "Local data remains on this device.") { this.generation++; this.publish({ ...initialAuthState, status: "local", notice }); }
  setSession(session: Session | null, notice?: string) { return this.applySession(session, notice ?? null); }
  setError(message?: string) { this.publish({ ...this.state, status: "error", error: authError("session_unavailable"), notice: message ?? null }); }
}
