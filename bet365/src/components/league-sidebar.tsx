"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Home, Radio } from "lucide-react";
import clsx from "clsx";
import { LEAGUES } from "@/lib/constants";
import type { MatchDTO } from "./match-card";

export function LeagueSidebar() {
  const pathname = usePathname();
  const [matches, setMatches] = useState<MatchDTO[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/matches?days=1", { cache: "no-store" });
        const data = await res.json();
        if (alive) setMatches(data.matches ?? []);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, { total: number; live: number }>();
    for (const m of matches) {
      const cur = map.get(m.league) ?? { total: 0, live: 0 };
      cur.total += 1;
      if (m.state === "in") cur.live += 1;
      map.set(m.league, cur);
    }
    return map;
  }, [matches]);

  const liveCount = matches.filter((m) => m.state === "in").length;

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[228px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-coal/60 px-3 py-4 lg:flex">
      <Link href="/"
        className={clsx(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors",
          pathname === "/" ? "bg-lift text-gold" : "text-cream/80 hover:bg-raise hover:text-cream",
        )}>
        <Home size={15} className={pathname === "/" ? "text-gold" : "text-mute"} />
        Home · Today
      </Link>
      <Link href="/live"
        className={clsx(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors",
          pathname === "/live" ? "bg-lift text-gold" : "text-cream/80 hover:bg-raise hover:text-cream",
        )}>
        <Radio size={15} className={liveCount > 0 ? "text-live" : "text-mute"} />
        In-Play
        {liveCount > 0 && (
          <span className="ml-auto rounded-full bg-live/15 px-1.5 py-0.5 text-[10px] font-bold text-live tnum">
            {liveCount}
          </span>
        )}
      </Link>

      <p className="mt-4 mb-1 px-3 text-[10px] font-bold tracking-[0.2em] text-faint uppercase">
        Leagues
      </p>
      {LEAGUES.map((l) => {
        const c = counts.get(l.slug);
        const active = pathname === `/league/${l.slug}`;
        return (
          <Link key={l.slug} href={`/league/${l.slug}`}
            className={clsx(
              "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition-colors",
              active ? "bg-lift text-gold" : "text-cream/75 hover:bg-raise hover:text-cream",
            )}>
            <Trophy size={13} className={active ? "text-gold" : "text-faint group-hover:text-mute"} />
            <span className="flex-1 truncate font-medium">{l.name}</span>
            {c?.live ? (
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-dot" />
            ) : null}
            {c && <span className="tnum text-[10.5px] text-faint">{c.total}</span>}
          </Link>
        );
      })}

      <div className="mt-auto rounded-xl border border-line bg-panel p-3 text-[10.5px] leading-relaxed text-faint">
        <p className="font-bold tracking-wider text-mute uppercase">Virtual currency</p>
        <p className="mt-1">
          All wagers use virtual euros. No real money is staked, won or lost. 18+ — play responsibly.
        </p>
      </div>
    </aside>
  );
}
