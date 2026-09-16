import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SupabaseEnvironmentError, validateSupabasePublicEnv } from "./env";

describe("Supabase lazy environment contract", () => {
  it("does not initialize a client when the Local MVP imports its modules", async () => { await expect(import("./client")).resolves.toBeDefined(); await expect(import("./server")).resolves.toBeDefined(); });
  it("keeps browser creation behind a lazy factory", async () => expect((await import("./client")).getSupabaseBrowserClient).toBeTypeOf("function"));
  it("accepts the browser-safe publishable key", () => expect(validateSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" })).toEqual({ url: "https://example.supabase.co", publishableKey: "sb_publishable_test" }));
  it("rejects a missing URL", () => expect(() => validateSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" })).toThrow(/SUPABASE_URL/));
  it("rejects an invalid URL with a clear error", () => expect(() => validateSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" })).toThrow(SupabaseEnvironmentError));
  it("fails safely when the publishable key is missing", () => expect(() => validateSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toThrow(/PUBLISHABLE_KEY/));
  it("does not treat the legacy anon key as the required field", () => { const legacyName = ["NEXT_PUBLIC_SUPABASE", "ANON_KEY"].join("_"); expect(() => validateSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", [legacyName]: "legacy-key" })).toThrow(/PUBLISHABLE_KEY/); });
  it("does not accept a service-role variable as its public contract", () => expect(() => validateSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "forbidden" })).toThrow(/PUBLISHABLE_KEY/));
  it("ignores the CLI-only project ref", () => expect(validateSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_PROJECT_REF: "project-ref" })).toEqual({ url: "https://example.supabase.co", publishableKey: "sb_publishable_test" }));
  it("uses static Next.js public environment references", () => { const source = readFileSync(resolve(process.cwd(), "src/lib/supabase/env.ts"), "utf8"); expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL"); expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"); expect(source).not.toContain("= process.env"); expect(source).not.toContain("process.env["); expect(source).not.toContain("Object.entries(process.env)"); });
  it("keeps .env.example empty and secret-free", () => { const content = readFileSync(resolve(process.cwd(), ".env.example"), "utf8"); expect(content).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="); expect(content).not.toMatch(/service.role|sb_secret_/i); expect(content).not.toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\S+/); });
});
