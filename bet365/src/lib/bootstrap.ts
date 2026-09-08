import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./passwords";

/**
 * Idempotent, self-healing admin bootstrap — runs on every server start.
 *
 *   1. Admin missing            → create it.
 *   2. Username taken by a      → someone signed up as "KriAdmin" before the
 *      non-admin account           seed landed (e.g. first deploy before
 *                                  migrations): promote it to admin and reset
 *                                  its password to the configured one.
 *   3. Env override present     → ADMIN_USERNAME/ADMIN_PASSWORD are treated as
 *                                  the source of truth: hash is re-synced and
 *                                  old sessions revoked (password reset path).
 *
 * Credentials default to the project values when the env vars are unset.
 */
export async function ensureAdminAccount(): Promise<void> {
  const username = process.env.ADMIN_USERNAME?.trim() || "KriAdmin";
  const password = process.env.ADMIN_PASSWORD || "Krikri1104";
  const envOverride = Boolean(
    process.env.ADMIN_USERNAME?.trim() || process.env.ADMIN_PASSWORD,
  );

  const [existing] = await db
    .select({ id: users.id, isAdmin: users.isAdmin })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  if (!existing) {
    await db.insert(users).values({
      username,
      passwordHash: await hashPassword(password),
      balanceCents: 0,
      isAdmin: true,
    });
    console.log(`[bootstrap] Admin account "${username}" created (€0 balance).`);
    return;
  }

  if (!existing.isAdmin) {
    await db
      .update(users)
      .set({
        isAdmin: true,
        isBanned: false,
        banReason: null,
        passwordHash: await hashPassword(password),
      })
      .where(eq(users.id, existing.id));
    await db.delete(sessions).where(eq(sessions.userId, existing.id));
    console.log(
      `[bootstrap] Recovered admin account: "${username}" promoted and credentials reset.`,
    );
    return;
  }

  if (envOverride) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), isBanned: false, banReason: null })
      .where(eq(users.id, existing.id));
    await db.delete(sessions).where(eq(sessions.userId, existing.id));
    console.log(`[bootstrap] Admin credentials for "${username}" synced from environment.`);
  }
}
