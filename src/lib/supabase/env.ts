import { z } from "zod";

const publicSupabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required."),
});

export class SupabaseEnvironmentError extends Error {
  constructor(message: string) { super(message); this.name = "SupabaseEnvironmentError"; }
}

export function validateSupabasePublicEnv(source: Record<string, string | undefined>) {
  const parsed = publicSupabaseEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new SupabaseEnvironmentError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "Supabase environment"}: ${issue.message}`).join(" "));
  }
  return { url: parsed.data.NEXT_PUBLIC_SUPABASE_URL, publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}

export function readSupabasePublicEnv() {
  return validateSupabasePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
