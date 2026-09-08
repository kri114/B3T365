import { FEATURED_LEAGUES, LEAGUES } from "@/lib/constants";
import { getScoreboardDate, getScoreboardWindow } from "@/lib/espn";
import { matchToDTO, priceEvent } from "@/lib/match-dto";

export const dynamic = "force-dynamic";

/**
 * GET /api/matches
 *   ?league=eng.1            restrict to one league
 *   ?days=2                  rolling window (default board behaviour)
 *   ?live=1                  in-play only
 *   ?date=YYYY-MM-DD         a single client-local calendar day (results + fixtures)
 *   &offset=-120             Date.getTimezoneOffset() for that client
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const leagueParam = url.searchParams.get("league");
  const liveOnly = url.searchParams.get("live") === "1";
  const days = Math.min(4, Math.max(1, Number(url.searchParams.get("days") ?? 2) || 2));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") ?? "")
    ? url.searchParams.get("date")!
    : null;
  const offset = Math.max(-840, Math.min(840, Number(url.searchParams.get("offset") ?? 0) || 0));

  const slugs =
    leagueParam && LEAGUES.some((l) => l.slug === leagueParam)
      ? [leagueParam]
      : FEATURED_LEAGUES;

  try {
    const perLeague = await Promise.all(
      slugs.map(async (slug) => {
        const events = date
          ? await getScoreboardDate(slug, date, offset)
          : await getScoreboardWindow(slug, liveOnly ? 0 : 1, liveOnly ? 0 : days);
        return await Promise.all(
          events.map(async (event) => matchToDTO(event, await priceEvent(event))),
        );
      }),
    );

    let matches = perLeague.flat();
    if (liveOnly) matches = matches.filter((m) => m.state === "in");

    // Live first, then upcoming chronologically, then finished.
    const rank = (s: string) => (s === "in" ? 0 : s === "pre" ? 1 : 2);
    matches.sort((a, b) => {
      const r = rank(a.state) - rank(b.state);
      return r !== 0 ? r : +new Date(a.startsAt) - +new Date(b.startsAt);
    });

    return Response.json({
      generatedAt: new Date().toISOString(),
      date,
      matches,
      liveCount: matches.filter((m) => m.state === "in").length,
    });
  } catch (err) {
    console.error("matches error", err);
    return Response.json({ matches: [], liveCount: 0, error: "Feed temporarily unavailable." });
  }
}
