import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { AuthCredentials, AuthResult, SignUpOutcome } from "./auth-types";

export type AuthStateListener = (event: AuthChangeEvent, session: Session | null) => void;
export interface AuthRepository {
  getSession(): Promise<AuthResult<Session | null>>;
  getUser(): Promise<AuthResult<User | null>>;
  signInWithEmail(credentials: AuthCredentials): Promise<AuthResult<Session>>;
  signUpWithEmail(credentials: AuthCredentials): Promise<AuthResult<SignUpOutcome>>;
  resendSignupConfirmation(email: string): Promise<AuthResult<null>>;
  signOut(): Promise<AuthResult<null>>;
  refreshSession(): Promise<AuthResult<Session | null>>;
  onAuthStateChange(listener: AuthStateListener): () => void;
}
