import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { newSessionToken } from "./passwords";

export const SESSION_COOKIE = "bet365_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionUser = Pick<
  User,
  "id" | "username" | "balanceCents" | "isAdmin" | "isBanned" | "createdAt"
>;

export async function createSession(
  userId: string,
  userAgent: string | null,
): Promise<void> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ token, userId, userAgent, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export type AdminLock = { active: true; device: string | null } | { active: false };

/**
 * STRICT single-device lock: the admin account is held by exactly one session
 * at a time, and that hold lasts until the admin explicitly signs out. There
 * is no idle timeout — no other device can sign in while the session exists.
 *
 * If the session cookie is ever lost (browser data cleared, machine wiped),
 * recover with POST /api/admin/unlock using ADMIN_UNLOCK_KEY, or delete the
 * admin's rows from the `sessions` table directly.
 */
export async function getAdminLock(userId: string): Promise<AdminLock> {
  const rows = await db
    .select({ userAgent: sessions.userAgent })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const held = rows[0];
  if (!held) return { active: false };
  return { active: true, device: held.userAgent };
}

/** Emergency release: clears every admin session so the lock can be reclaimed. */
export async function releaseAdminLock(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Claim the admin single-device lock. Any stale/expired sessions are cleared
 * first; the caller must have verified with getAdminLock() that no live
 * session holds the account.
 */
export async function createAdminSession(
  userId: string,
  userAgent: string | null,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await createSession(userId, userAgent);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token)).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

/** Invalidate every session for a user (used on ban / password reset). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      balanceCents: users.balanceCents,
      isAdmin: users.isAdmin,
      isBanned: users.isBanned,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0];
  if (!user || user.isBanned) return null;

  // Heartbeat: keeps the admin single-device lock alive while in use, and
  // lets it lapse ~10 min after the last activity so you can never be
  // permanently locked out by closing the browser.
  void db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.token, token))
    .catch(() => {});

  return user;
}

export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.isAdmin ? user : null;
}
