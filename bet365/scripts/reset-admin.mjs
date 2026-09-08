#!/usr/bin/env node
/**
 * Admin account recovery tool.
 *
 *   node scripts/reset-admin.mjs
 *
 * Creates the admin if missing, otherwise force-resets it: promotes to admin,
 * unbans, resets the password and kills all existing sessions. Reads
 * DATABASE_URL / ADMIN_USERNAME / ADMIN_PASSWORD from .env (project defaults:
 * KriAdmin / Krikri1104). Safe to run any number of times.
 */
import { config } from "dotenv";
import pg from "pg";
import { scrypt as _scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

config();

const scrypt = promisify(_scrypt);

const username = process.env.ADMIN_USERNAME?.trim() || "KriAdmin";
const password = process.env.ADMIN_PASSWORD || "Krikri1104";
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("✗ DATABASE_URL is not set (check your .env / environment).");
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({
  connectionString: url,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

try {
  await client.connect();

  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  const hash = `scrypt:${salt}:${derived.toString("hex")}`;

  const { rows } = await client.query(
    "select id, is_admin from users where lower(username) = lower($1) limit 1",
    [username],
  );

  if (rows.length === 0) {
    await client.query(
      "insert into users (username, password_hash, balance_cents, is_admin) values ($1, $2, 0, true)",
      [username, hash],
    );
    console.log(`✓ Admin account "${username}" created.`);
  } else {
    await client.query(
      "update users set is_admin = true, is_banned = false, ban_reason = null, password_hash = $2 where id = $1",
      [rows[0].id, hash],
    );
    await client.query("delete from sessions where user_id = $1", [rows[0].id]);
    console.log(`✓ Admin account "${username}" recovered: password reset, admin enabled, all sessions revoked.`);
  }
  console.log("  You can now sign in with the configured credentials.");
} catch (err) {
  if (String(err?.code) === "42P01" || /relation .* does not exist/.test(String(err))) {
    console.error("✗ The `users` table does not exist yet. Run `npx drizzle-kit push` first.");
  } else {
    console.error("✗ Recovery failed:", err?.message ?? err);
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
