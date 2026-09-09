import { db } from "@/db";
import { directMessages, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, gt, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const MAX_LEN = 600;

/**
 * GET /api/dm                  → conversation list with unread counts
 * GET /api/dm?with=<userId>    → the thread with that player (marks it read)
 */
export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });

  const withId = new URL(req.url).searchParams.get("with");

  if (withId) {
    const [peer] = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        nameColor: users.nameColor,
        isAdmin: users.isAdmin,
        winStreak: users.winStreak,
      })
      .from(users)
      .where(eq(users.id, withId))
      .limit(1);
    if (!peer) return Response.json({ error: "Player not found." }, { status: 404 });

    const rows = await db
      .select()
      .from(directMessages)
      .where(
        or(
          and(eq(directMessages.senderId, me.id), eq(directMessages.recipientId, withId)),
          and(eq(directMessages.senderId, withId), eq(directMessages.recipientId, me.id)),
        ),
      )
      .orderBy(directMessages.createdAt)
      .limit(300);

    // Mark everything they sent me as read.
    await db
      .update(directMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(directMessages.senderId, withId),
          eq(directMessages.recipientId, me.id),
          sql`${directMessages.readAt} is null`,
        ),
      );

    return Response.json({
      peer,
      messages: rows.map((m) => ({
        id: m.id,
        body: m.deleted ? null : m.body,
        deleted: m.deleted,
        mine: m.senderId === me.id,
        createdAt: m.createdAt,
      })),
      me: me.id,
    });
  }

  // Conversation list: latest message per counterpart.
  const rows = await db.execute(sql`
    select
      peer.id            as "peerId",
      peer.username      as "username",
      peer.avatar_url    as "avatarUrl",
      peer.name_color    as "nameColor",
      peer.is_admin      as "isAdmin",
      last.body          as "lastBody",
      last.created_at    as "lastAt",
      last.sender_id = ${me.id} as "lastMine",
      coalesce(unread.count, 0)::int as "unread"
    from (
      select distinct on (peer_id) peer_id, body, created_at, sender_id from (
        select case when sender_id = ${me.id} then recipient_id else sender_id end as peer_id,
               body, created_at, sender_id, deleted
        from direct_messages
        where sender_id = ${me.id} or recipient_id = ${me.id}
      ) t
      order by peer_id, created_at desc
    ) last
    join users peer on peer.id = last.peer_id
    left join (
      select sender_id, count(*)::int as count
      from direct_messages
      where recipient_id = ${me.id} and read_at is null and deleted = false
      group by sender_id
    ) unread on unread.sender_id = peer.id
    order by last.created_at desc
    limit 50
  `);

  return Response.json({ conversations: rows.rows });
}

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const to = String(body?.to ?? "");
  const text = String(body?.body ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_LEN);
  if (!to || !text) return Response.json({ error: "Message is empty." }, { status: 400 });
  if (to === me.id) return Response.json({ error: "You can't message yourself." }, { status: 400 });

  const [peer] = await db
    .select({ id: users.id, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, to))
    .limit(1);
  if (!peer) return Response.json({ error: "Player not found." }, { status: 404 });
  if (peer.isBanned) return Response.json({ error: "That account is banned." }, { status: 403 });

  // Flood protection: 10 messages per 15 seconds.
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(directMessages)
    .where(
      and(eq(directMessages.senderId, me.id), gt(directMessages.createdAt, new Date(Date.now() - 15_000))),
    );
  if (Number(recent?.count ?? 0) >= 10)
    return Response.json({ error: "You're sending messages too quickly." }, { status: 429 });

  const [row] = await db
    .insert(directMessages)
    .values({ senderId: me.id, recipientId: to, body: text })
    .returning();

  return Response.json({ message: { id: row.id, body: row.body, mine: true, createdAt: row.createdAt } });
}



export async function DELETE(req: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return Response.json({ error: "id required." }, { status: 400 });
  // Only the sender (or an admin) may retract a message.
  await db
    .update(directMessages)
    .set({ deleted: true })
    .where(
      me.isAdmin
        ? eq(directMessages.id, id)
        : and(eq(directMessages.id, id), eq(directMessages.senderId, me.id)),
    );
  return Response.json({ ok: true });
}


