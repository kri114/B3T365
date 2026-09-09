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

/* ------------------------------------------------------------------ */
/* Full match stat line (settlement) + squads (goalscorer markets)      */
/* ------------------------------------------------------------------ */

export type MatchStats = {
  finished: boolean;
  voided: boolean;
  homeScore: number;
  awayScore: number;
  htHome: number | null;
  htAway: number | null;
  cornersHome: number | null;
  cornersAway: number | null;
  corners1H: number | null;
  corners2H: number | null;
  cardsHome: number | null;
  cardsAway: number | null;
  cards1H: number | null;
  cards2H: number | null;
  scorerIds: string[];
  firstScorerId: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pull the complete stat line for a fixture from ESPN's summary endpoint:
 * score, half-time score, corners (boxscore + commentary split by half),
 * cards by half (keyEvents) and goalscorers.
 */
export async function getMatchStats(league: string, eventId: string): Promise<MatchStats | null> {
  let data: any;
  try {
    data = await fetchJson(`/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`);
  } catch {
    return null;
  }

  const comp = data?.header?.competitions?.[0];
  const status = comp?.status ?? data?.header?.status;
  const name: string = status?.type?.name ?? "";
  if (["STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_SUSPENDED", "STATUS_ABANDONED"].includes(name)) {
    return { ...emptyStats(), voided: true };
  }
  const finished = Boolean(status?.type?.completed) || status?.type?.state === "post";
  if (!finished) return null;

  const competitors: any[] = comp?.competitors ?? [];
  const homeC = competitors.find((c) => c.homeAway === "home");
  const awayC = competitors.find((c) => c.homeAway === "away");
  const homeId = String(homeC?.team?.id ?? homeC?.id ?? "");
  const awayId = String(awayC?.team?.id ?? awayC?.id ?? "");
  const homeScore = Number(homeC?.score ?? 0) || 0;
  const awayScore = Number(awayC?.score ?? 0) || 0;

  /* ---- corners & cards totals from the boxscore ---- */
  let cornersHome: number | null = null, cornersAway: number | null = null;
  let cardsHome: number | null = null, cardsAway: number | null = null;
  for (const t of data?.boxscore?.teams ?? []) {
    const stats: Record<string, number> = {};
    for (const s of t?.statistics ?? []) {
      const v = Number(s?.displayValue ?? s?.value);
      if (Number.isFinite(v)) stats[s?.name] = v;
    }
    const isHome = String(t?.team?.id ?? "") === homeId;
    const corners = stats.wonCorners ?? null;
    const cards = (stats.yellowCards ?? 0) + (stats.redCards ?? 0);
    if (isHome) {
      cornersHome = corners;
      cardsHome = Number.isFinite(cards) ? cards : null;
    } else {
      cornersAway = corners;
      cardsAway = Number.isFinite(cards) ? cards : null;
    }
  }

  /* ---- goals, cards by half, scorers from keyEvents ---- */
  let htHome = 0, htAway = 0, sawFirstHalf = false;
  let cards1H = 0, cards2H = 0, sawCard = false;
  const scorerIds: string[] = [];
  let firstScorerId: string | null = null;

  for (const ev of data?.keyEvents ?? []) {
    const type = String(ev?.type?.text ?? "");
    const period = Number(ev?.period?.number ?? 0);
    if (period === 1) sawFirstHalf = true;

    if (ev?.scoringPlay || /^Goal/i.test(type)) {
      const own = /own goal/i.test(type) || /own goal/i.test(String(ev?.text ?? ""));
      const teamId = String(ev?.team?.id ?? "");
      if (period === 1) {
        if (teamId === homeId) htHome++;
        else if (teamId === awayId) htAway++;
      }
      const athlete = ev?.participants?.[0]?.athlete ?? ev?.athletesInvolved?.[0];
      const aid = athlete?.id ? String(athlete.id) : null;
      if (aid && !own) {
        if (!scorerIds.includes(aid)) scorerIds.push(aid);
        if (!firstScorerId) firstScorerId = aid;
      }
    }

    if (/Yellow Card|Red Card/i.test(type)) {
      sawCard = true;
      if (period === 1) cards1H++;
      else if (period === 2) cards2H++;
    }
  }

  /* ---- corners per half from commentary text ---- */
  let corners1H: number | null = null, corners2H: number | null = null;
  const commentary: any[] = data?.commentary ?? [];
  if (commentary.length > 0) {
    let c1 = 0, c2 = 0, seen = false;
    for (const c of commentary) {
      if (!/^Corner[,.]/i.test(String(c?.text ?? "").trim())) continue;
      seen = true;
      const p = Number(c?.play?.period?.number ?? 0);
      if (p === 1) c1++; else if (p === 2) c2++;
    }
    if (seen) { corners1H = c1; corners2H = c2; }
  }

  return {
    finished: true,
    voided: false,
    homeScore,
    awayScore,
    htHome: sawFirstHalf ? htHome : null,
    htAway: sawFirstHalf ? htAway : null,
    cornersHome, cornersAway, corners1H, corners2H,
    cardsHome, cardsAway,
    cards1H: sawCard || (cardsHome !== null && cardsAway !== null) ? cards1H : null,
    cards2H: sawCard || (cardsHome !== null && cardsAway !== null) ? cards2H : null,
    scorerIds,
    firstScorerId,
  };
}

function emptyStats(): MatchStats {
  return {
    finished: false, voided: false, homeScore: 0, awayScore: 0,
    htHome: null, htAway: null, cornersHome: null, cornersAway: null,
    corners1H: null, corners2H: null, cardsHome: null, cardsAway: null,
    cards1H: null, cards2H: null, scorerIds: [], firstScorerId: null,
  };
}

/* ------------------------------------------------------------------ */
/* Lineups & live match statistics                                      */
/* ------------------------------------------------------------------ */

export type LineupPlayer = {
  id: string;
  name: string;
  jersey: string | null;
  position: string;
  formationPlace: number | null;
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
};

export type TeamLineup = {
  teamId: string;
  teamName: string;
  formation: string | null;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
};

export type StatPair = { name: string; label: string; home: string; away: string };

export type MatchDetail = {
  confirmed: boolean; // true once ESPN publishes the official XI
  lineups: { home: TeamLineup | null; away: TeamLineup | null };
  stats: StatPair[];
  events: { minute: string; type: string; text: string; teamId: string | null }[];
};

const STAT_LABELS: Record<string, string> = {
  possessionPct: "Possession %",
  totalShots: "Total shots",
  shotsOnTarget: "Shots on target",
  wonCorners: "Corners",
  foulsCommitted: "Fouls",
  yellowCards: "Yellow cards",
  redCards: "Red cards",
  offsides: "Offsides",
  saves: "Saves",
  accuratePasses: "Accurate passes",
  totalPasses: "Total passes",
  passPct: "Pass accuracy %",
  blockedShots: "Blocked shots",
  effectiveTackles: "Tackles won",
  interceptions: "Interceptions",
};
const STAT_ORDER = Object.keys(STAT_LABELS);

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Lineups (official when published), live team stats and key events. */
export const getMatchDetail = (league: string, eventId: string, live: boolean): Promise<MatchDetail | null> =>
  cached(`detail:${league}:${eventId}`, live ? 20_000 : 120_000, async () => {
    let data: any;
    try {
      data = await fetchJson(`/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`);
    } catch {
      return null;
    }

    const comp = data?.header?.competitions?.[0];
    const competitors: any[] = comp?.competitors ?? [];
    const homeId = String(competitors.find((c) => c.homeAway === "home")?.team?.id ?? "");
    const awayId = String(competitors.find((c) => c.homeAway === "away")?.team?.id ?? "");

    const mapPlayer = (p: any): LineupPlayer => ({
      id: String(p?.athlete?.id ?? ""),
      name: p?.athlete?.displayName ?? p?.athlete?.fullName ?? "—",
      jersey: p?.jersey ?? null,
      position: p?.position?.abbreviation ?? p?.position?.name ?? "",
      formationPlace: p?.formationPlace ? Number(p.formationPlace) : null,
      starter: Boolean(p?.starter),
      subbedIn: Boolean(p?.subbedIn),
      subbedOut: Boolean(p?.subbedOut),
    });

    let home: TeamLineup | null = null;
    let away: TeamLineup | null = null;
    for (const t of data?.rosters ?? []) {
      const roster: any[] = t?.roster ?? [];
      if (roster.length === 0) continue;
      const players = roster.map(mapPlayer);
      const entry: TeamLineup = {
        teamId: String(t?.team?.id ?? ""),
        teamName: t?.team?.displayName ?? "",
        formation: t?.formation ?? null,
        starters: players.filter((p) => p.starter),
        bench: players.filter((p) => !p.starter),
      };
      if (entry.teamId === homeId) home = entry;
      else if (entry.teamId === awayId) away = entry;
    }

    const statsMap = new Map<string, { home?: string; away?: string }>();
    for (const t of data?.boxscore?.teams ?? []) {
      const isHome = String(t?.team?.id ?? "") === homeId;
      for (const s of t?.statistics ?? []) {
        const key = s?.name;
        if (!key || !STAT_LABELS[key]) continue;
        const cur = statsMap.get(key) ?? {};
        const value = String(s?.displayValue ?? s?.value ?? "");
        if (isHome) cur.home = value; else cur.away = value;
        statsMap.set(key, cur);
      }
    }
    const stats: StatPair[] = STAT_ORDER.filter((k) => statsMap.has(k)).map((k) => ({
      name: k,
      label: STAT_LABELS[k],
      home: statsMap.get(k)?.home ?? "0",
      away: statsMap.get(k)?.away ?? "0",
    }));

    const events = (data?.keyEvents ?? [])
      .filter((e: any) => /Goal|Card|Penalty|Substitution/i.test(String(e?.type?.text ?? "")))
      .map((e: any) => ({
        minute: e?.clock?.displayValue ?? "",
        type: String(e?.type?.text ?? ""),
        text: String(e?.shortText ?? e?.text ?? ""),
        teamId: e?.team?.id ? String(e.team.id) : null,
      }))
      .reverse()
      .slice(0, 40);

    const confirmed = Boolean(home?.starters.length && away?.starters.length);
    return { confirmed, lineups: { home, away }, stats, events };
  });
/* eslint-enable @typescript-eslint/no-explicit-any */

export type SquadPlayer = {
  id: string;
  name: string;
  position: string;
  teamId: string;
  teamName: string;
};

/** Squad list for a team, used to build goalscorer markets. */
export const getSquad = (league: string, teamId: string, teamName: string): Promise<SquadPlayer[]> =>
  cached(`squad:${league}:${teamId}`, 6 * 60 * 60_000, async () => {
    try {
      const data: any = await fetchJson(
        `/apis/site/v2/sports/soccer/${league}/teams/${teamId}/roster`,
      );
      const out: SquadPlayer[] = [];
      for (const entry of data?.athletes ?? []) {
        const items = entry?.items ?? [entry];
        for (const a of items) {
          const id = String(a?.id ?? "");
          const name = a?.displayName ?? a?.fullName;
          if (!id || !name) continue;
          out.push({
            id,
            name,
            position: a?.position?.abbreviation ?? a?.position?.name ?? "",
            teamId,
            teamName,
          });
        }
      }
      return out;
    } catch {
      return [] as SquadPlayer[];
    }
  });
/* eslint-enable @typescript-eslint/no-explicit-any */

/** ESPN seasons run YYYY (start year); try current, parent fetch already falls back. */
function currentSeasonYear(): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? y : y - 1;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
