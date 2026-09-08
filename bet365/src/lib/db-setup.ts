import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Idempotent schema bootstrap. Mirrors src/db/schema.ts as plain CREATE TABLE
 * IF NOT EXISTS DDL so a fresh database becomes fully usable without ever
 * running `drizzle-kit push`. Safe on every boot; also used by the standalone
 * `scripts/ensure-db.mjs` tool.
 */
export const SCHEMA_DDL = sql`
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

export async function ensureSchema(): Promise<void> {
  await db.execute(SCHEMA_DDL);
}
