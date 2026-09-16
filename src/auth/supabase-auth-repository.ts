"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";
import { mapSupabaseAuthError } from "./auth-errors";
import type { AuthRepository, AuthStateListener } from "./auth-repository";
import type { AuthCredentials, AuthResult, SignUpOutcome } from "./auth-types";

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly client: SupabaseClient<Database> = getSupabaseBrowserClient()) {}
  async getSession() { const { data, error } = await this.client.auth.getSession(); return error ? { ok: false as const, error: mapSupabaseAuthError(error) } : { ok: true as const, value: data.session }; }
  async getUser() { const { data, error } = await this.client.auth.getUser(); return error ? { ok: false as const, error: mapSupabaseAuthError(error) } : { ok: true as const, value: data.user }; }
  async signInWithEmail(credentials: AuthCredentials) { const { data, error } = await this.client.auth.signInWithPassword(credentials); if (error || !data.session) return { ok: false as const, error: mapSupabaseAuthError(error) }; return { ok: true as const, value: data.session }; }
  async signUpWithEmail(credentials: AuthCredentials): Promise<AuthResult<SignUpOutcome>> { const { data, error } = await this.client.auth.signUp(credentials); if (error) return { ok: false, error: mapSupabaseAuthError(error) }; return { ok: true, value: { user: data.user, session: data.session, needsEmailConfirmation: Boolean(data.user && !data.session) } }; }
  async resendSignupConfirmation(email: string) { const { error } = await this.client.auth.resend({ type: "signup", email }); return error ? { ok: false as const, error: mapSupabaseAuthError(error) } : { ok: true as const, value: null }; }
  async signOut() { const { error } = await this.client.auth.signOut({ scope: "local" }); return error ? { ok: false as const, error: mapSupabaseAuthError(error) } : { ok: true as const, value: null }; }
  async refreshSession() { const { data, error } = await this.client.auth.refreshSession(); return error ? { ok: false as const, error: mapSupabaseAuthError(error) } : { ok: true as const, value: data.session }; }
  onAuthStateChange(listener: AuthStateListener) { const { data } = this.client.auth.onAuthStateChange(listener); return () => data.subscription.unsubscribe(); }
}
