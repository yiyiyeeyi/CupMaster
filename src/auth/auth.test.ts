import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { AuthRepository, AuthStateListener } from "./auth-repository";
import type { AuthCredentials, AuthResult, AuthState, SignUpOutcome } from "./auth-types";
import { AuthService } from "./auth-service";
import { AuthSessionController } from "./auth-session-controller";
import { authError, mapSupabaseAuthError } from "./auth-errors";
import { getSafeNextRoute } from "./safe-next-route";
import { authPageLayoutContract, getMeAuthViewModel, isLocalRoute } from "./auth-view-model";
import { SupabaseEnvironmentError } from "@/lib/supabase/env";

const user: User = { id: "user-1", aud: "authenticated", role: "authenticated", email: "brewer@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00.000Z" };
const session: Session = { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user };
class FakeAuthRepository implements AuthRepository {
  session: Session | null = null; failure: AuthResult<Session | null> | null = null; resendFailure: AuthResult<null> | null = null; listener: AuthStateListener | null = null; subscribeCount = 0; unsubscribeCount = 0; signOutCount = 0; resendCount = 0; lastResendEmail: string | null = null; delaySignIn = false; delayResend = false;
  async getSession() { return this.failure ?? { ok: true as const, value: this.session }; }
  async getUser() { return { ok: true as const, value: this.session?.user ?? null }; }
  async signInWithEmail(credentials: AuthCredentials) { if (this.delaySignIn) await new Promise((resolve) => setTimeout(resolve, 5)); return credentials.email === "bad@example.test" ? { ok: false as const, error: authError("invalid_credentials") } : { ok: true as const, value: session }; }
  async signUpWithEmail(credentials: AuthCredentials): Promise<AuthResult<SignUpOutcome>> { return { ok: true, value: { user, session: credentials.email.startsWith("confirm") ? null : session, needsEmailConfirmation: credentials.email.startsWith("confirm") } }; }
  async resendSignupConfirmation(email: string) { this.resendCount++; this.lastResendEmail = email; if (this.delayResend) await new Promise((resolve) => setTimeout(resolve, 5)); return this.resendFailure ?? { ok: true as const, value: null }; }
  async signOut() { this.signOutCount++; return { ok: true as const, value: null }; }
  async refreshSession() { return { ok: true as const, value: this.session }; }
  onAuthStateChange(listener: AuthStateListener) { this.subscribeCount++; this.listener = listener; return () => { this.unsubscribeCount++; }; }
  emit(value: Session | null, event: AuthChangeEvent = "SIGNED_IN") { this.listener?.(event, value); }
}
function observe(controller: AuthSessionController) { let latest: AuthState = { status: "loading", user: null, session: null, error: null, notice: null, profileBootstrap: "idle" }; const unsubscribe = controller.subscribe((state) => { latest = state; }); return { latest: () => latest, unsubscribe }; }
describe("Cloud 2 auth", () => {
  it("starts loading", () => { const repo = new FakeAuthRepository(); expect(observe(new AuthSessionController(() => repo)).latest().status).toBe("loading"); });
  it("no session becomes local", async () => { const repo = new FakeAuthRepository(); const c = new AuthSessionController(() => repo); const o = observe(c); await c.start(); expect(o.latest().status).toBe("local"); });
  it("session becomes authenticated", async () => { const repo = new FakeAuthRepository(); repo.session = session; const c = new AuthSessionController(() => repo); const o = observe(c); await c.start(); expect(o.latest().status).toBe("authenticated"); });
  it("getSession network failure stays a recoverable network error", async () => { const repo = new FakeAuthRepository(); repo.failure = { ok: false, error: authError("network_error") }; const c = new AuthSessionController(() => repo); const o = observe(c); await c.start(); expect(o.latest().error?.code).toBe("network_error"); });
  it("missing public environment maps to cloud unavailable", async () => { const c = new AuthSessionController(() => { throw new SupabaseEnvironmentError("missing"); }); const o = observe(c); await c.start(); expect(o.latest().error?.code).toBe("cloud_unavailable"); });
  it("missing client factory is recoverable", async () => { const c = new AuthSessionController(() => { throw new Error("env"); }); const o = observe(c); await c.start(); expect(o.latest().error?.code).toBe("session_unavailable"); });
  it("continues locally", () => { const c = new AuthSessionController(() => new FakeAuthRepository()); const o = observe(c); c.continueLocally(); expect(o.latest().status).toBe("local"); });
  it("subscribes once", async () => { const repo = new FakeAuthRepository(); const c = new AuthSessionController(() => repo); await c.start(); await c.start(); expect(repo.subscribeCount).toBe(1); });
  it("unsubscribes on stop", async () => { const repo = new FakeAuthRepository(); const c = new AuthSessionController(() => repo); await c.start(); c.stop(); expect(repo.unsubscribeCount).toBe(1); });
  it("responds to auth state changes", async () => { const repo = new FakeAuthRepository(); const c = new AuthSessionController(() => repo); const o = observe(c); await c.start(); repo.emit(session); await Promise.resolve(); expect(o.latest().status).toBe("authenticated"); });
  it("expired sign-out returns local", async () => { const repo = new FakeAuthRepository(); repo.session = session; const c = new AuthSessionController(() => repo); const o = observe(c); await c.start(); repo.emit(null, "SIGNED_OUT"); await Promise.resolve(); expect(o.latest().status).toBe("local"); });
  it("signs in", async () => expect((await new AuthService(new FakeAuthRepository()).signIn({ email: "ok@example.test", password: "password" })).ok).toBe(true));
  it("maps invalid credentials", async () => { const result = await new AuthService(new FakeAuthRepository()).signIn({ email: "bad@example.test", password: "password" }); expect(result.ok ? null : result.error.code).toBe("invalid_credentials"); });
  it("validates email", async () => { const result = await new AuthService(new FakeAuthRepository()).signIn({ email: "bad", password: "password" }); expect(result.ok ? null : result.error.code).toBe("invalid_email"); });
  it("validates weak password", async () => { const result = await new AuthService(new FakeAuthRepository()).signIn({ email: "ok@example.test", password: "short" }); expect(result.ok ? null : result.error.code).toBe("weak_password"); });
  it("validates password mismatch", async () => { const result = await new AuthService(new FakeAuthRepository()).signUp({ email: "ok@example.test", password: "password", confirmPassword: "different" }); expect(result.ok ? null : result.error.code).toBe("password_mismatch"); });
  it("signs up with session", async () => { const result = await new AuthService(new FakeAuthRepository()).signUp({ email: "ok@example.test", password: "password", confirmPassword: "password" }); expect(result.ok && result.value.session).toBe(session); });
  it("signs up pending confirmation", async () => { const result = await new AuthService(new FakeAuthRepository()).signUp({ email: "confirm@example.test", password: "password", confirmPassword: "password" }); expect(result.ok && result.value.needsEmailConfirmation).toBe(true); });
  it("resends signup confirmation to trimmed email", async () => { const repo = new FakeAuthRepository(); const result = await new AuthService(repo).resendSignupConfirmation("  brewer@example.test "); expect(result.ok).toBe(true); expect(repo.lastResendEmail).toBe("brewer@example.test"); });
  it("rejects invalid resend email", async () => { const result = await new AuthService(new FakeAuthRepository()).resendSignupConfirmation("bad"); expect(result.ok ? null : result.error.code).toBe("invalid_email"); });
  it("maps resend rate limit", async () => { const repo = new FakeAuthRepository(); repo.resendFailure = { ok: false, error: authError("rate_limited") }; const result = await new AuthService(repo).resendSignupConfirmation("brewer@example.test"); expect(result.ok ? null : result.error.code).toBe("rate_limited"); });
  it("maps resend network failure", async () => { const repo = new FakeAuthRepository(); repo.resendFailure = { ok: false, error: authError("network_error") }; const result = await new AuthService(repo).resendSignupConfirmation("brewer@example.test"); expect(result.ok ? null : result.error.code).toBe("network_error"); });
  it("maps unknown resend failure", async () => { const repo = new FakeAuthRepository(); repo.resendFailure = { ok: false, error: authError("unknown_auth_error") }; const result = await new AuthService(repo).resendSignupConfirmation("brewer@example.test"); expect(result.ok ? null : result.error.code).toBe("confirmation_resend_failed"); });
  it("prevents duplicate resend", async () => { const repo = new FakeAuthRepository(); repo.delayResend = true; const service = new AuthService(repo); const first = service.resendSignupConfirmation("brewer@example.test"); const second = await service.resendSignupConfirmation("brewer@example.test"); expect(second.ok).toBe(false); await first; expect(repo.resendCount).toBe(1); });
  it("prevents duplicate submit", async () => { const repo = new FakeAuthRepository(); repo.delaySignIn = true; const service = new AuthService(repo); const first = service.signIn({ email: "ok@example.test", password: "password" }); const second = await service.signIn({ email: "ok@example.test", password: "password" }); expect(second.ok).toBe(false); await first; });
  it("signs out only through auth repository", async () => { const repo = new FakeAuthRepository(); await new AuthService(repo).signOut(); expect(repo.signOutCount).toBe(1); });
  it("refreshes session", async () => { const repo = new FakeAuthRepository(); repo.session = session; const result = await new AuthService(repo).refreshSession(); expect(result.ok && result.value).toBe(session); });
  it("maps network failures", () => expect(mapSupabaseAuthError({ message: "Failed to fetch" }).code).toBe("network_error"));
  it("maps rate limits", () => expect(mapSupabaseAuthError({ status: 429 }).code).toBe("rate_limited"));
  it("maps email confirmation", () => expect(mapSupabaseAuthError({ message: "Email not confirmed" }).code).toBe("email_not_confirmed"));
  it("accepts safe next route", () => expect(getSafeNextRoute("/journal/one?tab=brew")).toBe("/journal/one?tab=brew"));
  it.each(["https://evil.test", "//evil.test", "\\evil.test", null])("rejects unsafe next route %s", (value) => expect(getSafeNextRoute(value)).toBe("/me"));
  it("keeps local routes public", () => expect(["/discover", "/brew/one", "/journal", "/me", "/auth"].every(isLocalRoute)).toBe(true));
  it("has local Me view model", () => expect(getMeAuthViewModel({ status: "local", user: null, session: null, error: null, notice: null, profileBootstrap: "idle" }).heading).toBe("Local Mode"));
  it("has authenticated Me view model without sync claim", () => expect(getMeAuthViewModel({ status: "authenticated", user, session, error: null, notice: null, profileBootstrap: "ready" }).syncEnabled).toBe(false));
  it("has a 390px-safe layout contract", () => expect(authPageLayoutContract).toEqual(expect.objectContaining({ mobileWidthPx: 390, allowsHorizontalOverflow: false })));
  it("profile bootstrap failure keeps authenticated session", async () => { const repo = new FakeAuthRepository(); repo.session = session; const c = new AuthSessionController(() => repo, async () => ({ ok: false })); const o = observe(c); await c.start(); expect(o.latest()).toEqual(expect.objectContaining({ status: "authenticated", profileBootstrap: "error" })); });
});
