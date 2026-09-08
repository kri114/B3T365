#!/usr/bin/env node
/**
 * Boot-time schema setup for hosted deploys (Render free tier has no Shell).
 *
 *   node scripts/ensure-db.mjs
 *
 * Applies the database schema with plain idempotent DDL (CREATE TABLE IF NOT
 * EXISTS) — safe on every boot, zero interactive prompts, no TTY required.
 * Mirrors src/db/schema.ts; if you change the schema, re-run
 * `npx drizzle-kit push` locally or update the DDL below.
 *
 * Prints masked diagnostics so Render logs show exactly what failed, if
 * anything does.
 */
import { config } from "dotenv";
import pg from "pg";

config({ quiet: true });

const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    "[db] ✗ DATABASE_URL is not set on this service.\n" +
      "     Render → your web service → Environment → add DATABASE_URL\n" +
      "     (Render Postgres dashboard → Internal Connection String, same region).",
  );
  process.exit(1);
}

/** Decide SSL from the URL shape: localhost & bare internal hostnames → off. */
function sslFor(u) {
  if (/[?&]sslmode=/.test(u)) return undefined; // caller controls it via the URL
  if (/localhost|127\.0\.0\.1/.test(u)) return undefined;
  const host = u.split("@").pop()?.split("/")[0]?.split(":")[0] ?? "";
  // Bare hostnames (no dots) are internal hosts, e.g. Render's "dpg-…-a".
  if (host && !host.includes(".")) return undefined;
  return { rejectUnauthorized: false };
}

const ssl = sslFor(url);
const hostForLog = (() => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || 5432}/${parsed.pathname.slice(1)}`;
  } catch {
    return "(unparseable URL)";
  }
})();

console.log(`[db] node ${process.version} · target ${hostForLog} · ssl ${ssl ? "on" : "off"}`);

const DDL = `
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  balance_cents integer not null default 0,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  tone text not null default 'info',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null default 'single',
  stake_cents integer not null,
  total_odds real not null,
  potential_cents integer not null,
  status text not null default 'open',
  note text,
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists bet_selections (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bets(id) on delete cascade,
  event_id text not null,
  league text not null,
  home_team text not null,
  away_team text not null,
  starts_at timestamptz not null,
  market text not null,
  line real,
  pick text not null,
  label text not null,
  odds real not null,
  status text not null default 'open'
);

create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  admin_id uuid,
  delta_cents integer not null,
  balance_after integer not null,
  kind text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists users_username_lower_idx on users (username);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists bets_user_status_idx on bets (user_id, status);
create index if not exists selections_bet_idx on bet_selections (bet_id);
create index if not exists selections_event_idx on bet_selections (event_id, league);
create index if not exists tx_user_idx on wallet_transactions (user_id);
`;

const client = new pg.Client({ connectionString: url, ssl });

try {
  await client.connect();
  console.log("[db] connected");
  await client.query(DDL);
  console.log("[db] schema verified — 6 tables ready");
  await client.end();
  process.exit(0);
} catch (err) {
  const code = err?.code ? ` (${err.code})` : "";
  console.error(`[db] ✗ setup failed${code}: ${err?.message ?? err}`);
  if (err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT") {
    console.error(
      "[db]   → Cannot reach the database. Use the INTERNAL connection string from a\n" +
        "       Render Postgres in the SAME region as the web service.",
    );
  } else if (/authentication|password/i.test(String(err?.message))) {
    console.error("[db]   → Credentials rejected — re-copy the connection string (it contains user+password).");
  } else if (/ssl|tls|handshake/i.test(String(err?.message))) {
    console.error("[db]   → TLS issue — append ?sslmode=require to DATABASE_URL, or use the internal URL.");
  }
  process.exit(1);
}
