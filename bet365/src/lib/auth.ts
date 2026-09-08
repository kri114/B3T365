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

/**
 * How long an admin session may go without a heartbeat before another device
 * is allowed to claim the lock. Prevents a permanent lockout when the admin
 * closes the browser without signing out.
 */
export const ADMIN_LOCK_IDLE_MS = 10 * 60 * 1000; // 10 minutes

export type AdminLock = { active: true; device: string | null; lastSeenAt: Date } | { active: false };

/** Is the admin account currently held by a live session on another device? */
export async function getAdminLock(userId: string): Promise<AdminLock> {
  const now = new Date();
  const rows = await db
    .select({
      userAgent: sessions.userAgent,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(1);

  const held = rows[0];
  if (!held) return { active: false };
  if (now.getTime() - held.lastSeenAt.getTime() > ADMIN_LOCK_IDLE_MS) {
    return { active: false }; // stale → claimable
  }
  return { active: true, device: held.userAgent, lastSeenAt: held.lastSeenAt };
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
