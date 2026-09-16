import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve(process.cwd(), "src/components/auth-form.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
describe("auth confirmation UI contract", () => {
  it("uses the independent success copy", () => { expect(component).toContain("Account created"); expect(component).toContain("Check your email"); expect(component).not.toContain("You are not signed in yet"); });
  it("uses polite status and alert semantics", () => { expect(component).toContain('aria-live="polite"'); expect(component).toContain('role="alert"'); });
  it("exposes all confirmation actions", () => { for (const label of ["Back to Sign in", "Resend confirmation email", "Change email", "Continue locally"]) expect(component).toContain(label); });
  it("does not persist or place the confirmation email in a URL", () => { expect(component).not.toContain("localStorage"); expect(component).not.toContain("URLSearchParams"); });
  it("has a 390px-safe confirmation CSS contract", () => { expect(styles).toContain(".confirmation-email"); expect(styles).toContain("overflow-wrap:anywhere"); expect(styles).toContain("grid-template-columns:minmax(0,1fr)"); });
});
