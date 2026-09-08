import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

/**
 * SSL selection for hosted deployments:
 * - explicit `sslmode` in the URL wins (pg parses it itself)
 * - localhost and bare internal hostnames (no dots, e.g. Render's "dpg-…-a")
 *   → plain TCP, no TLS
 * - public hostnames (Render external, Neon, Supabase…) → TLS with relaxed
 *   verification (self-signed/internal CAs)
 */
function sslFor(u: string | undefined) {
  if (!u) return undefined;
  if (/[?&]sslmode=/.test(u)) return undefined;
  if (/localhost|127\.0\.0\.1/.test(u)) return undefined;
  const host = u.split("@").pop()?.split("/")[0]?.split(":")[0] ?? "";
  if (host && !host.includes(".")) return undefined;
  return { rejectUnauthorized: false } as const;
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: sslFor(databaseUrl),
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
