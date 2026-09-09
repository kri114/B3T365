import { db } from "@/db";
import { favorites, matchWatch } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getLeagueRatings, getScoreboardWindow, type EspnEvent } from "./espn";
import { priceMatch } from "./odds";
import { sendToUsers } from "./push";

/**
 * Polls every fixture that at least one user has favourited and pushes a
 * notification when something happens: kick-off, a goal, half-time, second
 * half, full time. Each alert carries the live scoreline plus the current
 * 1X2 prices, which the service worker renders under the score.
 *
 * State lives in `match_watch`, so an alert fires exactly once even across
 * server restarts or multiple instances.
 */

const globalForWatch = globalThis as typeof globalThis & {
  __matchWatcherTimer?: ReturnType<typeof setInterval>;
  __matchWatcherRunning?: boolean;
};

function phaseOf(event: EspnEvent): "pre" | "1H" | "HT" | "2H" | "FT" {
  if (event.state === "post" || event.completed) return "FT";
  if (event.state === "pre") return "pre";
  const detail = (event.detail || "").toLowerCase();
  if (detail.includes("half") && detail.includes("time")) return "HT";
  if (/^ht$/.test(detail.trim())) return "HT";
  const m = event.minute ?? 0;
  return m > 45 ? "2H" : "1H";
}

function oddsLine(event: EspnEvent, league: string, ratings: Awaited<ReturnType<typeof getLeagueRatings>>): string {
  try {
    const m = priceMatch(event, ratings, [2.5]);
    if (!m.oneXTwo) return "";
    const h = event.home.abbr || event.home.short || "H";
    const a = event.away.abbr || event.away.short || "A";
    return `${h} ${m.oneXTwo.home.toFixed(2)}  ·  X ${m.oneXTwo.draw.toFixed(2)}  ·  ${a} ${m.oneXTwo.away.toFixed(2)}`;
  } catch {
    return "";
  }
}

export async function runMatchWatch(): Promise<void> {
  if (globalForWatch.__matchWatcherRunning) return;
  globalForWatch.__matchWatcherRunning = true;
  try {
    // Which fixtures does anyone care about?
    const followed = await db
      .select({
        eventId: favorites.eventId,
        league: favorites.league,
        userId: favorites.userId,
      })
      .from(favorites);
    if (followed.length === 0) return;

    const byEvent = new Map<string, { league: string; eventId: string; users: string[] }>();
    for (const f of followed) {
      const key = `${f.league}:${f.eventId}`;
      const entry = byEvent.get(key) ?? { league: f.league, eventId: f.eventId, users: [] };
      if (!entry.users.includes(f.userId)) entry.users.push(f.userId);
      byEvent.set(key, entry);
    }

    const leagues = [...new Set([...byEvent.values()].map((v) => v.league))];
    const eventsByLeague = new Map<string, EspnEvent[]>();
    await Promise.all(
      leagues.map(async (l) => {
        eventsByLeague.set(l, await getScoreboardWindow(l, 1, 2).catch(() => []));
      }),
    );

    for (const [key, { league, eventId, users }] of byEvent) {
      const event = eventsByLeague.get(league)?.find((e) => e.id === eventId);
      if (!event) continue;

      const phase = phaseOf(event);
      const hs = event.home.score;
      const as = event.away.score;

      const [prev] = await db.select().from(matchWatch).where(eq(matchWatch.key, key)).limit(1);
      if (!prev) {
        await db
          .insert(matchWatch)
          .values({ key, eventId, league, homeScore: hs, awayScore: as, phase })
          .onConflictDoNothing();
        continue;
      }
      if (prev.phase === phase && prev.homeScore === hs && prev.awayScore === as) continue;

      const home = event.home.short || event.home.name;
      const away = event.away.short || event.away.name;
      const score = `${home} ${hs} – ${as} ${away}`;
      const ratings = await getLeagueRatings(league).catch(() => null);
      const odds = ratings && phase !== "FT" ? oddsLine(event, league, ratings) : "";
      const url = `/event/${eventId}?league=${encodeURIComponent(league)}`;

      const alerts: { title: string; body: string }[] = [];

      if (hs > prev.homeScore || as > prev.awayScore) {
        const scorer = hs > prev.homeScore ? home : away;
        alerts.push({
          title: `⚽ GOAL — ${scorer}`,
          body: `${score}${event.minute ? `  ·  ${event.minute}'` : ""}`,
        });
      }
      if (prev.phase !== phase) {
        if (phase === "1H" && prev.phase === "pre")
          alerts.push({ title: `🟢 Kick-off`, body: `${home} v ${away} is under way` });
        else if (phase === "HT")
          alerts.push({ title: `⏸️ Half time`, body: score });
        else if (phase === "2H" && prev.phase === "HT")
          alerts.push({ title: `▶️ Second half`, body: score });
        else if (phase === "FT")
          alerts.push({ title: `🏁 Full time`, body: score });
      }

      for (const a of alerts) {
        await sendToUsers(users, { ...a, tag: key, url, odds }).catch(() => {});
      }

      await db
        .update(matchWatch)
        .set({ homeScore: hs, awayScore: as, phase, updatedAt: new Date() })
        .where(eq(matchWatch.key, key));
    }

    // Housekeeping: drop watch rows for fixtures nobody follows any more.
    await db
      .delete(matchWatch)
      .where(sql`${matchWatch.updatedAt} < now() - interval '3 days'`)
      .catch(() => {});
  } finally {
    globalForWatch.__matchWatcherRunning = false;
  }
}

/**
 * Start the background poller (idempotent).
 *
 * Runs two jobs every 30s:
 *   1. settle finished bets and pay out winners — this must NOT depend on a
 *      user having a page open, otherwise payouts stall;
 *   2. push alerts for followed fixtures.
 */
export function startMatchWatcher(): void {
  if (globalForWatch.__matchWatcherTimer) return;

  const tick = async () => {
    try {
      const { settleOpenBets } = await import("./betting");
      const settled = await settleOpenBets();
      if (settled > 0) console.log(`[settle] settled ${settled} bet(s)`);
    } catch (err) {
      console.warn("[settle]", (err as Error)?.message ?? err);
    }
    try {
      await runMatchWatch();
    } catch (err) {
      console.warn("[watch]", (err as Error)?.message ?? err);
    }
  };

  globalForWatch.__matchWatcherTimer = setInterval(tick, 30_000);
  setTimeout(tick, 5_000); // first pass shortly after boot
  console.log("[watch] settlement + match watcher started (30s interval)");
}
