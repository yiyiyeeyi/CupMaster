"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSafeNextRoute } from "@/auth/safe-next-route";
import { getResendErrorMessage, initialAuthFormState, toConfirmationSent, toResendError, toResendSent, toResendSubmitting, toSignIn, toSignUp, type AuthFormState } from "@/auth/auth-form-state";
import { useAuth } from "./auth-provider";

export function AuthForm() {
  const auth = useAuth(); const router = useRouter(); const params = useSearchParams();
  const [state, setState] = useState<AuthFormState>(initialAuthFormState); const [submitting, setSubmitting] = useState(false);
  const confirmationHeading = useRef<HTMLHeadingElement>(null); const emailInput = useRef<HTMLInputElement>(null); const resendInFlight = useRef(false);
  useEffect(() => { if (state.type === "confirmation_sent") confirmationHeading.current?.focus(); }, [state.type]);
  function updateEmail(email: string) { setState((current) => current.type === "confirmation_sent" ? current : { ...current, email }); }
  function updatePassword(password: string) { setState((current) => current.type === "sign_in" || current.type === "sign_up" ? { ...current, password } : current); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting || state.type === "confirmation_sent") return; setSubmitting(true);
    const submitted = state.type === "sign_in" ? await auth.signIn({ email: state.email.trim(), password: state.password }) : await auth.signUp({ email: state.email.trim(), password: state.password, confirmPassword: state.confirmPassword });
    setSubmitting(false);
    if (!submitted.ok) { setState((current) => current.type === "confirmation_sent" ? current : { ...current, error: submitted.error.message }); return; }
    if (state.type === "sign_up" && "needsEmailConfirmation" in submitted.value && submitted.value.needsEmailConfirmation) { setState(toConfirmationSent(state.email)); return; }
    router.replace(getSafeNextRoute(params.get("next")));
  }
  async function resend() {
    if (state.type !== "confirmation_sent" || resendInFlight.current) return; resendInFlight.current = true; const pending = toResendSubmitting(state); setState(pending);
    const result = await auth.resendSignupConfirmation(state.email); resendInFlight.current = false;
    setState(result.ok ? toResendSent(pending) : toResendError(pending, result.error.code, getResendErrorMessage(result.error)));
  }
  function switchToSignIn() { setState((current) => toSignIn(current)); window.setTimeout(() => emailInput.current?.focus(), 0); }
  function switchToSignUp() { setState((current) => toSignUp(current)); window.setTimeout(() => emailInput.current?.focus(), 0); }
  if (state.type === "confirmation_sent") return <main className="auth-page confirmation-page"><Link className="wordmark" href="/">CupMaster</Link><section className="confirmation-card" aria-live="polite" role="status"><span aria-hidden="true" className="confirmation-mark">✓</span><p className="eyebrow">Account created</p><h1 ref={confirmationHeading} tabIndex={-1}>Check your email</h1><p>We sent a confirmation link to:</p><strong className="confirmation-email">{state.email}</strong><p className="lead">Open the email and click the confirmation link. After confirming your account, return here and sign in.</p>{state.resendMessage && <p className={state.resendStatus === "error" ? "field-error" : "notice"} role={state.resendStatus === "error" ? "alert" : "status"}>{state.resendMessage}</p>}<div className="confirmation-actions"><button className="primary-button" onClick={switchToSignIn} type="button">Back to Sign in</button><button className="secondary-button" disabled={state.resendStatus === "submitting"} onClick={() => void resend()} type="button">{state.resendStatus === "submitting" ? "Resending…" : "Resend confirmation email"}</button><button className="text-button" onClick={switchToSignUp} type="button">Change email</button><button className="text-button" onClick={() => { auth.continueLocally(); router.replace("/"); }} type="button">Continue locally</button></div></section><p className="auth-boundary">Cloud sync is not enabled yet. Local mode remains fully available.</p></main>;
  const isSignIn = state.type === "sign_in";
  return <main className="auth-page"><header><Link className="wordmark" href="/">CupMaster</Link><p className="eyebrow">Optional cloud account</p><h1>{isSignIn ? "Welcome back." : "Create your account."}</h1><p className="lead">Sign in prepares future cloud features. Your current local brews and profile are not uploaded automatically.</p></header>{auth.status === "error" && <div className="notice" role="status"><strong>Cloud authentication unavailable.</strong><p>{auth.error?.message} You can continue locally.</p></div>}<div className="auth-mode" role="group" aria-label="Authentication mode"><button aria-pressed={isSignIn} onClick={switchToSignIn} type="button">Sign in</button><button aria-pressed={!isSignIn} onClick={switchToSignUp} type="button">Sign up</button></div><form className="auth-form" onSubmit={submit}><label>Email<input autoComplete="email" onChange={(event) => updateEmail(event.target.value)} ref={emailInput} required type="email" value={state.email} /></label><label>Password<input autoComplete={isSignIn ? "current-password" : "new-password"} minLength={8} onChange={(event) => updatePassword(event.target.value)} required type="password" value={state.password} /></label>{state.type === "sign_up" && <label>Confirm password<input autoComplete="new-password" minLength={8} onChange={(event) => setState((current) => current.type === "sign_up" ? { ...current, confirmPassword: event.target.value } : current)} required type="password" value={state.confirmPassword} /></label>}{state.error && <p className="field-error" role="alert">{state.error}</p>}<button className="primary-button" disabled={submitting || auth.status === "loading" || auth.status === "error"} type="submit">{submitting ? "Working…" : isSignIn ? "Sign in" : "Create account"}</button></form><button className="secondary-button local-mode-button" onClick={() => { auth.continueLocally(); router.replace("/"); }} type="button">Continue without account</button><p className="auth-boundary">Local mode remains fully available. Cloud sync is not enabled yet.</p></main>;
}
