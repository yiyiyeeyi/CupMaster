import type { AppSession, AppUser, AuthEvent, AuthCredentials, AuthResult, SignUpOutcome } from "./auth-types";

export type AuthStateListener = (event: AuthEvent, session: AppSession | null) => void;
export interface AuthRepository {
  getSession(): Promise<AuthResult<AppSession | null>>;
  getUser(): Promise<AuthResult<AppUser | null>>;
  signInWithEmail(credentials: AuthCredentials): Promise<AuthResult<AppSession>>;
  signUpWithEmail(credentials: AuthCredentials & { displayName?: string }): Promise<AuthResult<SignUpOutcome>>;
  resendSignupConfirmation(email: string): Promise<AuthResult<null>>;
  signOut(): Promise<AuthResult<null>>;
  refreshSession(): Promise<AuthResult<AppSession | null>>;
  onAuthStateChange(listener: AuthStateListener): () => void;
}
