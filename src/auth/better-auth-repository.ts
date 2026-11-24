"use client";

import { createAuthClient } from "better-auth/client";
import { authError, mapBetterAuthError } from "./auth-errors";
import type { AuthRepository, AuthStateListener } from "./auth-repository";
import type { AppSession, AuthCredentials, AuthResult, SignUpOutcome } from "./auth-types";

const client = createAuthClient();

export class BetterAuthRepository implements AuthRepository {
  private readonly listeners = new Set<AuthStateListener>();

  private publish(session: AppSession | null) {
    this.listeners.forEach(listener => listener(session ? "SIGNED_IN" : "SIGNED_OUT", session));
  }

  async getSession(): Promise<AuthResult<AppSession | null>> {
    const { data, error } = await client.getSession();
    if (error) return { ok: false, error: mapBetterAuthError(error) };
    return { ok: true, value: data ? { user: data.user } : null };
  }

  async getUser() {
    const result = await this.getSession();
    return result.ok ? { ok: true as const, value: result.value?.user ?? null } : result;
  }

  async signInWithEmail(credentials: AuthCredentials): Promise<AuthResult<AppSession>> {
    const { data, error } = await client.signIn.email(credentials);
    if (error) return { ok: false, error: mapBetterAuthError(error) };
    const session = { user: data.user };
    this.publish(session);
    return { ok: true, value: session };
  }

  async signUpWithEmail({ email, password, displayName }: AuthCredentials & { displayName?: string }): Promise<AuthResult<SignUpOutcome>> {
    const { data, error } = await client.signUp.email({ email, password, name: displayName ?? "" });
    if (error) return { ok: false, error: mapBetterAuthError(error) };
    if (!data.token) return { ok: false, error: authError("session_unavailable") };
    const session = { user: data.user };
    this.publish(session);
    return { ok: true, value: { user: session.user, session, needsEmailConfirmation: false } };
  }

  async resendSignupConfirmation() {
    return { ok: true as const, value: null };
  }

  async signOut() {
    const { error } = await client.signOut();
    if (error) return { ok: false as const, error: mapBetterAuthError(error) };
    this.publish(null);
    return { ok: true as const, value: null };
  }

  refreshSession() {
    return this.getSession();
  }

  onAuthStateChange(listener: AuthStateListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
