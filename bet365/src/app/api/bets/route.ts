import { getSessionUser } from "@/lib/auth";
import { BettingError, getUserBets, placeBet, settleOpenBets, type SlipInput } from "@/lib/betting";
import { parseEuroToCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  // Settlement must be AWAITED: on hosted platforms a fire-and-forget promise
  // is killed the moment the response is sent, which previously meant winning
  // bets were never paid out. A background pass also runs every 30s.
  await settleOpenBets().catch((err) => console.warn("[settle]", err?.message ?? err));

  const bets = await getUserBets(user.id);
  const fresh = await getSessionUser();
  return Response.json({ bets, balanceCents: fresh?.balanceCents ?? user.balanceCents });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to place a bet." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kind: "single" | "multi" = body?.kind === "multi" ? "multi" : "single";
  const stakeCents =
    typeof body?.stakeCents === "number"
      ? Math.round(body.stakeCents)
      : parseEuroToCents(String(body?.stake ?? ""));
  const selections = Array.isArray(body?.selections) ? (body.selections as SlipInput[]) : [];

  if (stakeCents === null)
    return Response.json({ error: "Enter a valid stake in euros." }, { status: 400 });

  const clean = selections.slice(0, 12).map((s) => ({
    eventId: String(s?.eventId ?? ""),
    league: String(s?.league ?? ""),
    market: String(s?.market ?? ""),
    line: s?.line === null || s?.line === undefined ? null : Number(s.line),
    pick: String(s?.pick ?? ""),
  }));

  try {
    const bet = await placeBet(user.id, kind, stakeCents, clean);
    const placed = await getUserBets(user.id);
    const fresh = await getSessionUser();
    return Response.json({ bet, bets: placed, balanceCents: fresh?.balanceCents });
  } catch (err) {
    if (err instanceof BettingError)
      return Response.json({ error: err.message }, { status: 400 });
    console.error("PLACE_BET_ERROR:", err);
    return Response.json({ error: "Could not place the bet. Try again." }, { status: 500 });
  }
}
