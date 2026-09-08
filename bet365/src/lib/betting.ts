import { db } from "@/db";
import {
  bets,
  betSelections,
  users,
  walletTransactions,
  type Bet,
  type BetSelection,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { fetchJson, getLeagueRatings, getScoreboardWindow, parseEvents, type EspnEvent } from "./espn";
import { priceMatch, quoteFor, gradeSelection, pickLabel } from "./odds";
import { MAX_STAKE_CENTS, MIN_STAKE_CENTS } from "./money";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export type SlipInput = {
  eventId: string;
  league: string;
  market: string;
  line: number | null;
  pick: string;
};

export class BettingError extends Error {}

async function findEvent(league: string, eventId: string): Promise<EspnEvent | null> {
  const window = await getScoreboardWindow(league, 3, 4);
  const found = window.find((e) => e.id === eventId);
  if (found) return found;
  // Fallback: the summary endpoint covers events outside the day window.
  try {
    const data = (await fetchJson(
      `/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`,
    )) as { header?: { competitions?: unknown[] } };
    const comp = (data?.header?.competitions as never[])?.[0];
    const events = parseEvents(league, {
      events: [{ id: eventId, competitions: comp ? [comp] : [] }],
    });
    return events[0] ?? null;
  } catch {
    return null;
  }
}

/** Current server-verified quote for a selection, plus the event itself. */
export async function priceSelection(input: SlipInput) {
  const event = await findEvent(input.league, input.eventId);
  if (!event) throw new BettingError("Fixture not found — it may have expired from the feed.");
  if (event.state === "post" || event.completed)
    throw new BettingError("This fixture has already finished.");
  if (event.statusName === "STATUS_POSTPONED" || event.statusName === "STATUS_CANCELED")
    throw new BettingError("This fixture is no longer taking place.");
  const ratings = await getLeagueRatings(input.league);
  const markets = priceMatch(event, ratings, [1.5, 2.5, 3.5]);
  const odds = quoteFor(markets, input.market, input.line, input.pick);
  if (odds === null)
    throw new BettingError("That market is currently suspended (already decided or match over).");
  return { event, odds };
}

/* ------------------------------------------------------------------ */
/* Bet placement                                                       */
/* ------------------------------------------------------------------ */

export async function placeBet(
  userId: string,
  kind: "single" | "multi",
  stakeCents: number,
  selections: SlipInput[],
): Promise<Bet> {
  if (!Number.isInteger(stakeCents) || stakeCents < MIN_STAKE_CENTS)
    throw new BettingError(`Minimum stake is €${(MIN_STAKE_CENTS / 100).toFixed(2)}.`);
  if (stakeCents > MAX_STAKE_CENTS) throw new BettingError("Stake exceeds the maximum allowed.");
  if (selections.length === 0) throw new BettingError("Your bet slip is empty.");
  if (selections.length > 12) throw new BettingError("A maximum of 12 legs is allowed.");
  if (kind === "single" && selections.length !== 1)
    throw new BettingError("A single bet contains exactly one selection.");

  const eventIds = new Set(selections.map((s) => s.eventId));
  if (eventIds.size !== selections.length)
    throw new BettingError("Only one selection per fixture is allowed in a multi.");

  // Server-side pricing — client quotes are never trusted.
  const priced = await Promise.all(selections.map((s) => priceSelection(s)));
  const totalOdds =
    Math.round(priced.reduce((acc, p) => acc * p.odds, 1) * 100) / 100;
  if (totalOdds > 5000) throw new BettingError("Combined odds exceed the 5000.00 house limit.");
  const potentialCents = Math.round((stakeCents * totalOdds * 100) / 100);

  return await db.transaction(async (tx) => {
    // Atomic balance deduction — fails if insufficient funds.
    const debit = await tx.execute(
      sql`UPDATE users SET balance_cents = balance_cents - ${stakeCents}
          WHERE id = ${userId} AND balance_cents >= ${stakeCents} AND is_banned = false
          RETURNING balance_cents AS "balanceAfter"`,
    );
    const row = (debit.rows as { balanceAfter: number }[])[0];
    if (!row) throw new BettingError("Insufficient balance.");

    const [bet] = await tx
      .insert(bets)
      .values({
        userId,
        kind,
        stakeCents,
        totalOdds,
        potentialCents: Math.round(stakeCents * totalOdds),
        status: "open",
      })
      .returning();

    await tx.insert(betSelections).values(
      selections.map((s, i) => {
        const { event, odds } = priced[i];
        return {
          betId: bet.id,
          eventId: event.id,
          league: event.league,
          homeTeam: event.home.name,
          awayTeam: event.away.name,
          startsAt: new Date(event.startsAt),
          market: s.market,
          line: s.line,
          pick: s.pick,
          label: pickLabel(s.market, s.line, s.pick, event.home.name, event.away.name),
          odds,
          status: "open",
        };
      }),
    );

    await tx.insert(walletTransactions).values({
      userId,
      deltaCents: -stakeCents,
      balanceAfter: row.balanceAfter,
      kind: "bet_stake",
      note: `${kind === "multi" ? "Multi" : "Single"} bet ${bet.id.slice(0, 8)} @ ${totalOdds.toFixed(2)}`,
    });

    return bet;
  });
}

/* ------------------------------------------------------------------ */
/* Settlement                                                          */
/* ------------------------------------------------------------------ */

type EventResult =
  | { kind: "finished"; home: number; away: number }
  | { kind: "void" }
  | { kind: "pending" };

async function fetchEventResult(league: string, eventId: string): Promise<EventResult> {
  try {
    const data = (await fetchJson(
      `/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    )) as any;
    const comp = data?.header?.competitions?.[0];
    const status = comp?.status ?? data?.header?.status;
    const name: string = status?.type?.name ?? "";
    if (
      name === "STATUS_POSTPONED" ||
      name === "STATUS_CANCELED" ||
      name === "STATUS_SUSPENDED"
    )
      return { kind: "void" };
    const completed = Boolean(status?.type?.completed) || status?.type?.state === "post";
    if (!completed) return { kind: "pending" };
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c: { homeAway: string }) => c.homeAway === "home");
    const away = competitors.find((c: { homeAway: string }) => c.homeAway === "away");
    if (!home || !away) return { kind: "pending" };
    return { kind: "finished", home: Number(home.score ?? 0), away: Number(away.score ?? 0) };
  } catch {
    return { kind: "pending" };
  }
}

/**
 * Settle all open bets whose fixtures have ended. Idempotent and safe to call
 * on any read path.
 */
export async function settleOpenBets(): Promise<number> {
  const open = await db
    .select()
    .from(betSelections)
    .innerJoin(bets, eq(betSelections.betId, bets.id))
    .where(and(eq(betSelections.status, "open"), eq(bets.status, "open")))
    .limit(400);
  if (open.length === 0) return 0;

  // Only bother hitting ESPN for fixtures that should have started.
  const due = open.filter(
    (r) => +new Date(r.bet_selections.startsAt) < Date.now() - 5 * 60_000,
  );
  if (due.length === 0) return 0;

  const byEvent = new Map<string, { league: string; rows: BetSelection[] }>();
  for (const r of due) {
    const sel = r.bet_selections;
    const key = `${sel.league}:${sel.eventId}`;
    if (!byEvent.has(key)) byEvent.set(key, { league: sel.league, rows: [] });
    byEvent.get(key)!.rows.push(sel);
  }

  const results = new Map<string, EventResult>();
  await Promise.all(
    [...byEvent.keys()].map(async (key) => {
      const { league } = byEvent.get(key)!;
      const eventId = key.split(":").slice(1).join(":");
      results.set(key, await fetchEventResult(league, eventId));
    }),
  );

  const touchedBets = new Set<string>();

  for (const [key, { rows }] of byEvent) {
    const result = results.get(key);
    if (!result || result.kind === "pending") continue;
    for (const sel of rows) {
      const status =
        result.kind === "void"
          ? "void"
          : gradeSelection(sel.market, sel.line, sel.pick, result.home, result.away);
      await db
        .update(betSelections)
        .set({ status })
        .where(and(eq(betSelections.id, sel.id), eq(betSelections.status, "open")));
      touchedBets.add(sel.betId);
    }
  }

  for (const betId of touchedBets) await finalizeBet(betId);
  return touchedBets.size;
}

/** If every leg of a bet is graded, grade the bet itself and pay out. */
async function finalizeBet(betId: string): Promise<void> {
  const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
  if (!bet || bet.status !== "open") return;
  const legs = await db
    .select()
    .from(betSelections)
    .where(eq(betSelections.betId, betId));
  if (legs.some((l) => l.status === "open")) return;

  const anyLost = legs.some((l) => l.status === "lost");
  const winningLegs = legs.filter((l) => l.status === "won");

  if (anyLost) {
    await db
      .update(bets)
      .set({ status: "lost", settledAt: new Date() })
      .where(eq(bets.id, betId));
    return;
  }

  if (winningLegs.length === 0) {
    // Every leg void → full refund.
    await creditUser(bet.userId, bet.stakeCents, "bet_refund", `Void bet refund ${betId.slice(0, 8)}`);
    await db
      .update(bets)
      .set({ status: "void", settledAt: new Date(), potentialCents: bet.stakeCents })
      .where(eq(bets.id, betId));
    return;
  }

  // Voids are removed from the accumulator — payout at reduced odds.
  const effectiveOdds = winningLegs.reduce((acc, l) => acc * l.odds, 1);
  const payout = Math.round(bet.stakeCents * effectiveOdds);
  await creditUser(
    bet.userId,
    payout,
    "bet_payout",
    `Bet ${betId.slice(0, 8)} settled — payout @ ${effectiveOdds.toFixed(2)}`,
  );
  await db
    .update(bets)
    .set({ status: "won", settledAt: new Date(), potentialCents: payout })
    .where(eq(bets.id, betId));
}

/* ------------------------------------------------------------------ */
/* Wallet movements                                                    */
/* ------------------------------------------------------------------ */

export async function creditUser(
  userId: string,
  amountCents: number,
  kind: string,
  note: string | null,
  adminId: string | null = null,
): Promise<number> {
  const res = await db.execute(
    sql`UPDATE users SET balance_cents = balance_cents + ${amountCents}
        WHERE id = ${userId} RETURNING balance_cents AS "balanceAfter"`,
  );
  const row = (res.rows as { balanceAfter: number }[])[0];
  if (!row) throw new BettingError("User not found.");
  await db.insert(walletTransactions).values({
    userId,
    adminId,
    deltaCents: amountCents,
    balanceAfter: row.balanceAfter,
    kind,
    note,
  });
  return row.balanceAfter;
}

export async function debitUser(
  userId: string,
  amountCents: number,
  kind: string,
  note: string | null,
  adminId: string | null = null,
): Promise<number> {
  const res = await db.execute(
    sql`UPDATE users SET balance_cents = balance_cents - ${amountCents}
        WHERE id = ${userId} AND balance_cents >= ${amountCents}
        RETURNING balance_cents AS "balanceAfter"`,
  );
  const row = (res.rows as { balanceAfter: number }[])[0];
  if (!row) throw new BettingError("Insufficient balance for this deduction.");
  await db.insert(walletTransactions).values({
    userId,
    adminId,
    deltaCents: -amountCents,
    balanceAfter: row.balanceAfter,
    kind,
    note,
  });
  return row.balanceAfter;
}

/* ------------------------------------------------------------------ */
/* Admin bet override — the house decides who wins and who loses       */
/* ------------------------------------------------------------------ */

export async function overrideBet(
  betId: string,
  action: "won" | "lost" | "void",
  adminId: string,
): Promise<void> {
  const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
  if (!bet) throw new BettingError("Bet not found.");

  // Reverse any previous settlement first.
  if (bet.status === "won") {
    await debitUser(bet.userId, bet.potentialCents, "bet_refund", `Admin reversal of bet ${betId.slice(0, 8)}`, adminId);
  } else if (bet.status === "void") {
    await debitUser(bet.userId, bet.stakeCents, "bet_refund", `Admin reversal of bet ${betId.slice(0, 8)}`, adminId);
  }

  if (action === "won") {
    await db
      .update(betSelections)
      .set({ status: "won" })
      .where(eq(betSelections.betId, betId));
    await creditUser(bet.userId, bet.potentialCents, "bet_payout", `Admin override: bet ${betId.slice(0, 8)} marked WON`, adminId);
    await db.update(bets).set({ status: "won", settledAt: new Date(), note: "Admin override" }).where(eq(bets.id, betId));
  } else if (action === "lost") {
    await db
      .update(betSelections)
      .set({ status: "lost" })
      .where(and(eq(betSelections.betId, betId), eq(betSelections.status, "open")));
    await db.update(bets).set({ status: "lost", settledAt: new Date(), note: "Admin override" }).where(eq(bets.id, betId));
  } else {
    await db
      .update(betSelections)
      .set({ status: "void" })
      .where(and(eq(betSelections.betId, betId), eq(betSelections.status, "open")));
    await creditUser(bet.userId, bet.stakeCents, "bet_refund", `Admin override: bet ${betId.slice(0, 8)} voided`, adminId);
    await db.update(bets).set({ status: "void", settledAt: new Date(), note: "Admin override" }).where(eq(bets.id, betId));
  }
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export async function getUserBets(userId: string) {
  const rows = await db
    .select({ bet: bets, selection: betSelections })
    .from(bets)
    .leftJoin(betSelections, eq(betSelections.betId, bets.id))
    .where(eq(bets.userId, userId))
    .orderBy(desc(bets.placedAt))
    .limit(200);
  return groupBets(rows);
}

export async function getAllBets(limitN = 150) {
  const rows = await db
    .select({ bet: bets, selection: betSelections, username: users.username })
    .from(bets)
    .innerJoin(users, eq(bets.userId, users.id))
    .leftJoin(betSelections, eq(betSelections.betId, bets.id))
    .orderBy(desc(bets.placedAt))
    .limit(limitN * 3);
  const grouped = groupBets(rows.map((r) => ({ bet: r.bet, selection: r.selection })));
  const nameById = new Map<string, string>();
  for (const r of rows) nameById.set(r.bet.id, r.username);
  return grouped.slice(0, limitN).map((g) => ({ ...g, username: nameById.get(g.bet.id) ?? "?" }));
}

function groupBets(
  rows: { bet: Bet; selection: BetSelection | null }[],
): { bet: Bet; selections: BetSelection[] }[] {
  const map = new Map<string, { bet: Bet; selections: BetSelection[] }>();
  for (const { bet, selection } of rows) {
    if (!map.has(bet.id)) map.set(bet.id, { bet, selections: [] });
    if (selection) map.get(bet.id)!.selections.push(selection);
  }
  return [...map.values()];
}

/** All open selections count per user (for the admin table). */
export async function openBetsByUser(): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: bets.userId, count: sql<number>`count(*)` })
    .from(bets)
    .where(eq(bets.status, "open"))
    .groupBy(bets.userId);
  return new Map(rows.map((r) => [r.userId, Number(r.count)]));
}
