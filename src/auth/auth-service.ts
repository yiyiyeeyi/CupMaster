import { z } from "zod";
import type { AuthRepository } from "./auth-repository";
import { authError } from "./auth-errors";
import type { AuthCredentials, AuthResult, SignUpCredentials, SignUpOutcome } from "./auth-types";

const credentialsSchema = z.object({ email: z.string().trim().email(), password: z.string().min(8) });
export class AuthService {
  private busy = false;
  constructor(readonly repository: AuthRepository) {}
  private async once<T>(operation: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> { if (this.busy) return { ok: false, error: authError("unknown_auth_error") }; this.busy = true; try { return await operation(); } finally { this.busy = false; } }
  signIn(input: AuthCredentials) { const parsed = credentialsSchema.safeParse(input); if (!parsed.success) return Promise.resolve({ ok: false as const, error: authError(parsed.error.issues.some((i) => i.path[0] === "email") ? "invalid_email" : "weak_password") }); return this.once(() => this.repository.signInWithEmail(parsed.data)); }
  signUp(input: SignUpCredentials): Promise<AuthResult<SignUpOutcome>> { const parsed = credentialsSchema.safeParse(input); if (!parsed.success) return Promise.resolve({ ok: false, error: authError(parsed.error.issues.some((i) => i.path[0] === "email") ? "invalid_email" : "weak_password") }); if (input.password !== input.confirmPassword) return Promise.resolve({ ok: false, error: authError("password_mismatch") }); return this.once(() => this.repository.signUpWithEmail(parsed.data)); }
  async resendSignupConfirmation(email: string): Promise<AuthResult<null>> { const parsed = z.string().trim().email().safeParse(email); if (!parsed.success) return { ok: false, error: authError("invalid_email") }; const result = await this.once(() => this.repository.resendSignupConfirmation(parsed.data)); if (!result.ok && result.error.code === "unknown_auth_error") return { ok: false, error: authError("confirmation_resend_failed") }; return result; }
  signOut() { return this.once(() => this.repository.signOut()); }
  refreshSession() { return this.once(() => this.repository.refreshSession()); }
}
