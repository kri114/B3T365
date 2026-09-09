import { getSquad, type EspnEvent, type LeagueRatings, type SquadPlayer } from "./espn";
import { expectedGoals, MARGINS, type MarketGroup, type Outcome } from "./odds";

/**
 * Goalscorer markets.
 *
 * ESPN's free feed has no per-player goal tallies for upcoming fixtures, so
 * each player's share of their team's expected goals is estimated from their
 * listed position (strikers carry most of the threat, keepers none). The
 * player's scoring chance is then 1 - e^(-share × team xG), i.e. the Poisson
 * probability of at least one goal.
 */

const POSITION_WEIGHT: Record<string, number> = {
  F: 1.0, ST: 1.0, CF: 1.0, S: 0.95, W: 0.8, LW: 0.8, RW: 0.8,
  AM: 0.62, "AM-L": 0.6, "AM-R": 0.6, "AM-C": 0.62, M: 0.42, CM: 0.42,
  "M-L": 0.4, "M-R": 0.4, DM: 0.22, "D-M": 0.22,
  D: 0.12, CD: 0.1, "CD-L": 0.1, "CD-R": 0.1, LB: 0.1, RB: 0.1, "D-L": 0.1, "D-R": 0.1,
  G: 0.005, GK: 0.005,
};

function weightFor(position: string): number {
  const p = (position || "").toUpperCase();
  if (POSITION_WEIGHT[p] !== undefined) return POSITION_WEIGHT[p];
  if (p.startsWith("F") || p.includes("ST")) return 0.95;
  if (p.startsWith("AM")) return 0.6;
  if (p.startsWith("M")) return 0.4;
  if (p.startsWith("D")) return 0.11;
  if (p.startsWith("G")) return 0.005;
  return 0.3;
}

function price(prob: number, margin: number): number {
  const p = Math.min(0.985, Math.max(0.004, prob));
  return Math.max(1.05, Math.round(100 / (p * margin)) / 100);
}

/** Build "Anytime" and "First" goalscorer groups for a fixture. */
export async function scorerMarkets(
  event: EspnEvent,
  ratings: LeagueRatings,
): Promise<MarketGroup[]> {
  if (event.state === "post" || event.completed) return [];
  const { lambdaHome, lambdaAway } = expectedGoals(event, ratings);

  const [homeSquad, awaySquad] = await Promise.all([
    getSquad(event.league, event.home.id, event.home.name),
    getSquad(event.league, event.away.id, event.away.name),
  ]);
  if (homeSquad.length === 0 && awaySquad.length === 0) return [];

  const build = (squad: SquadPlayer[], teamLambda: number) => {
    // Depth-chart proxy: ESPN lists squads roughly by seniority within each
    // position group, and first-choice attackers take the lion's share of a
    // team's goals. Apply a decay down each position group so the front-line
    // starter is priced shorter than the third-choice forward.
    const seenInGroup = new Map<string, number>();
    const weights = squad.map((p) => {
      const base = weightFor(p.position);
      const group = (p.position || "?").toUpperCase().charAt(0);
      const rank = seenInGroup.get(group) ?? 0;
      seenInGroup.set(group, rank + 1);
      return base * Math.pow(0.82, rank);
    });
    const sum = weights.reduce((a, w) => a + w, 0) || 1;
    return squad.map((p, i) => {
      const share = (weights[i] / sum) * Math.min(1, (11 / Math.max(11, squad.length)) * 2.1);
      const lambda = teamLambda * share;
      return { player: p, pAnytime: 1 - Math.exp(-lambda), lambda };
    });
  };

  const all = [...build(homeSquad, lambdaHome), ...build(awaySquad, lambdaAway)]
    .filter((x) => x.pAnytime > 0.012)
    .sort((a, b) => b.pAnytime - a.pAnytime)
    .slice(0, 40);
  if (all.length === 0) return [];

  const anytime: Outcome[] = all.map((x) => ({
    pick: x.player.id,
    label: x.player.name,
    sub: x.player.teamName === event.home.name ? event.home.abbr : event.away.abbr,
    odds: price(x.pAnytime, MARGINS.scorer),
  }));

  const lambdaSum = all.reduce((a, x) => a + x.lambda, 0) || 1;
  const pNoGoal = Math.exp(-(lambdaHome + lambdaAway));
  const first: Outcome[] = all.map((x) => ({
    pick: x.player.id,
    label: x.player.name,
    sub: x.player.teamName === event.home.name ? event.home.abbr : event.away.abbr,
    odds: price((x.lambda / lambdaSum) * (1 - pNoGoal), MARGINS.scorer),
  }));
  first.push({ pick: "noscorer", label: "No goalscorer (0-0)", odds: price(pNoGoal, MARGINS.scorer) });

  return [
    { key: "AGS", title: "Anytime Goalscorer", line: null, columns: 3, outcomes: anytime,
      note: "Player scores at any point in the match" },
    { key: "FGS", title: "First Goalscorer", line: null, columns: 3, outcomes: first,
      note: "Player scores the opening goal of the match" },
  ];
}

/** Resolve a player id to a display name (for bet slip labels). */
export async function playerName(
  league: string, event: EspnEvent, playerId: string,
): Promise<string | null> {
  if (playerId === "noscorer") return "No goalscorer";
  const [h, a] = await Promise.all([
    getSquad(league, event.home.id, event.home.name),
    getSquad(league, event.away.id, event.away.name),
  ]);
  return [...h, ...a].find((p) => p.id === playerId)?.name ?? null;
}
