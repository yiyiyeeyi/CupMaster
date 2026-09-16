import type { AuthError, AuthErrorCode } from "./auth-types";

export type ResendStatus = "idle" | "submitting" | "sent" | "error";
export type AuthFormState =
  | { type: "sign_in"; email: string; password: string; error: string | null }
  | { type: "sign_up"; email: string; password: string; confirmPassword: string; error: string | null }
  | { type: "confirmation_sent"; email: string; resendStatus: ResendStatus; resendErrorCode?: AuthErrorCode; resendMessage: string | null };

export const initialAuthFormState: AuthFormState = { type: "sign_in", email: "", password: "", error: null };
export function toSignIn(state: AuthFormState): AuthFormState { return { type: "sign_in", email: state.email, password: "", error: null }; }
export function toSignUp(state: AuthFormState): AuthFormState { return { type: "sign_up", email: state.email, password: "", confirmPassword: "", error: null }; }
export function toConfirmationSent(email: string): Extract<AuthFormState, { type: "confirmation_sent" }> { return { type: "confirmation_sent", email: email.trim(), resendStatus: "idle", resendMessage: null }; }
export function toResendSubmitting(state: Extract<AuthFormState, { type: "confirmation_sent" }>): Extract<AuthFormState, { type: "confirmation_sent" }> { return { ...state, resendStatus: "submitting", resendErrorCode: undefined, resendMessage: null }; }
export function toResendSent(state: Extract<AuthFormState, { type: "confirmation_sent" }>): Extract<AuthFormState, { type: "confirmation_sent" }> { return { ...state, resendStatus: "sent", resendErrorCode: undefined, resendMessage: "Confirmation email sent again." }; }
export function toResendError(state: Extract<AuthFormState, { type: "confirmation_sent" }>, code: AuthErrorCode, message: string): Extract<AuthFormState, { type: "confirmation_sent" }> { return { ...state, resendStatus: "error", resendErrorCode: code, resendMessage: message }; }
export function getResendErrorMessage(error: AuthError) { if (error.code === "rate_limited") return "Please wait a moment before requesting another email."; if (error.code === "network_error") return "We couldn’t resend the email. Check your connection and try again."; if (error.code === "invalid_email") return error.message; return "The confirmation email could not be resent. Try again shortly."; }
