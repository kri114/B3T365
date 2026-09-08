import { db } from "@/db";
import { chatMessages, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const MAX_LEN = 400;
const RATE_WINDOW_MS = 15_000;
const RATE_MAX = 6; // messages per window

/** GET /api/chat?after=<iso> — newest 80 messages, or everything after a cursor. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to view the chat." }, { status: 401 });

  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const valid = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;

  const base = db
    .select({
      id: chatMessages.id,
      body: chatMessages.body,
      deleted: chatMessages.deleted,
      createdAt: chatMessages.createdAt,
      userId: chatMessages.userId,
      username: users.username,
      isAdmin: users.isAdmin,
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id));

  const rows = valid
    ? await base.where(gt(chatMessages.createdAt, valid)).orderBy(asc(chatMessages.createdAt)).limit(200)
    : (
        await base.orderBy(desc(chatMessages.createdAt)).limit(80)
      ).reverse();

  return Response.json({
    messages: rows.map((m) => ({ ...m, body: m.deleted ? null : m.body })),
    me: user.id,
    isAdmin: user.isAdmin,
    serverTime: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to chat." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = String(body?.body ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_LEN);
  if (!text) return Response.json({ error: "Message is empty." }, { status: 400 });

  // Simple flood protection.
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, user.id), gt(chatMessages.createdAt, since)));
  if (Number(recent?.count ?? 0) >= RATE_MAX)
    return Response.json({ error: "You're sending messages too quickly." }, { status: 429 });

  const [row] = await db
    .insert(chatMessages)
    .values({ userId: user.id, body: text })
    .returning();

  return Response.json({ message: { ...row, username: user.username, isAdmin: user.isAdmin } });
}

/** Admin moderation: soft-delete a message. */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return Response.json({ error: "id required." }, { status: 400 });
  await db.update(chatMessages).set({ deleted: true }).where(eq(chatMessages.id, id));
  return Response.json({ ok: true });
}
