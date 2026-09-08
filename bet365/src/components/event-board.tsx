"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BrainCircuit, Sigma, HeartPulse, Landmark, Scale } from "lucide-react";
import type { MatchDTO } from "./match-card";
import { TeamCrest } from "./match-card";
import { OddsButton } from "./odds-button";
import { useBetSlip, slipKey } from "@/lib/store";
import { useUser, useToast } from "./providers";

type Factors = {
  home: SideFactors;
  away: SideFactors;
  venueEdge: number;
  lambdaHome: number;
  lambdaAway: number;
  leagueBaseline: number;
};
type SideFactors = {
  attack: number;
  defense: number;
  morale: number;
  ppg: number | null;
  form: string | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  played: number | null;
};

export function EventBoard({ id, league }: { id: string; league: string }) {
  const [match, setMatch] = useState<MatchDTO | null>(null);
  const [factors, setFactors] = useState<Factors | null>(null);
  const [missing, setMissing] = useState(false);
  const { toggle, items } = useBetSlip();
  const { user } = useUser();
  const { toast } = useToast();
  const activeKeys = useMemo(() => new Set(items.map((i) => i.key)), [items]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/event/${id}?league=${encodeURIComponent(league)}`, { cache: "no-store" });
      if (res.status === 404) { setMissing(true); return; }
      const data = await res.json();
      setMatch(data.match ?? null);
      setFactors(data.factors ?? null);
    } catch { /* keep */ }
  }, [id, league]);

  useEffect(() => {
    load();
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [load]);

  if (missing)
    return (
      <div className="rounded-2xl border border-dashed border-line py-20 text-center text-sm text-mute">
        This fixture has expired from the feed.{" "}
        <Link href="/" className="text-gold hover:underline">Back to the board</Link>
      </div>
    );

  if (!match) {
    return (
      <div className="flex flex-col gap-3">
        <div className="skeleton h-40 rounded-2xl border border-line" />
        <div className="skeleton h-28 rounded-2xl border border-line" />
        <div className="skeleton h-28 rounded-2xl border border-line" />
      </div>
    );
  }

  const live = match.state === "in";
  const post = match.state === "post";
  const m = match.markets;

  const add = (market: string, line: number | null, pick: string, label: string, odds: number) => {
    if (!user) {
      toast({ title: "Sign in required", body: "Create a free virtual account to place bets.", tone: "info" });
      return;
    }
    toggle({ eventId: match.id, league: match.league, home: match.home.name, away: match.away.name,
      startsAt: match.startsAt, live, market, line, pick, label, odds });
  };
  const isActive = (market: string, line: number | null, pick: string) =>
    activeKeys.has(slipKey({ eventId: match.id, market, line, pick }));

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/league/${encodeURIComponent(match.league)}`}
        className="flex w-fit items-center gap-1.5 text-[12px] font-semibold text-mute transition-colors hover:text-gold">
        <ArrowLeft size={13} /> {match.leagueName}
      </Link>

      {/* Scoreboard hero */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-30%,rgba(227,195,107,0.12),transparent_60%)]" />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-7 sm:px-10">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <TeamCrest logo={match.home.logo} abbr={match.home.abbr} />
            <span className="text-[14px] font-semibold text-cream sm:text-base">{match.home.short}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            {post ? (
              <>
                <span className="tnum text-4xl font-bold text-cream">{match.home.score} – {match.away.score}</span>
                <span className="rounded-full bg-lift px-2.5 py-0.5 text-[10.5px] font-bold tracking-wider text-mute uppercase">Full time</span>
              </>
            ) : live ? (
              <>
                <span className="tnum text-4xl font-bold text-gold">{match.home.score} – {match.away.score}</span>
                <span className="flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-0.5 text-[10.5px] font-bold tracking-wider text-live uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-dot" />
                  {match.minute !== null ? `${match.minute}'` : "Live"}
                </span>
              </>
            ) : (
              <>
                <span className="tnum text-2xl font-bold text-cream">
                  {new Date(match.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-[11.5px] font-medium text-mute">
                  {new Date(match.startsAt).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-col items-center gap-2.5 text-center">
            <TeamCrest logo={match.away.logo} abbr={match.away.abbr} />
            <span className="text-[14px] font-semibold text-cream sm:text-base">{match.away.short}</span>
          </div>
        </div>
        {match.venue && (
          <p className="relative border-t border-line px-5 py-2 text-center text-[11px] text-faint">{match.venue}</p>
        )}
      </section>

      {post ? (
        <p className="rounded-xl border border-line bg-panel px-4 py-3 text-center text-[12.5px] text-mute">
          Betting is closed — this fixture has finished.
        </p>
      ) : (
        <>
          {/* 1X2 */}
          <Market title="Match Result" note="1X2">
            {m.oneXTwo ? (
              <div className="grid grid-cols-3 gap-2">
                <OddsButton sub="Home" label={match.home.short} odds={m.oneXTwo.home}
                  active={isActive("1X2", null, "home")}
                  onClick={() => add("1X2", null, "home", match.home.name, m.oneXTwo!.home)} />
                <OddsButton sub="Draw" label="X" odds={m.oneXTwo.draw}
                  active={isActive("1X2", null, "draw")}
                  onClick={() => add("1X2", null, "draw", "Draw", m.oneXTwo!.draw)} />
                <OddsButton sub="Away" label={match.away.short} odds={m.oneXTwo.away}
                  active={isActive("1X2", null, "away")}
                  onClick={() => add("1X2", null, "away", match.away.name, m.oneXTwo!.away)} />
              </div>
            ) : <Suspended />}
          </Market>

          {/* Double chance */}
          <Market title="Double Chance" note="DC">
            {m.doubleChance ? (
              <div className="grid grid-cols-3 gap-2">
                <OddsButton sub="Home or Draw" label="1X" odds={m.doubleChance["1X"]}
                  active={isActive("DC", null, "1X")}
                  onClick={() => add("DC", null, "1X", "Home or Draw", m.doubleChance!["1X"])} />
                <OddsButton sub="Home or Away" label="12" odds={m.doubleChance["12"]}
                  active={isActive("DC", null, "12")}
                  onClick={() => add("DC", null, "12", "Home or Away", m.doubleChance!["12"])} />
                <OddsButton sub="Draw or Away" label="X2" odds={m.doubleChance["X2"]}
                  active={isActive("DC", null, "X2")}
                  onClick={() => add("DC", null, "X2", "Draw or Away", m.doubleChance!["X2"])} />
              </div>
            ) : <Suspended />}
          </Market>

          {/* Totals */}
          <Market title="Total Goals" note="Over / Under">
            {m.overUnder.length > 0 ? (
              <div className="flex flex-col gap-2">
                {m.overUnder.map((ou) => (
                  <div key={ou.line} className="grid grid-cols-[64px_1fr_1fr] items-center gap-2">
                    <span className="tnum rounded-md bg-lift px-2 py-2 text-center text-[12px] font-bold text-mute">
                      {ou.line.toFixed(1)}
                    </span>
                    <OddsButton sub="Over" odds={ou.over}
                      active={isActive("OU", ou.line, "over")}
                      onClick={() => add("OU", ou.line, "over", `Over ${ou.line} goals`, ou.over)} />
                    <OddsButton sub="Under" odds={ou.under}
                      active={isActive("OU", ou.line, "under")}
                      onClick={() => add("OU", ou.line, "under", `Under ${ou.line} goals`, ou.under)} />
                  </div>
                ))}
              </div>
            ) : <Suspended />}
          </Market>

          {/* BTTS */}
          <Market title="Both Teams To Score" note="BTTS">
            {m.btts ? (
              <div className="grid grid-cols-2 gap-2">
                <OddsButton sub="Yes" odds={m.btts.yes}
                  active={isActive("BTTS", null, "yes")}
                  onClick={() => add("BTTS", null, "yes", "Both teams to score — Yes", m.btts!.yes)} />
                <OddsButton sub="No" odds={m.btts.no}
                  active={isActive("BTTS", null, "no")}
                  onClick={() => add("BTTS", null, "no", "Both teams to score — No", m.btts!.no)} />
              </div>
            ) : <Suspended />}
          </Market>
        </>
      )}

      {/* Odds transparency */}
      {factors && (
        <section className="rounded-2xl border border-gold/15 bg-panel p-5">
          <header className="flex items-center gap-2">
            <BrainCircuit size={15} className="text-gold" />
            <h3 className="font-display text-[16px] font-semibold text-cream">How these odds were calculated</h3>
          </header>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">
            No randomness — a Poisson goal model reads each side&apos;s season data and current form,
            then applies home advantage and the house margin. {m.source === "blended" ? "These quotes are also anchored to ESPN-listed market odds." : ""}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FactorChip icon={Sigma} label="Expected goals" value={`${factors.lambdaHome.toFixed(2)} – ${factors.lambdaAway.toFixed(2)}`} sub="home – away" />
            <FactorChip icon={Landmark} label="Venue edge" value={`${Math.round(factors.venueEdge * 100)}%`} sub="of league goals scored at home" />
            <FactorChip icon={Scale} label="League baseline" value={factors.leagueBaseline.toFixed(2)} sub="avg goals / team / match" />
            <SideFactor team={match.home.short} f={factors.home} />
            <SideFactor team={match.away.short} f={factors.away} />
            <FactorChip icon={HeartPulse} label="Margin" value="~6%" sub="three-way overround" />
          </div>
        </section>
      )}
    </div>
  );
}

function Market({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13.5px] font-bold tracking-wide text-cream">{title}</h3>
        <span className="text-[10px] font-bold tracking-[0.18em] text-faint uppercase">{note}</span>
      </header>
      {children}
    </section>
  );
}

const Suspended = () => (
  <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-center text-[11.5px] tracking-wide text-faint uppercase">
    Suspended
  </p>
);

function FactorChip({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-raise p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-faint uppercase">
        <Icon size={11} /> {label}
      </div>
      <p className="tnum mt-1 text-[15px] font-bold text-gold">{value}</p>
      <p className="text-[10.5px] text-faint">{sub}</p>
    </div>
  );
}

function SideFactor({ team, f }: { team: string; f: SideFactors }) {
  return (
    <div className="rounded-xl border border-line bg-raise p-3">
      <div className="text-[10px] font-bold tracking-wider text-faint uppercase">{team}</div>
      <p className="tnum mt-1 text-[13px] font-bold text-cream">
        ATK <span className="text-gold">{f.attack.toFixed(2)}</span> · DEF{" "}
        <span className="text-gold">{f.defense.toFixed(2)}</span>
      </p>
      <p className="mt-0.5 text-[10.5px] text-faint">
        {f.ppg !== null ? `${f.ppg.toFixed(2)} pts/game` : "insufficient data"}
        {f.form ? ` · form ${f.form}` : ""}
        {f.goalsFor !== null ? ` · ${f.goalsFor}GF ${f.goalsAgainst}GA` : ""}
      </p>
    </div>
  );
}
