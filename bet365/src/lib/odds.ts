/**
 * Quantitative odds engine.
 *
 * Prices are NOT random. Every quote is derived from a bivariate Poisson goal
 * model whose expected-goals inputs are built from observable factors:
 *
 *   1. Strength  – attack/defence ratings from season goals for/against,
 *                  normalised against the league scoring baseline.
 *   2. Morale    – recent form (last-five W/D/L from ESPN standings) nudges
 *                  expected goals up/down by a few percent.
 *   3. Venue     – home-pitch advantage calibrated from the league baseline
 *                  (home sides historically score ~57% of goals).
 *   4. Marketchk – when ESPN lists bookmaker moneylines for the fixture they
 *                  are de-vigged and blended in (45%) as a market anchor.
 *   5. Live      – in-play prices recompute from scoreline + elapsed time with
 *                  remaining-time decay.
 *   6. Margin    – a fixed overround (~6% three-way / ~5% two-way) so prices
 *                  behave like a real book.
 */

import type { EspnEvent, LeagueRatings, TeamRating } from "./espn";

/* ------------------------------------------------------------------ */
/* Poisson machinery                                                   */
/* ------------------------------------------------------------------ */

const FACT: number[] = [1];
for (let i = 1; i <= 14; i++) FACT.push(FACT[i - 1] * i);

function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / FACT[k];
}

const MAX_GOALS = 10;

type GoalProbs = {
  homeWin: number;
  draw: number;
  awayWin: number;
  over: (line: number) => number; // total goals > line
  bttsYes: number;
};

function aggregate(lh: number, la: number, carryH = 0, carryA = 0): GoalProbs {
  const ph: number[] = [];
  const pa: number[] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    ph.push(poisson(i, lh));
    pa.push(poisson(i, la));
  }
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let bttsYes = 0;
  const overCache = new Map<number, number>();
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j];
      const fh = carryH + i;
      const fa = carryA + j;
      if (fh > fa) homeWin += p;
      else if (fh === fa) draw += p;
      else awayWin += p;
      if (fh > 0 && fa > 0) bttsYes += p;
      for (const line of [1.5, 2.5, 3.5, 4.5]) {
        if (fh + fa > line) overCache.set(line, (overCache.get(line) ?? 0) + p);
      }
    }
  }
  return {
    homeWin,
    draw,
    awayWin,
    over: (line) => overCache.get(line) ?? 0,
    bttsYes,
  };
}

/* ------------------------------------------------------------------ */
/* Factor modelling                                                    */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function formPoints(form: string | null): number | null {
  if (!form) return null;
  const letters = form.replace(/[^WDL]/gi, "").toUpperCase().slice(-5);
  if (!letters.length) return null;
  let pts = 0;
  for (const ch of letters) pts += ch === "W" ? 3 : ch === "D" ? 1 : 0;
  return pts / letters.length; // avg pts per recent game, 0..3
}

export type TeamFactors = {
  attack: number;
  defense: number;
  morale: number; // multiplier derived from form
  ppg: number | null;
  formString: string | null;
};

/** Prior games worth of "league-average" evidence folded into small samples. */
const SHRINK_K = 5;

export function teamFactors(rating: TeamRating | undefined, avgGoals: number): TeamFactors {
  if (!rating || rating.gp < 1) {
    return { attack: 1, defense: 1, morale: 1, ppg: null, formString: rating?.form ?? null };
  }
  const gp = rating.gp;
  const attRaw = clamp(rating.gf / gp / avgGoals, 0.3, 2.6);
  const defRaw = clamp(rating.ga / gp / avgGoals, 0.3, 2.6);
  // Early season → regress toward the league mean so prices stay sane.
  const attack = clamp((attRaw * gp + 1 * SHRINK_K) / (gp + SHRINK_K), 0.5, 2.0);
  const defense = clamp((defRaw * gp + 1 * SHRINK_K) / (gp + SHRINK_K), 0.5, 2.0);
  const fp = formPoints(rating.form);
  const morale = fp === null ? 1 : 1 + clamp(fp - 1.35, -1.35, 1.65) * 0.05;
  return {
    attack,
    defense,
    morale,
    ppg: rating.pts / gp,
    formString: rating.form,
  };
}

