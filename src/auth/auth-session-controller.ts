import type { Session } from "@supabase/supabase-js";
import type { AuthRepository } from "./auth-repository";
import type { AuthState } from "./auth-types";
import { authError } from "./auth-errors";
import { initialAuthState } from "./auth-types";
import { SupabaseEnvironmentError } from "@/lib/supabase/env";

type Subscriber = (state: AuthState) => void;
export class AuthSessionController {
  private state: AuthState = initialAuthState; private listeners = new Set<Subscriber>(); private unsubscribeAuth: (() => void) | null = null; private started = false;
  constructor(private readonly repositoryFactory: () => AuthRepository, private readonly bootstrap?: () => Promise<{ ok: boolean }>) {}
  subscribe(listener: Subscriber) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  private publish(state: AuthState) { this.state = state; this.listeners.forEach((listener) => listener(state)); }
  private async applySession(session: Session | null, notice: string | null = null) { if (!session) { this.publish({ ...initialAuthState, status: "local", notice }); return; } this.publish({ status: "authenticated", session, user: session.user, error: null, notice, profileBootstrap: "idle" }); if (this.bootstrap) { const result = await this.bootstrap(); if (!result.ok) this.publish({ ...this.state, profileBootstrap: "error", notice: authError("profile_bootstrap_failed").message }); else this.publish({ ...this.state, profileBootstrap: "ready" }); } }
  async start() { if (this.started) return; this.started = true; try { const repository = this.repositoryFactory(); this.unsubscribeAuth = repository.onAuthStateChange((_event, session) => { void this.applySession(session); }); const result = await repository.getSession(); if (result.ok) await this.applySession(result.value); else this.publish({ ...initialAuthState, status: "error", error: result.error }); } catch (error) { this.publish({ ...initialAuthState, status: "error", error: authError(error instanceof SupabaseEnvironmentError ? "cloud_unavailable" : "session_unavailable") }); } }
  stop() { this.unsubscribeAuth?.(); this.unsubscribeAuth = null; this.started = false; }
  continueLocally(notice = "Local data remains on this device.") { this.publish({ ...initialAuthState, status: "local", notice }); }
  setSession(session: Session | null, notice?: string) { return this.applySession(session, notice ?? null); }
  setError(message?: string) { this.publish({ ...this.state, status: "error", error: authError("session_unavailable"), notice: message ?? null }); }
}
