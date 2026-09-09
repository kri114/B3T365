/**
 * Quantitative odds engine.
 *
 * Prices are NOT random. Goal markets come from a Poisson goal model whose
 * expected-goals inputs are built from observable factors (team strength,
 * morale/form, home advantage, and — when ESPN lists them — de-vigged
 * bookmaker moneylines). Corner and card markets use separate Poisson models
 * anchored to league baselines and scaled by team strength/aggression.
 *
 * Every quote then has a house margin (overround) applied. Margins are wider
 * on exotic markets, exactly as real bookmakers price them — see MARGINS.
 */

import type { EspnEvent, LeagueRatings, TeamRating } from "./espn";

/* ------------------------------------------------------------------ */
/* House margins (the edge). Higher = worse price for the player.      */
/* ------------------------------------------------------------------ */

export const MARGINS = {
  main: 1.06, // 1X2, double chance
  totals: 1.05, // over/under, BTTS
  halves: 1.09, // half-time markets
  handicap: 1.07,
  teamTotals: 1.08,
  oddEven: 1.07,
  cleanSheet: 1.08,
  htft: 1.22, // exotic
  correctScore: 1.32, // very exotic
  margin: 1.2, // winning margin
  range: 1.14, // goal bands
  corners: 1.1,
  cards: 1.12,
  scorer: 1.22,
} as const;

/* ------------------------------------------------------------------ */
/* Poisson machinery                                                   */
/* ------------------------------------------------------------------ */

const FACT: number[] = [1];
for (let i = 1; i <= 25; i++) FACT.push(FACT[i - 1] * i);

export function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k > 24) return 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / FACT[k];
}

/** P(X > line) for Poisson(lambda), line is a .5 number. */
function poissonOver(lambda: number, line: number): number {
  const maxK = Math.floor(line);
  let under = 0;
  for (let k = 0; k <= maxK; k++) under += poisson(k, lambda);
  return clamp(1 - under, 0.0005, 0.9995);
}

const MAX_GOALS = 9;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ */
/* Factor modelling                                                    */
/* ------------------------------------------------------------------ */

function formPoints(form: string | null): number | null {
  if (!form) return null;
  const letters = form.replace(/[^WDL]/gi, "").toUpperCase().slice(-5);
  if (!letters.length) return null;
  let pts = 0;
  for (const ch of letters) pts += ch === "W" ? 3 : ch === "D" ? 1 : 0;
  return pts / letters.length;
}

export type TeamFactors = {
  attack: number;
  defense: number;
  morale: number;
  ppg: number | null;
  formString: string | null;
};

const SHRINK_K = 5;

export function teamFactors(rating: TeamRating | undefined, avgGoals: number): TeamFactors {
  if (!rating || rating.gp < 1) {
    return { attack: 1, defense: 1, morale: 1, ppg: null, formString: rating?.form ?? null };
  }
  const gp = rating.gp;
  const attRaw = clamp(rating.gf / gp / avgGoals, 0.3, 2.6);
  const defRaw = clamp(rating.ga / gp / avgGoals, 0.3, 2.6);
  const attack = clamp((attRaw * gp + SHRINK_K) / (gp + SHRINK_K), 0.5, 2.0);
  const defense = clamp((defRaw * gp + SHRINK_K) / (gp + SHRINK_K), 0.5, 2.0);
  const fp = formPoints(rating.form);
  const morale = fp === null ? 1 : 1 + clamp(fp - 1.35, -1.35, 1.65) * 0.05;
  return { attack, defense, morale, ppg: rating.pts / gp, formString: rating.form };
}

export function expectedGoals(event: EspnEvent, ratings: LeagueRatings) {
  const g = ratings.avgGoals || 1.36;
  const baseHome = 2 * g * 0.572;
  const baseAway = 2 * g * 0.428;
  const homeF = teamFactors(ratings.teams[event.home.id], g);
  const awayF = teamFactors(ratings.teams[event.away.id], g);
  const lambdaHome = clamp(baseHome * homeF.attack * awayF.defense * homeF.morale, 0.2, 4.4);
  const lambdaAway = clamp(baseAway * awayF.attack * homeF.defense * awayF.morale, 0.2, 4.4);
  return { lambdaHome, lambdaAway, homeF, awayF };
}

/* ---- Corners & cards models -------------------------------------- */

