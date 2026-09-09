export type LeagueDef = {
  slug: string;
  name: string;
  country: string;
  short: string;
};

export const LEAGUES: LeagueDef[] = [
  { slug: "eng.1", name: "Premier League", country: "England", short: "EPL" },
  { slug: "esp.1", name: "LaLiga", country: "Spain", short: "LAL" },
  { slug: "ger.1", name: "Bundesliga", country: "Germany", short: "BUN" },
  { slug: "ita.1", name: "Serie A", country: "Italy", short: "SEA" },
  { slug: "fra.1", name: "Ligue 1", country: "France", short: "LG1" },
  { slug: "uefa.champions", name: "Champions League", country: "Europe", short: "UCL" },
  { slug: "uefa.europa", name: "Europa League", country: "Europe", short: "UEL" },
  { slug: "ned.1", name: "Eredivisie", country: "Netherlands", short: "ERE" },
  { slug: "por.1", name: "Primeira Liga", country: "Portugal", short: "POR" },
  { slug: "eng.2", name: "Championship", country: "England", short: "CHA" },
  { slug: "usa.1", name: "MLS", country: "USA", short: "MLS" },
];

export const FEATURED_LEAGUES = [
  "eng.1",
  "esp.1",
  "ger.1",
  "ita.1",
  "fra.1",
  "uefa.champions",
  "uefa.europa",
];

export function leagueName(slug: string): string {
  return LEAGUES.find((l) => l.slug === slug)?.name ?? slug;
}

/** How the house prices events — shared blurb for UI + manual. */
export const ODDS_ENGINE_FACTORS = [
  "Team strength — attack & defence ratings from season goals for/against vs league average",
  "Morale — recent form (last five results: W/D/L) when supplied by ESPN standings",
  "Venue — home-pitch advantage calibrated from league scoring baselines",
  "Market anchor — blended with ESPN's listed bookmaker odds when available",
  "Live state — scoreline, minute and remaining-time decay for in-play pricing",
  "Margin — a fixed ~6% overround so prices behave like a real bookmaker's",
];
