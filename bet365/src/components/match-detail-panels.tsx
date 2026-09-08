"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, BarChart3, ArrowRightLeft, Clock } from "lucide-react";
import clsx from "clsx";

type LineupPlayer = {
  id: string;
  name: string;
  jersey: string | null;
  position: string;
  formationPlace: number | null;
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
};
type TeamLineup = {
  teamId: string;
  teamName: string;
  formation: string | null;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
};
type StatPair = { name: string; label: string; home: string; away: string };
type Detail = {
  confirmed: boolean;
  lineups: { home: TeamLineup | null; away: TeamLineup | null };
  stats: StatPair[];
  events: { minute: string; type: string; text: string; teamId: string | null }[];
  state: "pre" | "in" | "post";
};

export function MatchDetailPanels({
  eventId, league, state,
}: {
  eventId: string; league: string; state: "pre" | "in" | "post";
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/event/${eventId}/detail?league=${encodeURIComponent(league)}`, { cache: "no-store" });
      if (!res.ok) { setDetail(null); return; }
      setDetail(await res.json());
    } catch { /* keep */ } finally { setLoading(false); }
  }, [eventId, league]);

  useEffect(() => {
    load();
    const t = setInterval(load, state === "in" ? 20_000 : 90_000);
    return () => clearInterval(t);
  }, [load, state]);

  if (loading)
    return <div className="skeleton h-56 rounded-2xl border border-line" />;

  if (!detail || (!detail.lineups.home && detail.stats.length === 0))
    return (
      <section className="rounded-2xl border border-dashed border-line py-12 text-center">
        <Users className="mx-auto mb-2 text-faint" size={22} />
        <p className="text-[12.5px] text-mute">
          Lineups are published by ESPN about an hour before kick-off.
        </p>
        <p className="mt-1 text-[11px] text-faint">Check back closer to the match.</p>
      </section>
    );

  return (
    <div className="flex flex-col gap-4">
      {(detail.lineups.home || detail.lineups.away) && (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <header className="mb-3 flex items-center gap-2">
            <Users size={14} className="text-gold" />
            <h3 className="text-[13.5px] font-bold tracking-wide text-cream">
              {detail.confirmed ? "Confirmed Lineups" : "Probable Lineups"}
            </h3>
            <span className={clsx(
              "ml-auto rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase",
              detail.confirmed ? "bg-live/10 text-live" : "bg-lift text-faint",
            )}>
              {detail.confirmed ? "Official" : "Not confirmed"}
            </span>
          </header>
          <div className="grid gap-4 sm:grid-cols-2">
            <TeamSheet team={detail.lineups.home} />
            <TeamSheet team={detail.lineups.away} />
          </div>
        </section>
      )}

      {detail.stats.length > 0 && (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <header className="mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-gold" />
            <h3 className="text-[13.5px] font-bold tracking-wide text-cream">
              {state === "in" ? "Live Match Stats" : "Match Stats"}
            </h3>
            {state === "in" && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-live uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-dot" /> live
              </span>
            )}
          </header>
          <div className="flex flex-col gap-2.5">
            {detail.stats.map((s) => <StatRow key={s.name} stat={s} />)}
          </div>
        </section>
      )}

      {detail.events.length > 0 && (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <header className="mb-3 flex items-center gap-2">
            <Clock size={14} className="text-gold" />
            <h3 className="text-[13.5px] font-bold tracking-wide text-cream">Key Events</h3>
          </header>
          <div className="flex flex-col gap-1.5">
            {detail.events.map((e, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg bg-raise/50 px-3 py-2">
                <span className="tnum w-10 shrink-0 text-[11px] font-bold text-gold">{e.minute || "—"}</span>
                <span className="text-[13px]">{iconFor(e.type)}</span>
                <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-cream/85">{e.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function iconFor(type: string): string {
  if (/red card/i.test(type)) return "🟥";
  if (/yellow/i.test(type)) return "🟨";
  if (/goal/i.test(type)) return "⚽";
  if (/substitution/i.test(type)) return "🔁";
  if (/penalty/i.test(type)) return "🎯";
  return "•";
}

function TeamSheet({ team }: { team: TeamLineup | null }) {
  if (!team) return null;
  const sorted = [...team.starters].sort(
    (a, b) => (a.formationPlace ?? 99) - (b.formationPlace ?? 99),
  );
  return (
    <div className="rounded-xl border border-line bg-raise/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-[12.5px] font-bold text-cream">{team.teamName}</span>
        {team.formation && (
          <span className="tnum shrink-0 rounded-md bg-lift px-1.5 py-0.5 text-[10px] font-bold text-gold">
            {team.formation}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {sorted.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-[12px]">
            <span className="tnum w-5 shrink-0 text-right text-[10.5px] text-faint">{p.jersey ?? "–"}</span>
            <span className={clsx("min-w-0 flex-1 truncate", p.subbedOut ? "text-faint line-through" : "text-cream/90")}>
              {p.name}
            </span>
            <span className="shrink-0 text-[9.5px] tracking-wider text-faint uppercase">{p.position}</span>
            {p.subbedOut && <ArrowRightLeft size={9} className="shrink-0 text-loss" />}
          </li>
        ))}
      </ul>
      {team.bench.length > 0 && (
        <details className="mt-2 border-t border-line pt-2">
          <summary className="cursor-pointer text-[10.5px] font-bold tracking-wider text-faint uppercase">
            Bench ({team.bench.length})
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {team.bench.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-[11.5px]">
                <span className="tnum w-5 shrink-0 text-right text-[10px] text-faint">{p.jersey ?? "–"}</span>
                <span className={clsx("min-w-0 flex-1 truncate", p.subbedIn ? "text-live" : "text-mute")}>
                  {p.name}
                </span>
                {p.subbedIn && <ArrowRightLeft size={9} className="shrink-0 text-live" />}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function StatRow({ stat }: { stat: StatPair }) {
  const h = parseFloat(stat.home.replace("%", "")) || 0;
  const a = parseFloat(stat.away.replace("%", "")) || 0;
  const total = h + a;
  const hPct = total > 0 ? (h / total) * 100 : 50;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11.5px]">
        <span className="tnum font-bold text-cream">{stat.home}</span>
        <span className="text-[10.5px] tracking-wide text-faint uppercase">{stat.label}</span>
        <span className="tnum font-bold text-cream">{stat.away}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-lift">
        <div className="bg-gold transition-all duration-500" style={{ width: `${hPct}%` }} />
        <div className="flex-1 bg-sky/60 transition-all duration-500" />
      </div>
    </div>
  );
}