/** League-specific card tendencies (avg total cards per match). */
const CARD_BASELINE: Record<string, number> = {
  "esp.1": 5.2,
  "ita.1": 5.0,
  "por.1": 4.9,
  "fra.1": 4.4,
  "ned.1": 4.0,
  "eng.1": 3.9,
  "eng.2": 3.9,
  "ger.1": 3.7,
  "usa.1": 4.1,
  "uefa.champions": 3.8,
  "uefa.europa": 4.2,
};

export function expectedCorners(event: EspnEvent, ratings: LeagueRatings) {
  const g = ratings.avgGoals || 1.36;
  const homeF = teamFactors(ratings.teams[event.home.id], g);
  const awayF = teamFactors(ratings.teams[event.away.id], g);
  // ~10.3 corners a game, ~55% to the home side; attacking sides win more.
  const home = clamp(5.7 * (0.65 + 0.35 * homeF.attack) * (0.8 + 0.2 * awayF.defense), 2, 10);
  const away = clamp(4.6 * (0.65 + 0.35 * awayF.attack) * (0.8 + 0.2 * homeF.defense), 1.5, 9);
  return { home, away, total: home + away };
}

export function expectedCards(event: EspnEvent, ratings: LeagueRatings) {
  const base = CARD_BASELINE[event.league] ?? 4.3;
  const g = ratings.avgGoals || 1.36;
  const homeF = teamFactors(ratings.teams[event.home.id], g);
  const awayF = teamFactors(ratings.teams[event.away.id], g);
  // Tight games between evenly-matched sides draw more cards.
  const gap = Math.abs((homeF.ppg ?? 1.4) - (awayF.ppg ?? 1.4));
  const tightness = clamp(1.12 - gap * 0.09, 0.9, 1.14);
  const total = clamp(base * tightness, 2.2, 7.5);
  // Away teams pick up slightly more cards than hosts.
  return { home: total * 0.46, away: total * 0.54, total };
}

/* ------------------------------------------------------------------ */
/* Pricing helpers                                                     */
/* ------------------------------------------------------------------ */

function price(prob: number, margin: number): number {
  const p = clamp(prob, 0.0015, 0.9985);
  return Math.max(1.01, Math.round((100 / (p * margin))) / 100);
}

