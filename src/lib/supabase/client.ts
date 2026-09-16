"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { readSupabasePublicEnv } from "./env";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const { url, publishableKey } = readSupabasePublicEnv();
  browserClient = createBrowserClient<Database>(url, publishableKey);
  return browserClient;
}
