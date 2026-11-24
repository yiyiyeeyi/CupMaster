import "server-only";
import { betterAuth } from "better-auth";
import { Pool } from "pg";

export function buildAuth(database: Pool, secret: string, baseURL: string) {
  return betterAuth({
    database,
    secret,
    baseURL,
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: { enabled: true, requireEmailVerification: false },
  });
}

let services: { auth: ReturnType<typeof buildAuth>; database: Pool } | undefined;

export function getServerServices() {
  if (services) return services;
  const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;
  if (!DATABASE_URL || !BETTER_AUTH_SECRET || !BETTER_AUTH_URL) return undefined;
  const database = new Pool({ connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });
  services = { database, auth: buildAuth(database, BETTER_AUTH_SECRET, BETTER_AUTH_URL) };
  return services;
}
