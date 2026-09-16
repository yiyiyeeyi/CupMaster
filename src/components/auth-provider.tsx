"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AuthCredentials, AuthResult, AuthState, SignUpCredentials, SignUpOutcome } from "@/auth/auth-types";
import { initialAuthState } from "@/auth/auth-types";
import { AuthService } from "@/auth/auth-service";
import { AuthSessionController } from "@/auth/auth-session-controller";
import { SupabaseAuthRepository } from "@/auth/supabase-auth-repository";
import { ProfileBootstrapService } from "@/auth/profile-bootstrap-service";

type AuthContextValue = AuthState & {
  signIn(input: AuthCredentials): Promise<AuthResult<Session>>;
  signUp(input: SignUpCredentials): Promise<AuthResult<SignUpOutcome>>;
  resendSignupConfirmation(email: string): Promise<AuthResult<null>>;
  signOut(): Promise<AuthResult<null>>;
  continueLocally(): void;
  refreshSession(): Promise<AuthResult<Session | null>>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialAuthState);
  const resources = useMemo(() => {
    let repository: SupabaseAuthRepository | null = null;
    let service: AuthService | null = null;
    const getRepository = () => repository ??= new SupabaseAuthRepository();
    const getService = () => service ??= new AuthService(getRepository());
    const controller = new AuthSessionController(getRepository, async () => new ProfileBootstrapService().ensureCurrentUserProfile());
    return { getService, controller };
  }, []);
  useEffect(() => { const unsubscribe = resources.controller.subscribe(setState); void resources.controller.start(); return () => { unsubscribe(); resources.controller.stop(); }; }, [resources]);
  const signIn = useCallback(async (input: AuthCredentials) => { try { const result = await resources.getService().signIn(input); if (result.ok) await resources.controller.setSession(result.value); return result; } catch { resources.controller.setError(); return { ok: false as const, error: { code: "session_unavailable" as const, message: "Cloud authentication is unavailable. Local mode is still available." } }; } }, [resources]);
  const signUp = useCallback(async (input: SignUpCredentials) => { try { const result = await resources.getService().signUp(input); if (result.ok && result.value.session) await resources.controller.setSession(result.value.session); return result; } catch { resources.controller.setError(); return { ok: false as const, error: { code: "session_unavailable" as const, message: "Cloud authentication is unavailable. Local mode is still available." } }; } }, [resources]);
  const resendSignupConfirmation = useCallback(async (email: string) => { try { return await resources.getService().resendSignupConfirmation(email); } catch { return { ok: false as const, error: { code: "confirmation_resend_failed" as const, message: "The confirmation email could not be resent. Try again shortly." } }; } }, [resources]);
  const signOut = useCallback(async () => { try { const result = await resources.getService().signOut(); if (result.ok) resources.controller.continueLocally("Signed out. Local data remains on this device."); return result; } catch { return { ok: false as const, error: { code: "session_unavailable" as const, message: "Cloud authentication is unavailable." } }; } }, [resources]);
  const refreshSession = useCallback(async () => { try { const result = await resources.getService().refreshSession(); if (result.ok) await resources.controller.setSession(result.value); return result; } catch { resources.controller.setError(); return { ok: false as const, error: { code: "session_unavailable" as const, message: "Cloud authentication is unavailable." } }; } }, [resources]);
  return <AuthContext.Provider value={{ ...state, signIn, signUp, resendSignupConfirmation, signOut, continueLocally: () => resources.controller.continueLocally(), refreshSession }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used within AuthProvider"); return value; }
