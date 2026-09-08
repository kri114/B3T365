import { getMatchDetail, getScoreboardWindow } from "@/lib/espn";

export const dynamic = "force-dynamic";

/** GET /api/event/{id}/detail?league=… — lineups, live team stats, key events. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const league = new URL(req.url).searchParams.get("league");
  if (!league) return Response.json({ error: "league is required" }, { status: 400 });

  try {
    const events = await getScoreboardWindow(league, 2, 4);
    const event = events.find((e) => e.id === id);
    const live = event?.state === "in";
    const detail = await getMatchDetail(league, id, Boolean(live));
    if (!detail) return Response.json({ error: "No detail available yet." }, { status: 404 });

    return Response.json({
      ...detail,
      state: event?.state ?? "pre",
      kickoff: event?.startsAt ?? null,
      homeTeamId: event?.home.id ?? null,
      awayTeamId: event?.away.id ?? null,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return Response.json({ error: "Feed temporarily unavailable." }, { status: 502 });
  }
}
