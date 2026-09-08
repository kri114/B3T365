"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { addDaysLocal, localDateString, useDateStats } from "@/lib/store";

const DAYS_BACK = 21;
const DAYS_AHEAD = 14;

function friendlyRelation(target: string, today: string): string | null {
  if (target === today) return "Today";
  if (target === addDaysLocal(today, -1)) return "Yesterday";
  if (target === addDaysLocal(today, 1)) return "Tomorrow";
  return null;
}

export function DateStrip() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const today = localDateString();
  const selected =
    params.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("date")!)
      ? params.get("date")!
      : today;

  const scrollRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const counts = useDateStats((s) => s.counts);
  const [todayLive, setTodayLive] = useState(0);

  // Keep a light pulse on "today" so its live badge works on any date view.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/matches?live=1", { cache: "no-store" });
        const data = await res.json();
        if (alive) setTodayLive(data.liveCount ?? 0);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -DAYS_BACK; i <= DAYS_AHEAD; i++) out.push(addDaysLocal(today, i));
    return out;
  }, [today]);

  // Bring the selected pill into view whenever it changes.
  useEffect(() => {
    const node = scrollRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    node?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selected]);

  if (!["/", "/live"].includes(pathname) && !pathname.startsWith("/league")) return null;
  if (pathname === "/live") return null;

  const go = (date: string) => {
    if (date === today) router.push(pathname);
    else router.push(`${pathname}?date=${date}`);
  };

  const nudge = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.72, behavior: "smooth" });
  };

  return (
    <div className="relative z-30 border-b border-line bg-coal/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1500px] items-center gap-1 px-3 py-1.5 sm:px-5">
        <button
          onClick={() => nudge(-1)}
          className="grid h-9 w-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raise hover:text-gold"
          aria-label="Scroll back"
        >
          <ChevronLeft size={15} />
        </button>

        <div
          ref={scrollRef}
          className="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {days.map((day) => {
            const d = new Date(`${day}T12:00:00`);
            const relation = friendlyRelation(day, today);
            const stats = counts[day];
            const live = day === today ? Math.max(todayLive, stats?.live ?? 0) : (stats?.live ?? 0);
            const isSelected = day === selected;
            const isToday = day === today;

            return (
              <button
                key={day}
                data-selected={isSelected}
                onClick={() => go(day)}
                className={clsx(
                  "group relative flex w-[62px] shrink-0 flex-col items-center rounded-lg border py-1 transition-all duration-200",
                  isSelected
                    ? "border-gold bg-gradient-to-b from-[#e9cf85] to-[#c39a42] text-ink shadow-[0_4px_16px_-6px_rgba(227,195,107,0.5)]"
                    : isToday
                      ? "border-gold/40 bg-raise text-gold hover:border-gold/70"
                      : "border-transparent text-mute hover:bg-raise hover:text-cream",
                )}
              >
                {live > 0 && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-live animate-pulse-dot" />
                )}
                <span
                  className={clsx(
                    "text-[9.5px] font-bold tracking-[0.1em] uppercase",
                    isSelected ? "text-ink/70" : relation ? (isToday ? "text-gold" : "text-gold/80") : "text-faint",
                  )}
                >
                  {relation ?? d.toLocaleDateString([], { weekday: "short" })}
                </span>
                <span className={clsx("tnum text-[12.5px] leading-tight font-bold", isSelected && "text-ink")}>
                  {d.getDate()} {d.toLocaleDateString([], { month: "short" })}
                </span>
                <span
                  className={clsx(
                    "tnum text-[8.5px] leading-none",
                    isSelected ? "text-ink/60" : "text-faint/80",
                    !(stats && stats.total > 0) && "invisible",
                  )}
                >
                  {stats && stats.total > 0 ? `${stats.total} match${stats.total === 1 ? "" : "es"}` : "·"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => nudge(1)}
          className="grid h-9 w-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raise hover:text-gold"
          aria-label="Scroll forward"
        >
          <ChevronRight size={15} />
        </button>

        <span className="relative ml-1 shrink-0">
          <button
            onClick={() => {
              const input = dateInputRef.current;
              if (!input) return;
              try {
                (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              } catch {
                input.click();
              }
            }}
            className="group flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-2 text-[11px] font-bold text-mute transition-colors hover:border-gold/40 hover:text-gold"
            title="Jump to a date"
          >
            <CalendarDays size={14} />
            <span className="hidden md:inline">Calendar</span>
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={selected}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="pointer-events-none absolute right-0 bottom-0 h-px w-px opacity-0"
            tabIndex={-1}
            aria-hidden
          />
        </span>
      </div>
    </div>
  );
}
