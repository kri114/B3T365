/**
 * Thin client over ESPN's free, keyless JSON endpoints.
 *
 *   Scoreboard : site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates=YYYYMMDD
 *   Standings  : site.api.espn.com/apis/v2/sports/soccer/{league}/standings
 *   Summary    : site.api.espn.com/apis/site/v2/sports/soccer/{league}/summary?event={id}
 *
 * Responses are cached in-process with short TTLs so live pricing stays fresh
 * without hammering ESPN.
 */

const HOSTS = ["https://site.web.api.espn.com", "https://site.api.espn.com"];

/* ------------------------------------------------------------------ */
/* TTL cache                                                           */
/* ------------------------------------------------------------------ */

type CacheEntry = { value: unknown; expires: number };
const globalForCache = globalThis as typeof globalThis & {
  __espnTtlCache?: Map<string, CacheEntry>;
};
const cache = (globalForCache.__espnTtlCache ??= new Map<string, CacheEntry>());

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  if (cache.size > 600) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  }
  return value;
}

export async function fetchJson(path: string): Promise<unknown> {
  let lastErr: unknown = null;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.espn.com/",
          Origin: "https://www.espn.com",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(9000),
      });
      if (res.ok) return await res.json();
      lastErr = new Error(`ESPN ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("ESPN unreachable");
}

/* ------------------------------------------------------------------ */
/* Normalized types                                                    */
/* ------------------------------------------------------------------ */

export type TeamSide = {
  id: string;
  name: string;
  short: string;
  abbr: string;
  logo: string | null;
  homeAway: "home" | "away";
  score: number;
  record: string | null; // e.g. "12-4-6" (W-D-L)
};

export type ProviderOdds = {
  homeML: number | null;
  drawML: number | null;
  awayML: number | null;
  overUnder: number | null;
};

export type EspnEvent = {
  id: string;
  league: string;
  name: string;
  startsAt: string;
  state: "pre" | "in" | "post";
  statusName: string;
  detail: string;
  completed: boolean;
  minute: number | null;
  venue: string | null;
  home: TeamSide;
  away: TeamSide;
  providerOdds: ProviderOdds | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseMinute(status: any): number | null {
  const detail: string = status?.type?.detail ?? status?.type?.shortDetail ?? "";
  if (/half\s*time/i.test(detail)) return 45;
  const m = detail.match(/(\d+)(?:\+(\d+))?'/);
  if (m) return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
  const period = Number(status?.period ?? 0);
  const clock = Number(status?.clock ?? 0);
  if (period === 1) return Math.min(45, Math.floor(clock / 60));
  if (period === 2) return Math.min(90, 45 + Math.floor(clock / 60));
  return null;
}

function parseCompetition(league: string, event: any, competition: any): EspnEvent | null {
  const competitors: any[] = competition?.competitors ?? [];
  const homeRaw = competitors.find((c) => c.homeAway === "home");
  const awayRaw = competitors.find((c) => c.homeAway === "away");
  if (!homeRaw || !awayRaw) return null;

  const side = (c: any): TeamSide => ({
    id: String(c?.team?.id ?? c?.id ?? ""),
    name: c?.team?.displayName ?? c?.team?.name ?? "Unknown",
    short: c?.team?.shortDisplayName ?? c?.team?.abbreviation ?? "",
    abbr: c?.team?.abbreviation ?? "",
    logo: c?.team?.logo ?? c?.team?.logos?.[0]?.href ?? null,
    homeAway: c.homeAway,
    score: Number(c?.score ?? 0) || 0,
    record: c?.records?.find?.((r: any) => r.name === "total" || r.type === "total")?.summary ?? c?.records?.[0]?.summary ?? null,
  });

  const status = competition?.status ?? event?.status;
  const state = (status?.type?.state ?? "pre") as "pre" | "in" | "post";
  const oddsRaw = competition?.odds?.[0];
  const ml = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? n : null;
  };
  const providerOdds: ProviderOdds | null = oddsRaw
    ? {
        homeML: ml(oddsRaw?.moneyline?.home?.close?.odds ?? oddsRaw?.moneyline?.home?.open?.odds),
        drawML: ml(oddsRaw?.drawOdds?.moneyLine),
        awayML: ml(oddsRaw?.moneyline?.away?.close?.odds ?? oddsRaw?.moneyline?.away?.open?.odds),
        overUnder: ml(oddsRaw?.overUnder),
      }
    : null;

  return {
    id: String(event?.id ?? competition?.id ?? ""),
    league,
    name: event?.name ?? `${awayRaw?.team?.displayName ?? "?"} at ${homeRaw?.team?.displayName ?? "?"}`,
    startsAt: event?.date ?? competition?.date ?? new Date().toISOString(),
    state,
    statusName: status?.type?.name ?? "",
    detail: status?.type?.detail ?? status?.type?.shortDetail ?? "",
    completed: Boolean(status?.type?.completed),
    minute: state === "in" ? parseMinute(status) : null,
    venue: competition?.venue?.fullName ?? null,
    home: side(homeRaw),
    away: side(awayRaw),
    providerOdds,
  };
}

export function parseEvents(league: string, data: any): EspnEvent[] {
  const out: EspnEvent[] = [];
  for (const event of data?.events ?? []) {
    const comp = event?.competitions?.[0];
    const parsed = parseCompetition(league, event, comp);
    if (parsed && parsed.id) out.push(parsed);
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ */
/* Public fetchers                                                     */
/* ------------------------------------------------------------------ */

function yyyymmdd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function scoreboardFetch(league: string, params: string, ttlMs = 25_000): Promise<EspnEvent[]> {
  const key = `sb:${league}:${params}`;
  return cached(key, ttlMs, async () => {
    try {
      const data = await fetchJson(
        `/apis/site/v2/sports/soccer/${league}/scoreboard?${params}&limit=400`,
      );
      return parseEvents(league, data);
    } catch {
      return [] as EspnEvent[];
    }
  });
}

/**
 * All fixtures for one calendar date as seen from the CLIENT's timezone.
 * `date` is a local YYYY-MM-DD; `tzOffsetMin` is Date.getTimezoneOffset()
 * (minutes to add to local time to reach UTC). The local-day window is
 * translated to a UTC window, the overlapping ESPN day boards are fetched
 * (plus the dateless live board when the date is "today"), and events are
 * filtered to the exact local window so yesterday/tonight edge games land
 * on the right side of midnight.
 */
export async function getScoreboardDate(
  league: string,
  date: string,
  tzOffsetMin = 0,
): Promise<EspnEvent[]> {
  const startMs = Date.parse(`${date}T00:00:00Z`) + tzOffsetMin * 60_000;
  if (!Number.isFinite(startMs)) return [];
  const endMs = startMs + 86_400_000;
  const nowMs = Date.now();
  const isToday = nowMs >= startMs && nowMs < endMs;

  const dayA = yyyymmdd(new Date(startMs));
  const dayB = yyyymmdd(new Date(endMs - 1));
  const ttl = isToday ? 20_000 : 120_000;
  const fetches: Promise<EspnEvent[]>[] = [scoreboardFetch(league, `dates=${dayA}`, ttl)];
  if (dayB !== dayA) fetches.push(scoreboardFetch(league, `dates=${dayB}`, ttl));
  if (isToday) fetches.push(scoreboardFetch(league, "", 20_000));

  const results = await Promise.all(fetches);
  const seen = new Set<string>();
  const out: EspnEvent[] = [];
  for (const ev of results.flat()) {
    if (seen.has(ev.id)) continue;
    const t = +new Date(ev.startsAt);
    if (t >= startMs && t < endMs) {
      seen.add(ev.id);
      out.push(ev);
    }
  }
  out.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  return out;
}

/**
 * Fixtures from `daysBack` days ago through `daysAhead` days ahead (UTC).
 * Combines the dateless "current round" board (best for in-play) with an
 * explicit date range so upcoming days are covered too.
 */
export async function getScoreboardWindow(
  league: string,
  daysBack = 1,
  daysAhead = 2,
): Promise<EspnEvent[]> {
  const now = new Date();
  const from = yyyymmdd(new Date(now.getTime() - daysBack * 86_400_000));
  const to = yyyymmdd(new Date(now.getTime() + daysAhead * 86_400_000));
  const [range, current] = await Promise.all([
    scoreboardFetch(league, `dates=${from}-${to}`),
    scoreboardFetch(league, "", 20_000),
  ]);
  const seen = new Set<string>();
  const out: EspnEvent[] = [];
  for (const ev of [...current, ...range]) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    out.push(ev);
  }
  out.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  return out;
}

/* ------------------------------------------------------------------ */
/* Standings → team ratings input                                      */
/* ------------------------------------------------------------------ */

export type TeamRating = {
  teamId: string;
  name: string;
  gp: number;
  gf: number;
  ga: number;
  pts: number;
  form: string | null; // e.g. "WWDLD" (oldest→newest)
};

export type LeagueRatings = {
  league: string;
  avgGoals: number; // league avg goals per team per game
  teams: Record<string, TeamRating>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export const getLeagueRatings = (league: string): Promise<LeagueRatings> =>
  cached(`standings:${league}`, 60 * 60_000, async (): Promise<LeagueRatings> => {
    const fallback: LeagueRatings = { league, avgGoals: 1.36, teams: {} };
    try {
      const data: any = await fetchJson(
        `/apis/v2/sports/soccer/${league}/standings?season=${currentSeasonYear()}`,
      );
      const pools: any[] = [];
      if (data?.standings?.entries) pools.push(data.standings.entries);
      for (const child of data?.children ?? []) {
        if (child?.standings?.entries) pools.push(child.standings.entries);
      }
      const teams: Record<string, TeamRating> = {};
      let totalGF = 0;
      let totalGP = 0;
      for (const entries of pools) {
        for (const entry of entries) {
          const stats: any[] = entry?.stats ?? [];
          const num = (name: string) =>
            Number(stats.find((s) => s?.name === name)?.value ?? NaN);
          const formStat = stats.find((s) => s?.name === "form");
          const teamId = String(entry?.team?.id ?? "");
          if (!teamId) continue;
          const gp = num("gamesPlayed") || 0;
          const gf = num("pointsFor") || 0;
          const ga = num("pointsAgainst") || 0;
          totalGF += gf;
          totalGP += gp;
          teams[teamId] = {
            teamId,
            name: entry?.team?.displayName ?? "",
            gp,
            gf,
            ga,
            pts: num("points") || 0,
            form: typeof formStat?.displayValue === "string" ? formStat.displayValue : null,
          };
        }
      }
      const avgGoals =
        totalGP > 0 && totalGF > 0 ? clamp(totalGF / totalGP, 0.7, 2.2) : 1.36;
      return { league, avgGoals, teams };
    } catch {
      return fallback;
    }
  });

/** ESPN seasons run YYYY (start year); try current, parent fetch already falls back. */
function currentSeasonYear(): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? y : y - 1;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