function mlToProb(ml: number): number {
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

export type Outcome = { pick: string; label: string; odds: number; sub?: string };
export type MarketGroup = {
  key: string;
  title: string;
  line: number | null;
  outcomes: Outcome[];
  columns: number;
  note?: string;
};

export type MatchMarkets = {
  /** Compact 1X2 for the board card. */
  oneXTwo: { home: number; draw: number; away: number } | null;
  doubleChance: { "1X": number; "12": number; "X2": number } | null;
  overUnder: { line: number; over: number; under: number }[];
  btts: { yes: number; no: number } | null;
  /** Full market catalogue for the event page. */
  groups: MarketGroup[];
  source: "model" | "blended";
  lambdaHome: number;
  lambdaAway: number;
};

/* ------------------------------------------------------------------ */
/* Main pricing                                                        */
/* ------------------------------------------------------------------ */

export function priceMatch(
  event: EspnEvent,
  ratings: LeagueRatings,
  lines: number[] = [2.5],
  opts: { full?: boolean } = {},
): MatchMarkets {
  const finished = event.state === "post" || event.completed;
  const { lambdaHome, lambdaAway } = expectedGoals(event, ratings);
  const empty: MatchMarkets = {
    oneXTwo: null, doubleChance: null, overUnder: [], btts: null,
    groups: [], source: "model", lambdaHome, lambdaAway,
  };
  if (finished) return empty;

  const live = event.state === "in" && event.minute !== null;
  const minute = clamp(event.minute ?? 0, 0, 95);
  if (live && minute >= 90) return empty;

  const remain = live ? clamp((90 - minute) / 90, 0.02, 1) : 1;
  const lh = live ? lambdaHome * remain * 1.06 : lambdaHome;
  const la = live ? lambdaAway * remain * 1.06 : lambdaAway;
  const carryH = live ? event.home.score : 0;
  const carryA = live ? event.away.score : 0;

  /* ---- score matrix ---- */
  const ph: number[] = [];
  const pa: number[] = [];
  for (let i = 0; i <= MAX_GOALS; i++) { ph.push(poisson(i, lh)); pa.push(poisson(i, la)); }

  let pHome = 0, pDraw = 0, pAway = 0, pBtts = 0, pOdd = 0;
  const totalProb = new Map<number, number>();
  const scoreProb = new Map<string, number>();
  const marginProb = new Map<string, number>();
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j];
      if (p < 1e-9) continue;
      const fh = carryH + i, fa = carryA + j;
      if (fh > fa) pHome += p; else if (fh === fa) pDraw += p; else pAway += p;
      if (fh > 0 && fa > 0) pBtts += p;
      const tot = fh + fa;
      if (tot % 2 === 1) pOdd += p;
      totalProb.set(tot, (totalProb.get(tot) ?? 0) + p);
      scoreProb.set(`${fh}-${fa}`, (scoreProb.get(`${fh}-${fa}`) ?? 0) + p);
      const diff = fh - fa;
      const mk = diff === 0 ? "draw" : `${diff > 0 ? "h" : "a"}${Math.min(3, Math.abs(diff))}`;
      marginProb.set(mk, (marginProb.get(mk) ?? 0) + p);
    }
  }

  /* ---- market anchor ---- */
  let source: MatchMarkets["source"] = "model";
  const po = event.providerOdds;
  if (po?.homeML && po?.awayML && po?.drawML && !live) {
    const mh = mlToProb(po.homeML), md = mlToProb(po.drawML), ma = mlToProb(po.awayML);
    const s = mh + md + ma;
    if (s > 0) {
      pHome = pHome * 0.55 + (mh / s) * 0.45;
      pDraw = pDraw * 0.55 + (md / s) * 0.45;
      pAway = pAway * 0.55 + (ma / s) * 0.45;
      source = "blended";
    }
  }

  const over = (line: number) => {
    let under = 0;
    for (const [tot, p] of totalProb) if (tot <= line) under += p;
    return clamp(1 - under, 0.0005, 0.9995);
  };

  const home = event.home.short || event.home.name;
  const away = event.away.short || event.away.name;
  const groups: MarketGroup[] = [];
  const G = (g: MarketGroup) => { if (g.outcomes.length) groups.push(g); };

  /* ---- 1) Match result ---- */
  const oneXTwo = { home: price(pHome, MARGINS.main), draw: price(pDraw, MARGINS.main), away: price(pAway, MARGINS.main) };
  G({ key: "1X2", title: "Match Result", line: null, columns: 3, outcomes: [
    { pick: "home", label: home, sub: "1", odds: oneXTwo.home },
    { pick: "draw", label: "Draw", sub: "X", odds: oneXTwo.draw },
    { pick: "away", label: away, sub: "2", odds: oneXTwo.away },
  ]});

  /* ---- 2) Double chance ---- */
  const doubleChance = {
    "1X": price(pHome + pDraw, MARGINS.main),
    "12": price(pHome + pAway, MARGINS.main),
    X2: price(pDraw + pAway, MARGINS.main),
  };
  G({ key: "DC", title: "Double Chance", line: null, columns: 3, outcomes: [
    { pick: "1X", label: `${home} or Draw`, sub: "1X", odds: doubleChance["1X"] },
    { pick: "12", label: `${home} or ${away}`, sub: "12", odds: doubleChance["12"] },
    { pick: "X2", label: `Draw or ${away}`, sub: "X2", odds: doubleChance.X2 },
  ]});

  /* ---- 3) Draw no bet ---- */
  const dnbDen = pHome + pAway;
  if (dnbDen > 0.05) {
    G({ key: "DNB", title: "Draw No Bet", line: null, columns: 2, note: "Stake returned if the match ends level", outcomes: [
      { pick: "home", label: home, odds: price(pHome / dnbDen, MARGINS.handicap) },
      { pick: "away", label: away, odds: price(pAway / dnbDen, MARGINS.handicap) },
    ]});
  }

  /* ---- 4) Totals ---- */
  const totalLines = opts.full ? [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] : lines;
  const overUnder: MatchMarkets["overUnder"] = [];
  const ouOutcomes: Outcome[] = [];
  for (const line of totalLines) {
    if (live && carryH + carryA > line) continue;
    const pO = over(line);
    if (pO <= 0.012 || pO >= 0.988) continue;
    const o = price(pO, MARGINS.totals), u = price(1 - pO, MARGINS.totals);
    overUnder.push({ line, over: o, under: u });
    ouOutcomes.push({ pick: `over@${line}`, label: `Over ${line.toFixed(1)}`, odds: o });
    ouOutcomes.push({ pick: `under@${line}`, label: `Under ${line.toFixed(1)}`, odds: u });
  }
  for (const ou of overUnder) {
    G({ key: "OU", title: `Total Goals ${ou.line.toFixed(1)}`, line: ou.line, columns: 2, outcomes: [
      { pick: "over", label: `Over ${ou.line.toFixed(1)}`, sub: "Over", odds: ou.over },
      { pick: "under", label: `Under ${ou.line.toFixed(1)}`, sub: "Under", odds: ou.under },
    ]});
  }

  /* ---- 5) BTTS ---- */
  const bttsDecided = live && carryH > 0 && carryA > 0;
  const btts = bttsDecided ? null : { yes: price(pBtts, MARGINS.totals), no: price(1 - pBtts, MARGINS.totals) };
  if (btts) {
    G({ key: "BTTS", title: "Both Teams To Score", line: null, columns: 2, outcomes: [
      { pick: "yes", label: "Yes", odds: btts.yes },
      { pick: "no", label: "No", odds: btts.no },
    ]});
  }

  if (!opts.full) {
    return { oneXTwo, doubleChance, overUnder, btts, groups, source, lambdaHome, lambdaAway };
  }

  /* ---- 6) Odd/Even ---- */
  G({ key: "OE", title: "Total Goals Odd / Even", line: null, columns: 2, outcomes: [
    { pick: "odd", label: "Odd", odds: price(pOdd, MARGINS.oddEven) },
    { pick: "even", label: "Even", odds: price(1 - pOdd, MARGINS.oddEven) },
  ]});

  /* ---- 7) European handicap ---- */
  for (const h of [1, 2]) {
    const outs: Outcome[] = [];
    let hw = 0, dr = 0, aw = 0;
    for (let i = 0; i <= MAX_GOALS; i++) for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j]; if (p < 1e-9) continue;
      const d = (carryH + i - h) - (carryA + j);
      if (d > 0) hw += p; else if (d === 0) dr += p; else aw += p;
    }
    outs.push({ pick: `home-${h}`, label: `${home} -${h}`, odds: price(hw, MARGINS.handicap) });
    outs.push({ pick: `draw-${h}`, label: `Draw -${h}`, odds: price(dr, MARGINS.handicap) });
    outs.push({ pick: `away+${h}`, label: `${away} +${h}`, odds: price(aw, MARGINS.handicap) });
    G({ key: "EH", title: `European Handicap ${home} -${h}`, line: h, columns: 3, outcomes: outs });
  }

  /* ---- 8) Team totals ---- */
  for (const [side, lam, name] of [["home", lh, home], ["away", la, away]] as const) {
    for (const line of [0.5, 1.5, 2.5]) {
      const carry = side === "home" ? carryH : carryA;
      if (live && carry > line) continue;
      const pO = clamp(poissonOver(lam, Math.max(0, line - carry)), 0.005, 0.995);
      G({ key: side === "home" ? "TTH" : "TTA", title: `${name} Total Goals ${line.toFixed(1)}`, line, columns: 2, outcomes: [
        { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.teamTotals) },
        { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.teamTotals) },
      ]});
    }
  }

  /* ---- 9) Clean sheets ---- */
  const csHome = clamp(poisson(0, la), 0.005, 0.995);
  const csAway = clamp(poisson(0, lh), 0.005, 0.995);
  if (!live || carryA === 0) {
    G({ key: "CSH", title: `${home} Clean Sheet`, line: null, columns: 2, outcomes: [
      { pick: "yes", label: "Yes", odds: price(csHome, MARGINS.cleanSheet) },
      { pick: "no", label: "No", odds: price(1 - csHome, MARGINS.cleanSheet) },
    ]});
  }
  if (!live || carryH === 0) {
    G({ key: "CSA", title: `${away} Clean Sheet`, line: null, columns: 2, outcomes: [
      { pick: "yes", label: "Yes", odds: price(csAway, MARGINS.cleanSheet) },
      { pick: "no", label: "No", odds: price(1 - csAway, MARGINS.cleanSheet) },
    ]});
  }

  /* ---- 10) Winning margin ---- */
  const marginOuts: Outcome[] = [];
  const mLabels: [string, string][] = [
    ["h1", `${home} by 1`], ["h2", `${home} by 2`], ["h3", `${home} by 3+`],
    ["draw", "Draw"],
    ["a1", `${away} by 1`], ["a2", `${away} by 2`], ["a3", `${away} by 3+`],
  ];
  for (const [k, label] of mLabels) {
    const p = marginProb.get(k) ?? 0;
    if (p > 0.004) marginOuts.push({ pick: k, label, odds: price(p, MARGINS.margin) });
  }
  G({ key: "WM", title: "Winning Margin", line: null, columns: 3, outcomes: marginOuts });

  /* ---- 11) Total goals bands ---- */
  const band = (lo: number, hi: number) => {
    let s = 0;
    for (const [tot, p] of totalProb) if (tot >= lo && tot <= hi) s += p;
    return s;
  };
  G({ key: "GR", title: "Total Goals Range", line: null, columns: 4, outcomes: [
    { pick: "0-1", label: "0 – 1", odds: price(band(0, 1), MARGINS.range) },
    { pick: "2-3", label: "2 – 3", odds: price(band(2, 3), MARGINS.range) },
    { pick: "4-6", label: "4 – 6", odds: price(band(4, 6), MARGINS.range) },
    { pick: "7+", label: "7+", odds: price(band(7, 99), MARGINS.range) },
  ]});

  /* ---- 12) Correct score ---- */
  if (!live) {
    const scores = [...scoreProb.entries()]
      .filter(([, p]) => p > 0.004)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);
    const csOuts: Outcome[] = scores.map(([s, p]) => ({
      pick: s, label: s.replace("-", " – "), odds: price(p, MARGINS.correctScore),
    }));
    G({ key: "CS", title: "Correct Score", line: null, columns: 4,
      note: "Or type any exact scoreline to have it priced instantly", outcomes: csOuts });
  }

  /* ---- 13) Half-time markets ---- */
  if (!live || minute < 45) {
    const hlh = lh * 0.45, hla = la * 0.45;
    let h1 = 0, d1 = 0, a1 = 0;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
      const p = poisson(i, hlh) * poisson(j, hla);
      if (i > j) h1 += p; else if (i === j) d1 += p; else a1 += p;
    }
    G({ key: "1H1X2", title: "First Half Result", line: null, columns: 3, outcomes: [
      { pick: "home", label: home, sub: "1", odds: price(h1, MARGINS.halves) },
      { pick: "draw", label: "Draw", sub: "X", odds: price(d1, MARGINS.halves) },
      { pick: "away", label: away, sub: "2", odds: price(a1, MARGINS.halves) },
    ]});
    for (const line of [0.5, 1.5, 2.5]) {
      const pO = poissonOver(hlh + hla, line);
      G({ key: "1HOU", title: `First Half Goals ${line.toFixed(1)}`, line, columns: 2, outcomes: [
        { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.halves) },
        { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.halves) },
      ]});
    }
    /* HT/FT */
    const htftOuts: Outcome[] = [];
    const codes: [string, string, number][] = [
      ["H/H", `${home} / ${home}`, h1], ["H/D", `${home} / Draw`, h1], ["H/A", `${home} / ${away}`, h1],
      ["D/H", `Draw / ${home}`, d1], ["D/D", "Draw / Draw", d1], ["D/A", `Draw / ${away}`, d1],
      ["A/H", `${away} / ${home}`, a1], ["A/D", `${away} / Draw`, a1], ["A/A", `${away} / ${away}`, a1],
    ];
    for (const [code, label, pHT] of codes) {
      const ft = code.split("/")[1];
      const pFT = ft === "H" ? pHome : ft === "D" ? pDraw : pAway;
      // Correlated: leading at the break raises that side's FT chance.
      const lead = code[0];
      const boost = lead === ft ? 1.85 : lead === "D" ? 0.95 : 0.32;
      const p = clamp(pHT * pFT * boost, 0.002, 0.9);
      htftOuts.push({ pick: code, label, odds: price(p, MARGINS.htft) });
    }
    G({ key: "HTFT", title: "Half Time / Full Time", line: null, columns: 3, outcomes: htftOuts });
  }

  /* ---- 14) Second half goals ---- */
  {
    const s2h = live && minute >= 45 ? lh + la : (lh + la) * 0.55;
    for (const line of [0.5, 1.5, 2.5]) {
      const pO = poissonOver(s2h, line);
      if (pO < 0.01 || pO > 0.99) continue;
      G({ key: "2HOU", title: `Second Half Goals ${line.toFixed(1)}`, line, columns: 2, outcomes: [
        { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.halves) },
        { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.halves) },
      ]});
    }
  }

  /* ---- 15) CORNERS ---- */
  {
    const c = expectedCorners(event, ratings);
    const scale = live ? remain : 1;
    const tot = c.total * scale;
    if (tot > 1.5) {
      for (const line of [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]) {
        const pO = poissonOver(tot, line);
        if (pO < 0.02 || pO > 0.98) continue;
        G({ key: "CRN", title: `Total Corners ${line.toFixed(1)}`, line, columns: 2, outcomes: [
          { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.corners) },
          { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.corners) },
        ]});
      }
      if (!live || minute < 45) {
        for (const line of [3.5, 4.5, 5.5]) {
          const pO = poissonOver(c.total * 0.46, line);
          G({ key: "CRN1H", title: `First Half Corners ${line.toFixed(1)}`, line, columns: 2, outcomes: [
            { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.corners) },
            { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.corners) },
          ]});
        }
      }
      for (const line of [4.5, 5.5, 6.5]) {
        const pO = poissonOver(c.total * (live && minute >= 45 ? scale : 0.54), line);
        if (pO < 0.02 || pO > 0.98) continue;
        G({ key: "CRN2H", title: `Second Half Corners ${line.toFixed(1)}`, line, columns: 2, outcomes: [
          { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.corners) },
          { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.corners) },
        ]});
      }
      let ch = 0, cd = 0, ca = 0;
      for (let i = 0; i <= 18; i++) for (let j = 0; j <= 18; j++) {
        const p = poisson(i, c.home) * poisson(j, c.away);
        if (i > j) ch += p; else if (i === j) cd += p; else ca += p;
      }
      G({ key: "CRN3W", title: "Most Corners", line: null, columns: 3, outcomes: [
        { pick: "home", label: home, sub: "1", odds: price(ch, MARGINS.corners) },
        { pick: "draw", label: "Equal", sub: "X", odds: price(cd, MARGINS.corners) },
        { pick: "away", label: away, sub: "2", odds: price(ca, MARGINS.corners) },
      ]});
    }
  }

  /* ---- 16) CARDS ---- */
  {
    const cd = expectedCards(event, ratings);
    const scale = live ? remain : 1;
    const tot = cd.total * scale;
    if (tot > 0.8) {
      for (const line of [1.5, 2.5, 3.5, 4.5, 5.5, 6.5]) {
        const pO = poissonOver(tot, line);
        if (pO < 0.02 || pO > 0.98) continue;
        G({ key: "CRD", title: `Total Cards ${line.toFixed(1)}`, line, columns: 2, outcomes: [
          { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.cards) },
          { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.cards) },
        ]});
      }
      if (!live || minute < 45) {
        for (const line of [0.5, 1.5, 2.5]) {
          const pO = poissonOver(cd.total * 0.4, line);
          G({ key: "CRD1H", title: `First Half Cards ${line.toFixed(1)}`, line, columns: 2, outcomes: [
            { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.cards) },
            { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.cards) },
          ]});
        }
      }
      for (const line of [1.5, 2.5, 3.5] ) {
        const pO = poissonOver(cd.total * (live && minute >= 45 ? scale : 0.6), line);
        if (pO < 0.02 || pO > 0.98) continue;
        G({ key: "CRD2H", title: `Second Half Cards ${line.toFixed(1)}`, line, columns: 2, outcomes: [
          { pick: "over", label: `Over ${line.toFixed(1)}`, sub: "Over", odds: price(pO, MARGINS.cards) },
          { pick: "under", label: `Under ${line.toFixed(1)}`, sub: "Under", odds: price(1 - pO, MARGINS.cards) },
        ]});
      }
      let kh = 0, kd = 0, ka = 0;
      for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
        const p = poisson(i, cd.home) * poisson(j, cd.away);
        if (i > j) kh += p; else if (i === j) kd += p; else ka += p;
      }
      G({ key: "CRD3W", title: "Most Cards", line: null, columns: 3, outcomes: [
        { pick: "home", label: home, sub: "1", odds: price(kh, MARGINS.cards) },
        { pick: "draw", label: "Equal", sub: "X", odds: price(kd, MARGINS.cards) },
        { pick: "away", label: away, sub: "2", odds: price(ka, MARGINS.cards) },
      ]});
    }
  }

  return { oneXTwo, doubleChance, overUnder, btts, groups, source, lambdaHome, lambdaAway };
}

