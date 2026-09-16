import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { readSupabasePublicEnv } from "./env";

export async function createSupabaseServerClient() {
  const { url, publishableKey } = readSupabasePublicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. A future Auth proxy will refresh sessions.
        }
      },
    },
  });
}
