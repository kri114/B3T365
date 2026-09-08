"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, BrainCircuit, Sigma, HeartPulse, Landmark, Scale,
  ChevronDown, Search, Flag, RectangleVertical, Target, Users,
} from "lucide-react";
import { FollowButton } from "./follow-button";
import { MatchDetailPanels } from "./match-detail-panels";
import clsx from "clsx";
import type { MatchDTO } from "./match-card";
import { TeamCrest } from "./match-card";
import { OddsButton } from "./odds-button";
import { useBetSlip, slipKey } from "@/lib/store";
import { useUser, useToast } from "./providers";

type Outcome = { pick: string; label: string; odds: number; sub?: string };
type MarketGroup = {
  key: string; title: string; line: number | null;
  outcomes: Outcome[]; columns: number; note?: string;
};
type SideFactors = {
  attack: number; defense: number; morale: number; ppg: number | null;
  form: string | null; goalsFor: number | null; goalsAgainst: number | null; played: number | null;
};
type Factors = {
  home: SideFactors; away: SideFactors; venueEdge: number;
  lambdaHome: number; lambdaAway: number; leagueBaseline: number;
  expectedCorners?: number; expectedCards?: number;
};

/** Tabs group the ~30 markets into digestible sections. */
const SECTIONS = [
  { id: "info", label: "Lineups & Stats", icon: Users, keys: [] as string[] },
  { id: "popular", label: "Popular", icon: Target, keys: ["1X2", "DC", "OU", "BTTS", "DNB"] },
  { id: "goals", label: "Goals", icon: Sigma, keys: ["OE", "TTH", "TTA", "GR", "WM", "CSH", "CSA", "EH"] },
  { id: "halves", label: "Halves", icon: Scale, keys: ["1H1X2", "1HOU", "2HOU", "HTFT"] },
  { id: "score", label: "Correct Score", icon: Target, keys: ["CS"] },
  { id: "scorers", label: "Goalscorers", icon: Target, keys: ["AGS", "FGS"] },
  { id: "corners", label: "Corners", icon: Flag, keys: ["CRN", "CRN1H", "CRN2H", "CRN3W"] },
  { id: "cards", label: "Cards", icon: RectangleVertical, keys: ["CRD", "CRD1H", "CRD2H", "CRD3W"] },
] satisfies { id: string; label: string; icon: React.ElementType; keys: string[] }[];

