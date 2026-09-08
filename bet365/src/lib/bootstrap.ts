import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./passwords";

/**
 * Idempotent bootstrap executed once per server start (instrumentation.ts).
 * Creates the administrator account if it does not exist yet.
 *
 * Credentials can be overridden with the ADMIN_USERNAME / ADMIN_PASSWORD
 * environment variables; otherwise the project defaults are used.
 */
export async function ensureAdminAccount(): Promise<void> {
  const username = process.env.ADMIN_USERNAME?.trim() || "KriAdmin";
  const password = process.env.ADMIN_PASSWORD || "Krikri1104";

  const existing = await db
    .select({ id: users.id, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({
      username,
      passwordHash: await hashPassword(password),
      balanceCents: 0,
      isAdmin: true,
    });
    console.log(`[bootstrap] Admin account "${username}" created (€0 balance).`);
    return;
  }

  if (!existing[0].isAdmin) {
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, existing[0].id));
    console.log(`[bootstrap] Account "${username}" promoted to admin.`);
  }
}
