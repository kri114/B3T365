"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, CalendarX2, History } from "lucide-react";
import { MatchCard, type MatchDTO } from "./match-card";
import { localDateString, addDaysLocal, useDateStats } from "@/lib/store";

type Feed = { matches: MatchDTO[]; liveCount: number; generatedAt: string; error?: string };

export function dayLabel(date: string): string {
  const today = localDateString();
  if (date === today) return "Today";
  if (date === addDaysLocal(today, -1)) return "Yesterday";
  if (date === addDaysLocal(today, 1)) return "Tomorrow";
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function MatchBoard({
  league,
  live = false,
  days = 2,
  date = null,
  hideFinished = true,
}: {
  league?: string;
  live?: boolean;
  days?: number;
  /** Client-local YYYY-MM-DD — switches the board into calendar mode. */
  date?: string | null;
  hideFinished?: boolean;
}) {
  const [matches, setMatches] = useState<MatchDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const setCounts = useDateStats((s) => s.setCounts);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (league) params.set("league", league);
    if (live) params.set("live", "1");
    if (date) {
      params.set("date", date);
      params.set("offset", String(new Date().getTimezoneOffset()));
    } else {
      params.set("days", String(days));
    }
    try {
      const res = await fetch(`/api/matches?${params}`, { cache: "no-store" });
      const data: Feed = await res.json();
      const list = data.matches ?? [];
      setMatches(list);
      setUpdatedAt(data.generatedAt ?? new Date().toISOString());
      if (date) {
        setCounts(date, list.length, list.filter((m) => m.state === "in").length);
      }
    } catch {
      /* keep old data */
    } finally {
      setLoading(false);
    }
  }, [league, live, days, date, setCounts]);

  useEffect(() => {
    setLoading(true);
    load();
    const isPast = date ? date < localDateString() : false;
    const interval = live || date === localDateString() ? 15_000 : isPast ? 120_000 : 45_000;
    timer.current = setInterval(load, interval);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load, live, date]);

  const groups = useMemo(() => {
    const showFinished = date ? true : !hideFinished;
    const visible = showFinished ? matches : matches.filter((m) => m.state !== "post");
    const byLeague = new Map<string, MatchDTO[]>();
    for (const match of visible) {
      if (!byLeague.has(match.league)) byLeague.set(match.league, []);
      byLeague.get(match.league)!.push(match);
    }
    return [...byLeague.entries()];
  }, [matches, hideFinished, date]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-[86px] rounded-xl border border-line" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
        {live ? (
          <Radio className="text-faint" size={26} />
        ) : date && date < localDateString() ? (
          <History className="text-faint" size={26} />
        ) : (
          <CalendarX2 className="text-faint" size={26} />
        )}
        <p className="max-w-sm text-sm leading-relaxed text-mute">
          {live
            ? "No matches are in play right now. The board lights up the moment a whistle blows."
            : date
              ? `No fixtures across the featured leagues on ${dayLabel(date).toLowerCase()}.`
              : "No fixtures scheduled in this window — check another league."}
        </p>
      </div>
    );
  }

  const liveTotal = matches.filter((m) => m.state === "in").length;
  const doneTotal = matches.filter((m) => m.state === "post").length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center justify-between text-[11px] text-faint">
        <span className="tnum">
          {date && <span className="mr-2 font-bold tracking-wider text-gold uppercase">{dayLabel(date)}</span>}
          {liveTotal > 0 && <span className="mr-2 font-semibold text-live">{liveTotal} live</span>}
          {matches.length - doneTotal - liveTotal} upcoming{doneTotal > 0 && ` · ${doneTotal} full-time`}
        </span>
        {updatedAt && (
          <span className="tnum">
            updated {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>
      {groups.map(([slug, list]) => (
        <section key={slug} className="animate-rise">
          <header className="mb-2.5 flex items-center gap-3">
            <span className="rounded-md border border-gold/20 bg-lift px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-gold uppercase">
              {list[0].leagueName}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
            <span className="tnum text-[11px] text-faint">{list.length}</span>
          </header>
          <div className="flex flex-col gap-2">
            {list.map((match) => (
              <MatchCard key={`${match.league}:${match.id}`} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