export function EventBoard({ id, league }: { id: string; league: string }) {
  const [match, setMatch] = useState<MatchDTO & { markets: { groups: MarketGroup[]; source: string } } | null>(null);
  const [factors, setFactors] = useState<Factors | null>(null);
  const [missing, setMissing] = useState(false);
  const [section, setSection] = useState<string>("popular");
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
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const add = useCallback((market: string, line: number | null, pick: string, label: string, odds: number) => {
    if (!match) return;
    if (!user) {
      toast({ title: "Sign in required", body: "Create a free virtual account to place bets.", tone: "info" });
      return;
    }
    toggle({
      eventId: match.id, league: match.league, home: match.home.name, away: match.away.name,
      startsAt: match.startsAt, live: match.state === "in", market, line, pick, label, odds,
    });
  }, [match, user, toast, toggle]);

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
      </div>
    );
  }

  const live = match.state === "in";
  const post = match.state === "post";
  const groups = match.markets.groups ?? [];
  const isActive = (market: string, line: number | null, pick: string) =>
    activeKeys.has(slipKey({ eventId: match.id, market, line, pick }));

  const available = SECTIONS.filter(
    (s) => s.id === "info" || groups.some((g) => s.keys.includes(g.key)),
  );
  const current = available.find((s) => s.id === section) ?? available[0];
  const visible =
    current && current.id !== "info" ? groups.filter((g) => current.keys.includes(g.key)) : [];

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/league/${encodeURIComponent(match.league)}`}
        className="flex w-fit items-center gap-1.5 text-[12px] font-semibold text-mute transition-colors hover:text-gold">
        <ArrowLeft size={13} /> {match.leagueName}
      </Link>

      {/* Scoreboard */}
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
        <div className="relative flex items-center justify-between gap-3 border-t border-line px-5 py-2.5">
          <p className="truncate text-[11px] text-faint">{match.venue ?? ""}</p>
          <FollowButton
            eventId={match.id}
            league={match.league}
            homeTeam={match.home.name}
            awayTeam={match.away.name}
            startsAt={match.startsAt}
          />
        </div>
      </section>

      {post || groups.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel px-4 py-3 text-center text-[12.5px] text-mute">
          {post ? "Betting is closed — this fixture has finished." : "Markets are being priced…"}
        </p>
      ) : (
        <>
          {/* Section tabs */}
          <div className="sticky top-14 z-20 -mx-3 flex gap-1.5 overflow-x-auto border-y border-line bg-ink/90 px-3 py-2 backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border">
            {available.map(({ id: sid, label, icon: Icon }) => (
              <button key={sid} onClick={() => setSection(sid)}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors",
                  current?.id === sid ? "border-gold/40 bg-gold/10 text-gold" : "border-line text-mute hover:text-cream",
                )}>
                <Icon size={12} /> {label}
              </button>
            ))}
            <span className="ml-auto hidden shrink-0 items-center px-2 text-[10.5px] text-faint sm:flex">
              {groups.length} markets
            </span>
          </div>

          {current?.id === "info" && (
            <MatchDetailPanels eventId={match.id} league={match.league} state={match.state} />
          )}

          {current?.id === "score" && (
            <CorrectScoreInput eventId={match.id} league={match.league} onAdd={add}
              isActive={(pick) => isActive("CS", null, pick)} />
          )}

          {visible.map((g) => (
            <MarketPanel key={`${g.key}:${g.line ?? "-"}`} group={g} add={add} isActive={isActive} />
          ))}
        </>
      )}

      {/* Pricing transparency */}
      {factors && (
        <section className="rounded-2xl border border-gold/15 bg-panel p-5">
          <header className="flex items-center gap-2">
            <BrainCircuit size={15} className="text-gold" />
            <h3 className="font-display text-[16px] font-semibold text-cream">How these odds were calculated</h3>
          </header>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">
            No randomness. Goal markets come from a Poisson model built on each side&apos;s season
            data, form and home advantage; corners and cards use their own models anchored to
            league baselines. A house margin is then applied — wider on exotic markets like
            correct score and goalscorers, exactly as real bookmakers price them.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FactorChip icon={Sigma} label="Expected goals" value={`${factors.lambdaHome.toFixed(2)} – ${factors.lambdaAway.toFixed(2)}`} sub="home – away" />
            <FactorChip icon={Landmark} label="Venue edge" value={`${Math.round(factors.venueEdge * 100)}%`} sub="league goals scored at home" />
            <FactorChip icon={Scale} label="League baseline" value={factors.leagueBaseline.toFixed(2)} sub="avg goals / team / match" />
            {factors.expectedCorners !== undefined && (
              <FactorChip icon={Flag} label="Expected corners" value={String(factors.expectedCorners)} sub="modelled match total" />
            )}
            {factors.expectedCards !== undefined && (
              <FactorChip icon={RectangleVertical} label="Expected cards" value={String(factors.expectedCards)} sub="league-adjusted total" />
            )}
            <FactorChip icon={HeartPulse} label="Margin" value="6–32%" sub="tightest on 1X2, widest on exotics" />
            <SideFactor team={match.home.short} f={factors.home} />
            <SideFactor team={match.away.short} f={factors.away} />
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MarketPanel({
  group, add, isActive,
}: {
  group: MarketGroup;
  add: (m: string, l: number | null, p: string, label: string, o: number) => void;
  isActive: (m: string, l: number | null, p: string) => boolean;
}) {
  const big = group.outcomes.length > 12;
  const [open, setOpen] = useState(!big);
  const [query, setQuery] = useState("");

  const shown = query
    ? group.outcomes.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : group.outcomes;

  const cols = group.columns === 4 ? "grid-cols-2 sm:grid-cols-4" : group.columns === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <section className="rounded-2xl border border-line bg-panel">
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div>
          <h3 className="text-[13.5px] font-bold tracking-wide text-cream">{group.title}</h3>
          {group.note && <p className="mt-0.5 text-[10.5px] text-faint">{group.note}</p>}
        </div>
        <span className="flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
          {group.outcomes.length}
          <ChevronDown size={14} className={clsx("transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {big && (
            <div className="relative mb-2.5">
              <Search size={12} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
                className="w-full rounded-lg border border-line bg-raise py-2 pr-3 pl-8 text-[12.5px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
            </div>
          )}
          <div className={clsx("grid gap-2", cols)}>
            {shown.map((o) => (
              <OddsButton key={o.pick} label={o.label} sub={o.sub} odds={o.odds}
                active={isActive(group.key, group.line, o.pick)}
                onClick={() => add(group.key, group.line, o.pick, o.label, o.odds)} />
            ))}
          </div>
          {shown.length === 0 && (
            <p className="py-4 text-center text-[11.5px] text-faint">No match for “{query}”.</p>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function CorrectScoreInput({
  eventId, league, onAdd, isActive,
}: {
  eventId: string; league: string;
  onAdd: (m: string, l: number | null, p: string, label: string, o: number) => void;
  isActive: (pick: string) => boolean;
}) {
  const [h, setH] = useState("");
  const [a, setA] = useState("");
  const [quote, setQuote] = useState<{ pick: string; odds: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getQuote = async () => {
    const hn = Number(h), an = Number(a);
    if (!Number.isInteger(hn) || !Number.isInteger(an) || hn < 0 || an < 0) {
      setErr("Enter whole numbers, e.g. 3 and 1."); setQuote(null); return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/event/${eventId}/score?league=${encodeURIComponent(league)}&h=${hn}&a=${an}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not price that score.");
      setQuote({ pick: data.pick, odds: data.odds });
    } catch (e) {
      setErr((e as Error).message); setQuote(null);
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-gold/25 bg-panel p-4">
      <h3 className="text-[13.5px] font-bold tracking-wide text-cream">Name your scoreline</h3>
      <p className="mt-0.5 text-[10.5px] text-faint">Type any exact score and we&apos;ll price it instantly.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={h} onChange={(e) => { setH(e.target.value); setQuote(null); }} inputMode="numeric" placeholder="0"
          className="tnum w-14 rounded-lg border border-line bg-raise py-2 text-center text-[15px] font-bold text-cream outline-none focus:border-gold/50" />
        <span className="text-[13px] font-bold text-faint">–</span>
        <input value={a} onChange={(e) => { setA(e.target.value); setQuote(null); }} inputMode="numeric" placeholder="0"
          className="tnum w-14 rounded-lg border border-line bg-raise py-2 text-center text-[15px] font-bold text-cream outline-none focus:border-gold/50" />
        <button onClick={getQuote} disabled={busy}
          className="rounded-lg border border-line bg-raise px-3.5 py-2 text-[12px] font-bold text-mute transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-50">
          {busy ? "Pricing…" : "Get price"}
        </button>
        {quote && (
          <OddsButton label={`Score ${quote.pick}`} odds={quote.odds} active={isActive(quote.pick)}
            onClick={() => onAdd("CS", null, quote.pick, `Correct score ${quote.pick}`, quote.odds)} />
        )}
      </div>
      {err && <p className="mt-2 text-[11.5px] text-loss">{err}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */

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
        ATK <span className="text-gold">{f.attack.toFixed(2)}</span> · DEF <span className="text-gold">{f.defense.toFixed(2)}</span>
      </p>
      <p className="mt-0.5 text-[10.5px] text-faint">
        {f.ppg !== null ? `${f.ppg.toFixed(2)} pts/game` : "insufficient data"}
        {f.form ? ` · form ${f.form}` : ""}
      </p>
    </div>
  );
}