export function expectedGoals(
  event: EspnEvent,
  ratings: LeagueRatings,
): { lambdaHome: number; lambdaAway: number; homeF: TeamFactors; awayF: TeamFactors } {
  const g = ratings.avgGoals || 1.36;
  const baseHome = 2 * g * 0.572; // home share of scoring
  const baseAway = 2 * g * 0.428;
  const homeF = teamFactors(ratings.teams[event.home.id], g);
  const awayF = teamFactors(ratings.teams[event.away.id], g);
  const lambdaHome = clamp(baseHome * homeF.attack * awayF.defense * homeF.morale, 0.2, 4.4);
  const lambdaAway = clamp(baseAway * awayF.attack * homeF.defense * awayF.morale, 0.2, 4.4);
  return { lambdaHome, lambdaAway, homeF, awayF };
}

/* ------------------------------------------------------------------ */
/* Pricing (probability → decimal odds with margin)                    */
/* ------------------------------------------------------------------ */

const MARGIN_THREE_WAY = 1.06;
const MARGIN_TWO_WAY = 1.05;

function price(prob: number, margin: number): number {
  const p = clamp(prob, 0.002, 0.998);
  return Math.max(1.01, Math.round(100 / (p * margin)) / 100);
}

/** Convert American moneyline → implied probability. */
function mlToProb(ml: number): number {
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type MatchMarkets = {
  oneXTwo: { home: number; draw: number; away: number } | null;
  doubleChance: { "1X": number; "12": number; "X2": number } | null;
  overUnder: { line: number; over: number; under: number }[];
  btts: { yes: number; no: number } | null;
  source: "model" | "blended";
  lambdaHome: number;
  lambdaAway: number;
};

export function priceMatch(
  event: EspnEvent,
  ratings: LeagueRatings,
  lines: number[] = [2.5],
): MatchMarkets {
  const finished = event.state === "post" || event.completed;
  const { lambdaHome, lambdaAway } = expectedGoals(event, ratings);

  if (finished) {
    return {
      oneXTwo: null,
      doubleChance: null,
      overUnder: [],
      btts: null,
      source: "model",
      lambdaHome,
      lambdaAway,
    };
  }

  let liveCarryH = 0;
  let liveCarryA = 0;
  let lh = lambdaHome;
  let la = lambdaAway;
  const live = event.state === "in" && event.minute !== null;

  if (live) {
    const elapsed = clamp(event.minute ?? 0, 0, 90);
    const remain = clamp((90 - elapsed) / 90, 0.02, 1);
    const openness = 1.06; // games open up late
    lh = lambdaHome * remain * openness;
    la = lambdaAway * remain * openness;
    liveCarryH = event.home.score;
    liveCarryA = event.away.score;
  }

  const probs = aggregate(lh, la, liveCarryH, liveCarryA);

  /* ---- 1X2 with optional market anchor ---- */
  let pH = probs.homeWin;
  let pD = probs.draw;
  let pA = probs.awayWin;
  let source: MatchMarkets["source"] = "model";
  const po = event.providerOdds;
  if (po?.homeML && po?.awayML && po?.drawML && !live) {
    const mh = mlToProb(po.homeML);
    const md = mlToProb(po.drawML);
    const ma = mlToProb(po.awayML);
    const sum = mh + md + ma;
    if (sum > 0) {
      pH = pH * 0.55 + (mh / sum) * 0.45;
      pD = pD * 0.55 + (md / sum) * 0.45;
      pA = pA * 0.55 + (ma / sum) * 0.45;
      source = "blended";
    }
  }

  const isDecided = {
    btts: live && liveCarryH > 0 && liveCarryA > 0,
  };

  const oneXTwo =
    // Suspended once the match is effectively over
    live && (event.minute ?? 0) >= 90
      ? null
      : {
          home: price(pH, MARGIN_THREE_WAY),
          draw: price(pD, MARGIN_THREE_WAY),
          away: price(pA, MARGIN_THREE_WAY),
        };

  const doubleChance = oneXTwo
    ? {
        "1X": price(pH + pD, MARGIN_THREE_WAY),
        "12": price(pH + pA, MARGIN_THREE_WAY),
        X2: price(pD + pA, MARGIN_THREE_WAY),
      }
    : null;

  const overUnder: MatchMarkets["overUnder"] = [];
  for (const rawLine of lines) {
    const line = rawLine;
    // Skip lines already mathematically decided in a live match
    if (live && liveCarryH + liveCarryA > line) continue;
    if (live && (event.minute ?? 0) >= 90) continue;
    const pOver = probs.over(line);
    if (pOver <= 0.001 || pOver >= 0.999) continue;
    overUnder.push({
      line,
      over: price(pOver, MARGIN_TWO_WAY),
      under: price(1 - pOver, MARGIN_TWO_WAY),
    });
  }

  const btts =
    isDecided.btts || (live && (event.minute ?? 0) >= 90)
      ? null
      : {
          yes: price(probs.bttsYes, MARGIN_TWO_WAY),
          no: price(1 - probs.bttsYes, MARGIN_TWO_WAY),
        };

  return { oneXTwo, doubleChance, overUnder, btts, source, lambdaHome, lambdaAway };
}

/** Extract a single quoted price for bet placement from priced markets. */
export function quoteFor(
  markets: MatchMarkets,
  market: string,
  line: number | null,
  pick: string,
): number | null {
  switch (market) {
    case "1X2":
      return markets.oneXTwo?.[pick as "home" | "draw" | "away"] ?? null;
    case "DC":
      return markets.doubleChance?.[pick as "1X" | "12" | "X2"] ?? null;
    case "OU": {
      const ou = markets.overUnder.find((o) => o.line === line);
      return ou ? (pick === "over" ? ou.over : pick === "under" ? ou.under : null) : null;
    }
    case "BTTS":
      return markets.btts?.[pick as "yes" | "no"] ?? null;
    default:
      return null;
  }
}

/** Grade a placed selection against a final scoreline. */
export function gradeSelection(
  market: string,
  line: number | null,
  pick: string,
  homeScore: number,
  awayScore: number,
): "won" | "lost" {
  const total = homeScore + awayScore;
  switch (market) {
    case "1X2":
      if (pick === "home") return homeScore > awayScore ? "won" : "lost";
      if (pick === "draw") return homeScore === awayScore ? "won" : "lost";
      return awayScore > homeScore ? "won" : "lost";
    case "DC": {
      const h = homeScore > awayScore;
      const d = homeScore === awayScore;
      const a = awayScore > homeScore;
      if (pick === "1X") return h || d ? "won" : "lost";
      if (pick === "12") return h || a ? "won" : "lost";
      return d || a ? "won" : "lost";
    }
    case "OU": {
      const l = line ?? 2.5;
      if (pick === "over") return total > l ? "won" : "lost";
      return total < l ? "won" : "lost";
    }
    case "BTTS": {
      const both = homeScore > 0 && awayScore > 0;
      return pick === "yes" ? (both ? "won" : "lost") : both ? "lost" : "won";
    }
    default:
      return "lost";
  }
}

export const MARKET_LABELS: Record<string, string> = {
  "1X2": "Match Result",
  DC: "Double Chance",
  OU: "Total Goals",
  BTTS: "Both Teams To Score",
};

export function pickLabel(market: string, line: number | null, pick: string, home: string, away: string): string {
  switch (market) {
    case "1X2":
      return pick === "home" ? home : pick === "away" ? away : "Draw";
    case "DC":
      return pick === "1X" ? `${home} or Draw` : pick === "12" ? `${home} or ${away}` : `Draw or ${away}`;
    case "OU":
      return `${pick === "over" ? "Over" : "Under"} ${line ?? 2.5} goals`;
    case "BTTS":
      return pick === "yes" ? "Both teams to score — Yes" : "Both teams to score — No";
    default:
      return pick;
  }
}
