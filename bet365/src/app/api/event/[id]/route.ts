import { getScoreboardWindow } from "@/lib/espn";
import { matchToDTO, priceEventWithFactors } from "@/lib/match-dto";

export const dynamic = "force-dynamic";

/** GET /api/event/{id}?league=eng.1 — single fixture, all markets + pricing factors. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const league = new URL(req.url).searchParams.get("league");
  if (!league) return Response.json({ error: "league is required" }, { status: 400 });

  try {
    const events = await getScoreboardWindow(league, 2, 4);
    const event = events.find((e) => e.id === id) ?? null;
    if (!event) return Response.json({ error: "Fixture not found." }, { status: 404 });
    const { markets, factors } = await priceEventWithFactors(event);
    return Response.json({
      match: matchToDTO(event, markets),
      factors,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("event error", err);
    return Response.json({ error: "Feed temporarily unavailable." }, { status: 502 });
  }
}
