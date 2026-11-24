import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { Pool } from "pg";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const databaseUrl = new URL(connectionString);
const host = databaseUrl.hostname;
if (!host.endsWith(".neon.tech") && !["localhost", "127.0.0.1", "[::1]"].includes(host)) {
  throw new Error("The migration target must be Neon or a local PostgreSQL database.");
}

const path = new URL("../db/migrations/", import.meta.url);
const migrations = (await readdir(path)).filter(name => /^\d{4}_\w+\.sql$/.test(name)).sort();
if (migrations.length === 0) throw new Error("No database migrations found.");

const pool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
try {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    await connection.query("select pg_advisory_xact_lock(hashtext('cupmaster:migrations'))");
    await connection.query(`
      create table if not exists public.cupmaster_schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);
    for (const name of migrations) {
      const sql = (await readFile(new URL(name, path), "utf8")).replaceAll("\r\n", "\n");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await connection.query("select checksum from public.cupmaster_schema_migrations where name = $1", [name]);
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await connection.query(sql);
      await connection.query("insert into public.cupmaster_schema_migrations (name, checksum) values ($1, $2)", [name, checksum]);
      console.log(`Applied ${name}`);
    }
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
} finally {
  await pool.end();
}
