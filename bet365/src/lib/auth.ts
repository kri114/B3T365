import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
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
 * Single-device rule for the admin account: when an admin signs in on a new
 * device, every other admin session is destroyed first — only one browser can
 * ever hold the admin session at a time.
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
  return user;
}

export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.isAdmin ? user : null;
}
