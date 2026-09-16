import type { Session, User } from "@supabase/supabase-js";

export type AuthModeStatus = "loading" | "local" | "authenticated" | "error";
export type AuthErrorCode = "invalid_email" | "weak_password" | "password_mismatch" | "invalid_credentials" | "email_not_confirmed" | "email_already_registered" | "rate_limited" | "network_error" | "cloud_unavailable" | "session_unavailable" | "profile_bootstrap_failed" | "confirmation_resend_failed" | "unknown_auth_error";
export type AuthError = { code: AuthErrorCode; message: string };
export type AuthResult<T> = { ok: true; value: T } | { ok: false; error: AuthError };
export type AuthCredentials = { email: string; password: string };
export type SignUpCredentials = AuthCredentials & { confirmPassword: string };
export type SignUpOutcome = { user: User | null; session: Session | null; needsEmailConfirmation: boolean };
export type AuthState = { status: AuthModeStatus; user: User | null; session: Session | null; error: AuthError | null; notice: string | null; profileBootstrap: "idle" | "ready" | "error" };
export const initialAuthState: AuthState = { status: "loading", user: null, session: null, error: null, notice: null, profileBootstrap: "idle" };
