import { getLeagueRatings, type EspnEvent } from "./espn";
import { priceMatch, type MatchMarkets, type TeamFactors } from "./odds";
import { expectedGoals } from "./odds";
import { leagueName } from "./constants";

/** Serialize an ESPN fixture + priced markets into the client DTO. */
export function matchToDTO(
  event: EspnEvent,
  markets: MatchMarkets,
) {
  return {
    id: event.id,
    league: event.league,
    leagueName: leagueName(event.league),
    name: event.name,
    startsAt: event.startsAt,
    state: event.state,
    detail: event.detail,
    minute: event.minute,
    venue: event.venue,
    home: {
      id: event.home.id,
      name: event.home.name,
      short: event.home.short || event.home.name,
      abbr: event.home.abbr,
      logo: event.home.logo,
      score: event.home.score,
    },
    away: {
      id: event.away.id,
      name: event.away.name,
      short: event.away.short || event.away.name,
      abbr: event.away.abbr,
      logo: event.away.logo,
      score: event.away.score,
    },
    markets,
  };
}

export async function priceEvent(event: EspnEvent, lines: number[] = [2.5]) {
  const ratings = await getLeagueRatings(event.league);
  return priceMatch(event, ratings, lines);
}

export async function priceEventWithFactors(event: EspnEvent, lines: number[] = [1.5, 2.5, 3.5]) {
  const ratings = await getLeagueRatings(event.league);
  const markets = priceMatch(event, ratings, lines);
  const { lambdaHome, lambdaAway, homeF, awayF } = expectedGoals(event, ratings);
  const factor = (fInput: TeamFactors, rating: (typeof ratings.teams)[string] | undefined) => ({
    attack: Math.round(fInput.attack * 100) / 100,
    defense: Math.round(fInput.defense * 100) / 100,
    morale: Math.round(fInput.morale * 100) / 100,
    ppg: fInput.ppg === null ? null : Math.round(fInput.ppg * 100) / 100,
    form: fInput.formString,
    goalsFor: rating?.gf ?? null,
    goalsAgainst: rating?.ga ?? null,
    played: rating?.gp ?? null,
  });
  return {
    markets,
    factors: {
      home: factor(homeF, ratings.teams[event.home.id]),
      away: factor(awayF, ratings.teams[event.away.id]),
      venueEdge: 0.572,
      lambdaHome: Math.round(lambdaHome * 100) / 100,
      lambdaAway: Math.round(lambdaAway * 100) / 100,
      leagueBaseline: Math.round(ratings.avgGoals * 100) / 100,
    },
  };
}
