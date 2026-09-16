import { describe, expect, it } from "vitest";
import { initialAuthFormState, toConfirmationSent, toResendError, toResendSent, toResendSubmitting, toSignIn, toSignUp } from "./auth-form-state";

describe("auth confirmation form state", () => {
  it("starts in sign in", () => expect(initialAuthFormState.type).toBe("sign_in"));
  it("confirmation preserves the submitted email", () => expect(toConfirmationSent(" brewer@example.test ").email).toBe("brewer@example.test"));
  it("confirmation stores no password", () => expect(toConfirmationSent("brewer@example.test")).not.toHaveProperty("password"));
  it("confirmation stores no confirm password", () => expect(toConfirmationSent("brewer@example.test")).not.toHaveProperty("confirmPassword"));
  it("back to sign in prefills email and clears password", () => expect(toSignIn(toConfirmationSent("brewer@example.test"))).toEqual({ type: "sign_in", email: "brewer@example.test", password: "", error: null }));
  it("change email returns to editable sign up", () => expect(toSignUp(toConfirmationSent("brewer@example.test"))).toEqual({ type: "sign_up", email: "brewer@example.test", password: "", confirmPassword: "", error: null }));
  it("resend enters submitting without changing mode", () => expect(toResendSubmitting(toConfirmationSent("brewer@example.test"))).toEqual(expect.objectContaining({ type: "confirmation_sent", resendStatus: "submitting", email: "brewer@example.test" })));
  it("resend success remains in confirmation state", () => expect(toResendSent(toConfirmationSent("brewer@example.test"))).toEqual(expect.objectContaining({ type: "confirmation_sent", resendStatus: "sent", resendMessage: "Confirmation email sent again." })));
  it("resend error remains in confirmation state", () => expect(toResendError(toConfirmationSent("brewer@example.test"), "rate_limited", "wait")).toEqual(expect.objectContaining({ type: "confirmation_sent", resendStatus: "error", resendErrorCode: "rate_limited" })));
  it("confirmation state is transient data without persistence fields", () => expect(Object.keys(toConfirmationSent("brewer@example.test"))).toEqual(["type", "email", "resendStatus", "resendMessage"]));
});
