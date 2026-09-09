import { getLeagueRatings, getScoreboardWindow } from "@/lib/espn";
import { matchToDTO } from "@/lib/match-dto";
import { expectedCards, expectedCorners, expectedGoals, priceMatch, teamFactors } from "@/lib/odds";
import { scorerMarkets } from "@/lib/scorers";

export const dynamic = "force-dynamic";

/** GET /api/event/{id}?league=eng.1 — one fixture with the full market board. */
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

    const ratings = await getLeagueRatings(league);
    const markets = priceMatch(event, ratings, [1.5, 2.5, 3.5], { full: true });

    // Goalscorer markets need squad data — fetched only on the detail page.
    const scorers = await scorerMarkets(event, ratings).catch(() => []);
    const groups = [...markets.groups, ...scorers];

    const { lambdaHome, lambdaAway, homeF, awayF } = expectedGoals(event, ratings);
    const corners = expectedCorners(event, ratings);
    const cards = expectedCards(event, ratings);
    const g = ratings.avgGoals || 1.36;
    const side = (f: ReturnType<typeof teamFactors>, r: (typeof ratings.teams)[string] | undefined) => ({
      attack: Math.round(f.attack * 100) / 100,
      defense: Math.round(f.defense * 100) / 100,
      morale: Math.round(f.morale * 100) / 100,
      ppg: f.ppg === null ? null : Math.round(f.ppg * 100) / 100,
      form: f.formString,
      goalsFor: r?.gf ?? null,
      goalsAgainst: r?.ga ?? null,
      played: r?.gp ?? null,
    });

    return Response.json({
      match: { ...matchToDTO(event, markets), markets: { ...markets, groups } },
      factors: {
        home: side(homeF, ratings.teams[event.home.id]),
        away: side(awayF, ratings.teams[event.away.id]),
        venueEdge: 0.572,
        lambdaHome: Math.round(lambdaHome * 100) / 100,
        lambdaAway: Math.round(lambdaAway * 100) / 100,
        leagueBaseline: Math.round(g * 100) / 100,
        expectedCorners: Math.round(corners.total * 10) / 10,
        expectedCards: Math.round(cards.total * 10) / 10,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("event error", err);
    return Response.json({ error: "Feed temporarily unavailable." }, { status: 502 });
  }
}
