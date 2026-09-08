"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { OddsButton } from "./odds-button";
import { useBetSlip, slipKey } from "@/lib/store";
import { useUser, useToast } from "./providers";

export type MatchDTO = {
  id: string;
  league: string;
  leagueName: string;
  name: string;
  startsAt: string;
  state: "pre" | "in" | "post";
  detail: string;
  minute: number | null;
  venue: string | null;
  home: { id: string; name: string; short: string; abbr: string; logo: string | null; score: number };
  away: { id: string; name: string; short: string; abbr: string; logo: string | null; score: number };
  markets: {
    oneXTwo: { home: number; draw: number; away: number } | null;
    doubleChance: { "1X": number; "12": number; "X2": number } | null;
    overUnder: { line: number; over: number; under: number }[];
    btts: { yes: number; no: number } | null;
    source: "model" | "blended";
  };
};

export function TeamCrest({ logo, abbr }: { logo: string | null; abbr: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={abbr} width={22} height={22} className="h-[22px] w-[22px] object-contain" />;
  }
  return (
    <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-lift text-[8px] font-bold text-mute">
      {abbr?.slice(0, 3) || "?"}
    </span>
  );
}

function KickoffLabel({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const tomorrow = new Date(today.getTime() + 86400_000);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

export function MatchCard({ match }: { match: MatchDTO }) {
  const { toggle, items } = useBetSlip();
  const { user } = useUser();
  const { toast } = useToast();
  const activeKeys = useMemo(() => new Set(items.map((i) => i.key)), [items]);

  const live = match.state === "in";
  const post = match.state === "post";
  const m = match.markets;

  const add = (market: string, line: number | null, pick: string, label: string, odds: number) => {
    if (!user) {
      toast({ title: "Sign in required", body: "Create a free virtual account to place bets.", tone: "info" });
      return;
    }
    toggle({
      eventId: match.id,
      league: match.league,
      home: match.home.name,
      away: match.away.name,
      startsAt: match.startsAt,
      live,
      market,
      line,
      pick,
      label,
      odds,
    });
  };

  return (
    <article className="group relative overflow-hidden rounded-xl border border-line bg-panel transition-colors duration-300 hover:border-line2">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4">
        {/* Status column */}
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-[104px] sm:flex-col sm:items-start sm:gap-1">
          {live ? (
            <>
              <span className="flex items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5 text-[11px] font-bold text-live">
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-dot" />
                LIVE
              </span>
              <span className="tnum text-[11px] font-semibold text-mute">
                {match.minute !== null ? `${match.minute}'` : match.detail || "In play"}
              </span>
            </>
          ) : post ? (
            <span className="rounded-full bg-lift px-2 py-0.5 text-[11px] font-semibold text-mute">
              {match.detail?.includes("Pen") ? "FT (pens)" : "Full time"}
            </span>
          ) : (
            <span className="tnum text-[12px] font-medium text-mute">
              <KickoffLabel iso={match.startsAt} />
            </span>
          )}
        </div>

        {/* Teams + score */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 py-0.5">
            <TeamCrest logo={match.home.logo} abbr={match.home.abbr} />
            <span className={`truncate text-[13.5px] font-medium ${live ? "text-cream" : post ? "text-mute" : "text-cream"}`}>
              {match.home.short || match.home.name}
            </span>
            {(live || post) && (
              <span className="tnum ml-auto text-[15px] font-bold text-gold sm:hidden">{match.home.score}</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 py-0.5">
            <TeamCrest logo={match.away.logo} abbr={match.away.abbr} />
            <span className={`truncate text-[13.5px] font-medium ${live ? "text-cream" : post ? "text-mute" : "text-cream"}`}>
              {match.away.short || match.away.name}
            </span>
            {(live || post) && (
              <span className="tnum ml-auto text-[15px] font-bold text-gold sm:hidden">{match.away.score}</span>
            )}
          </div>
          {match.venue && !live && !post && (
            <p className="mt-0.5 truncate text-[10.5px] text-faint">{match.venue}</p>
          )}
        </div>

        {(live || post) && (
          <div className="hidden flex-col items-center gap-0.5 sm:flex">
            <span className="tnum rounded-md bg-lift px-2 py-1 text-[15px] font-bold leading-none text-gold">
              {match.home.score}
            </span>
            <span className="tnum rounded-md bg-lift px-2 py-1 text-[15px] font-bold leading-none text-cream/80">
              {match.away.score}
            </span>
          </div>
        )}

        {/* 1X2 prices */}
        {!post && (
          <div className="flex items-center gap-1.5">
            {m.oneXTwo ? (
              <>
                <OddsButton compact sub="1" odds={m.oneXTwo.home}
                  active={activeKeys.has(slipKey({ eventId: match.id, market: "1X2", line: null, pick: "home" }))}
                  onClick={() => add("1X2", null, "home", match.home.name, m.oneXTwo!.home)} />
                <OddsButton compact sub="X" odds={m.oneXTwo.draw}
                  active={activeKeys.has(slipKey({ eventId: match.id, market: "1X2", line: null, pick: "draw" }))}
                  onClick={() => add("1X2", null, "draw", "Draw", m.oneXTwo!.draw)} />
                <OddsButton compact sub="2" odds={m.oneXTwo.away}
                  active={activeKeys.has(slipKey({ eventId: match.id, market: "1X2", line: null, pick: "away" }))}
                  onClick={() => add("1X2", null, "away", match.away.name, m.oneXTwo!.away)} />
              </>
            ) : (
              <span className="px-3 text-[11px] tracking-wide text-faint uppercase">Suspended</span>
            )}
            <Link
              href={`/event/${match.id}?league=${encodeURIComponent(match.league)}`}
              className="ml-1 flex items-center gap-0.5 rounded-lg border border-line px-2 py-2 text-[11px] font-semibold text-mute transition-colors hover:border-gold/40 hover:text-gold"
              title="All markets"
            >
              +{(m.doubleChance ? 3 : 0) + m.overUnder.length * 2 + (m.btts ? 2 : 0)}
              <ChevronRight size={12} />
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
