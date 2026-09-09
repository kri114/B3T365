import { db } from "@/db";
import { favorites } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ favorites: [] });
  const rows = await db
    .select()
    .from(favorites)
    .where(eq(favorites.userId, user.id))
    .orderBy(desc(favorites.startsAt))
    .limit(100);
  return Response.json({ favorites: rows });
}

/** Toggle a fixture in the user's follow list. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to follow matches." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const eventId = String(body?.eventId ?? "");
  const league = String(body?.league ?? "");
  if (!eventId || !league)
    return Response.json({ error: "eventId and league are required." }, { status: 400 });

  const [existing] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.userId, user.id), eq(favorites.eventId, eventId)))
    .limit(1);

  if (existing) {
    await db.delete(favorites).where(eq(favorites.id, existing.id));
    return Response.json({ following: false });
  }

  await db.insert(favorites).values({
    userId: user.id,
    eventId,
    league,
    homeTeam: String(body?.homeTeam ?? ""),
    awayTeam: String(body?.awayTeam ?? ""),
    startsAt: body?.startsAt ? new Date(body.startsAt) : new Date(),
  });
  return Response.json({ following: true });
}
