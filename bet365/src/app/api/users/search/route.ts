import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, ne, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/users/search?q=nam — find other players to message. */
export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      nameColor: users.nameColor,
      isAdmin: users.isAdmin,
      winStreak: users.winStreak,
      bestStreak: users.bestStreak,
    })
    .from(users)
    .where(
      q
        ? and(
            ne(users.id, me.id),
            eq(users.isBanned, false),
            sql`lower(${users.username}) like ${"%" + q.toLowerCase() + "%"}`,
          )
        : and(ne(users.id, me.id), eq(users.isBanned, false)),
    )
    .orderBy(users.username)
    .limit(30);

  return Response.json({ users: rows });
}
