import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

/**
 * Notes for hosted deployments (Render/Vercel/etc.):
 * - `DATABASE_URL` may be absent at *build* time — pg tolerates an undefined
 *   connection string at construction and only fails if a query is actually
 *   executed, so `next build` never blows up on imports anymore.
 * - Managed Postgres providers (Render, Neon, Supabase…) require SSL on
 *   external connections; local Docker Postgres does not. We enable SSL for
 *   any non-localhost host (rejectUnauthorized off, as these providers use
 *   self-signed/internal CAs).
 */
const isLocal = !databaseUrl || /localhost|127\.0\.0\.1/.test(databaseUrl);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