/** Price an arbitrary correct score on demand (for the typed input). */
export function priceCorrectScore(
  event: EspnEvent, ratings: LeagueRatings, h: number, a: number,
): number | null {
  if (h < 0 || a < 0 || h > 12 || a > 12) return null;
  const { lambdaHome, lambdaAway } = expectedGoals(event, ratings);
  const p = poisson(h, lambdaHome) * poisson(a, lambdaAway);
  return price(p, MARGINS.correctScore);
}

/* ------------------------------------------------------------------ */
/* Quote lookup                                                        */
/* ------------------------------------------------------------------ */

export function quoteFor(
  markets: MatchMarkets, market: string, line: number | null, pick: string,
): number | null {
  const g = markets.groups.find(
    (x) => x.key === market && (x.line ?? null) === (line ?? null),
  );
  const found = g?.outcomes.find((o) => o.pick === pick);
  if (found) return found.odds;
  // Fallbacks for the compact board card.
  if (market === "1X2" && markets.oneXTwo) return markets.oneXTwo[pick as "home" | "draw" | "away"] ?? null;
  if (market === "DC" && markets.doubleChance) return markets.doubleChance[pick as "1X" | "12" | "X2"] ?? null;
  if (market === "BTTS" && markets.btts) return markets.btts[pick as "yes" | "no"] ?? null;
  if (market === "OU") {
    const ou = markets.overUnder.find((o) => o.line === line);
    if (ou) return pick === "over" ? ou.over : pick === "under" ? ou.under : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Settlement                                                          */
/* ------------------------------------------------------------------ */

export type MatchResult = {
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
  goals2H: number | null;
  scorerIds: string[];
  firstScorerId: string | null;
};

type Grade = "won" | "lost" | "void";

const ou = (value: number | null, line: number | null, pick: string): Grade => {
  if (value === null || line === null) return "void";
  if (value === line) return "void";
  const isOver = value > line;
  return (pick === "over") === isOver ? "won" : "lost";
};

const threeWay = (h: number | null, a: number | null, pick: string): Grade => {
  if (h === null || a === null) return "void";
  const res = h > a ? "home" : h === a ? "draw" : "away";
  return pick === res ? "won" : "lost";
};

/** Grade a placed selection against the finished match's full stat line. */
export function gradeSelection(
  market: string, line: number | null, pick: string, r: MatchResult,
): Grade {
  const H = r.homeScore, A = r.awayScore, T = H + A;

  switch (market) {
    case "1X2": return threeWay(H, A, pick);
    case "DC": {
      const res = H > A ? "home" : H === A ? "draw" : "away";
      if (pick === "1X") return res !== "away" ? "won" : "lost";
      if (pick === "12") return res !== "draw" ? "won" : "lost";
      return res !== "home" ? "won" : "lost";
    }
    case "DNB":
      if (H === A) return "void";
      return (pick === "home") === (H > A) ? "won" : "lost";
    case "OU": return ou(T, line, pick);
    case "BTTS": {
      const both = H > 0 && A > 0;
      return (pick === "yes") === both ? "won" : "lost";
    }
    case "OE": return (T % 2 === 1) === (pick === "odd") ? "won" : "lost";
    case "EH": {
      const h = line ?? 1;
      const d = H - h - A;
      const res = d > 0 ? `home-${h}` : d === 0 ? `draw-${h}` : `away+${h}`;
      return pick === res ? "won" : "lost";
    }
    case "TTH": return ou(H, line, pick);
    case "TTA": return ou(A, line, pick);
    case "CSH": return (A === 0) === (pick === "yes") ? "won" : "lost";
    case "CSA": return (H === 0) === (pick === "yes") ? "won" : "lost";
    case "WM": {
      const d = H - A;
      const key = d === 0 ? "draw" : `${d > 0 ? "h" : "a"}${Math.min(3, Math.abs(d))}`;
      return pick === key ? "won" : "lost";
    }
    case "GR": {
      const inBand =
        pick === "0-1" ? T <= 1 : pick === "2-3" ? T >= 2 && T <= 3 :
        pick === "4-6" ? T >= 4 && T <= 6 : T >= 7;
      return inBand ? "won" : "lost";
    }
    case "CS":
      return pick === `${H}-${A}` ? "won" : "lost";
    case "1H1X2": return threeWay(r.htHome, r.htAway, pick);
    case "1HOU":
      return r.htHome === null || r.htAway === null ? "void" : ou(r.htHome + r.htAway, line, pick);
    case "2HOU": {
      if (r.htHome === null || r.htAway === null) return "void";
      return ou(T - (r.htHome + r.htAway), line, pick);
    }
    case "HTFT": {
      if (r.htHome === null || r.htAway === null) return "void";
      const ht = r.htHome > r.htAway ? "H" : r.htHome === r.htAway ? "D" : "A";
      const ft = H > A ? "H" : H === A ? "D" : "A";
      return pick === `${ht}/${ft}` ? "won" : "lost";
    }
    case "CRN": {
      if (r.cornersHome === null || r.cornersAway === null) return "void";
      return ou(r.cornersHome + r.cornersAway, line, pick);
    }
    case "CRN1H": return ou(r.corners1H, line, pick);
    case "CRN2H": return ou(r.corners2H, line, pick);
    case "CRN3W": return threeWay(r.cornersHome, r.cornersAway, pick);
    case "CRD": {
      if (r.cardsHome === null || r.cardsAway === null) return "void";
      return ou(r.cardsHome + r.cardsAway, line, pick);
    }
    case "CRD1H": return ou(r.cards1H, line, pick);
    case "CRD2H": return ou(r.cards2H, line, pick);
    case "CRD3W": return threeWay(r.cardsHome, r.cardsAway, pick);
    case "AGS":
      if (r.scorerIds.length === 0 && T > 0) return "void";
      return r.scorerIds.includes(pick) ? "won" : "lost";
    case "FGS":
      if (!r.firstScorerId && T > 0) return "void";
      if (pick === "noscorer") return T === 0 ? "won" : "lost";
      return r.firstScorerId === pick ? "won" : "lost";
    default:
      return "void";
  }
}

/** Human label for a stored selection. */
export const MARKET_LABELS: Record<string, string> = {
  "1X2": "Match Result", DC: "Double Chance", DNB: "Draw No Bet", OU: "Total Goals",
  BTTS: "Both Teams To Score", OE: "Odd/Even", EH: "European Handicap",
  TTH: "Home Team Total", TTA: "Away Team Total", CSH: "Home Clean Sheet",
  CSA: "Away Clean Sheet", WM: "Winning Margin", GR: "Goals Range", CS: "Correct Score",
  "1H1X2": "First Half Result", "1HOU": "First Half Goals", "2HOU": "Second Half Goals",
  HTFT: "Half Time / Full Time", CRN: "Total Corners", CRN1H: "First Half Corners",
  CRN2H: "Second Half Corners", CRN3W: "Most Corners", CRD: "Total Cards",
  CRD1H: "First Half Cards", CRD2H: "Second Half Cards", CRD3W: "Most Cards",
  AGS: "Anytime Goalscorer", FGS: "First Goalscorer",
};

export function pickLabel(
  market: string, line: number | null, pick: string, home: string, away: string,
): string {
  const L = line !== null ? line.toFixed(1) : "";
  switch (market) {
    case "1X2": case "1H1X2": case "CRN3W": case "CRD3W":
      return pick === "home" ? home : pick === "away" ? away : market === "1X2" || market === "1H1X2" ? "Draw" : "Equal";
    case "DC":
      return pick === "1X" ? `${home} or Draw` : pick === "12" ? `${home} or ${away}` : `Draw or ${away}`;
    case "DNB": return `${pick === "home" ? home : away} (draw no bet)`;
    case "OU": return `${pick === "over" ? "Over" : "Under"} ${L} goals`;
    case "BTTS": return `Both teams to score — ${pick === "yes" ? "Yes" : "No"}`;
    case "OE": return `Total goals ${pick}`;
    case "EH": return pick.startsWith("home") ? `${home} -${line}` : pick.startsWith("away") ? `${away} +${line}` : `Draw (-${line})`;
    case "TTH": return `${home} ${pick} ${L}`;
    case "TTA": return `${away} ${pick} ${L}`;
    case "CSH": return `${home} clean sheet — ${pick}`;
    case "CSA": return `${away} clean sheet — ${pick}`;
    case "WM": return pick === "draw" ? "Draw" : `${pick[0] === "h" ? home : away} by ${pick[1]}${pick[1] === "3" ? "+" : ""}`;
    case "GR": return `${pick} goals`;
    case "CS": return pick === "other" ? "Any other score" : `Correct score ${pick}`;
    case "1HOU": return `1st half ${pick} ${L} goals`;
    case "2HOU": return `2nd half ${pick} ${L} goals`;
    case "HTFT": return `HT/FT ${pick}`;
    case "CRN": return `${pick} ${L} corners`;
    case "CRN1H": return `1st half ${pick} ${L} corners`;
    case "CRN2H": return `2nd half ${pick} ${L} corners`;
    case "CRD": return `${pick} ${L} cards`;
    case "CRD1H": return `1st half ${pick} ${L} cards`;
    case "CRD2H": return `2nd half ${pick} ${L} cards`;
    default: return pick;
  }
}
