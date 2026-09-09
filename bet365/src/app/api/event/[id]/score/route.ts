import { getLeagueRatings, getScoreboardWindow } from "@/lib/espn";
import { priceCorrectScore } from "@/lib/odds";

export const dynamic = "force-dynamic";

/** GET /api/event/{id}/score?league=eng.1&h=3&a=1 — price any typed scoreline. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const league = url.searchParams.get("league");
  const h = Number(url.searchParams.get("h"));
  const a = Number(url.searchParams.get("a"));

  if (!league) return Response.json({ error: "league is required" }, { status: 400 });
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 12 || a > 12)
    return Response.json({ error: "Enter a scoreline between 0 and 12." }, { status: 400 });

  try {
    const events = await getScoreboardWindow(league, 2, 4);
    const event = events.find((e) => e.id === id);
    if (!event) return Response.json({ error: "Fixture not found." }, { status: 404 });
    if (event.state !== "pre")
      return Response.json({ error: "Correct score is closed for this match." }, { status: 409 });

    const ratings = await getLeagueRatings(league);
    const odds = priceCorrectScore(event, ratings, h, a);
    if (odds === null) return Response.json({ error: "Could not price that score." }, { status: 400 });

    return Response.json({ pick: `${h}-${a}`, label: `Correct score ${h}-${a}`, odds });
  } catch {
    return Response.json({ error: "Feed temporarily unavailable." }, { status: 502 });
  }
}
