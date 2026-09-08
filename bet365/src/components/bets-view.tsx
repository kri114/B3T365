"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ticket, TrendingUp, Clock3, History } from "lucide-react";
import clsx from "clsx";
import { formatEuro } from "@/lib/money";
import { useUser } from "./providers";

export type SelectionDTO = {
  id: string;
  eventId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  market: string;
  line: number | null;
  pick: string;
  label: string;
  odds: number;
  status: "open" | "won" | "lost" | "void";
};

export type BetDTO = {
  bet: {
    id: string;
    kind: string;
    stakeCents: number;
    totalOdds: number;
    potentialCents: number;
    status: "open" | "won" | "lost" | "void";
    placedAt: string;
    settledAt: string | null;
    note: string | null;
  };
  selections: SelectionDTO[];
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-sky/10 text-sky border-sky/25",
  won: "bg-live/10 text-live border-live/25",
  lost: "bg-loss/10 text-loss border-loss/25",
  void: "bg-lift text-mute border-line2",
};

const LEG_DOT: Record<string, string> = {
  open: "bg-sky",
  won: "bg-live",
  lost: "bg-loss",
  void: "bg-mute",
};

export function BetsView() {
  const { user } = useUser();
  const [bets, setBets] = useState<BetDTO[]>([]);
  const [tab, setTab] = useState<"open" | "history">("open");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bets", { cache: "no-store" });
      if (res.status === 401) { setBets([]); return; }
      const data = await res.json();
      setBets(data.bets ?? []);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const open = bets.filter((b) => b.bet.status === "open");
  const history = bets.filter((b) => b.bet.status !== "open");

  const pnl = useMemo(
    () =>
      history.reduce((acc, b) => {
        if (b.bet.status === "won") return acc + (b.bet.potentialCents - b.bet.stakeCents);
        if (b.bet.status === "lost") return acc - b.bet.stakeCents;
        return acc;
      }, 0),
    [history],
  );

  if (!user)
    return (
      <EmptyState title="Sign in to see your bets" />
    );

  if (loading)
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl border border-line" />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Open bets" value={String(open.length)} icon={Clock3} />
        <Stat label="Settled" value={String(history.length)} icon={History} />
        <Stat
          label="Net P&L"
          value={`${pnl >= 0 ? "+" : "−"}${formatEuro(Math.abs(pnl)).replace("−", "")}`}
          icon={TrendingUp}
          tone={pnl > 0 ? "up" : pnl < 0 ? "down" : undefined}
        />
      </div>

      <div className="flex gap-1.5">
        {(["open", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx(
              "rounded-lg border px-4 py-2 text-[12.5px] font-bold capitalize transition-colors",
              tab === t ? "border-gold/40 bg-gold/10 text-gold" : "border-line text-mute hover:text-cream",
            )}>
            {t} {t === "open" ? `(${open.length})` : `(${history.length})`}
          </button>
        ))}
      </div>

      {(tab === "open" ? open : history).length === 0 ? (
        <EmptyState title={tab === "open" ? "No open bets" : "No settled bets yet"}
          body={tab === "open" ? "Tap a price anywhere on the board to build a slip." : undefined} />
      ) : (
        <div className="flex flex-col gap-3">
          {(tab === "open" ? open : history).map((b) => <BetCard key={b.bet.id} data={b} />)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: React.ElementType; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-faint uppercase">
        <Icon size={11} /> {label}
      </div>
      <p className={clsx("tnum mt-1 truncate text-lg font-bold sm:text-xl",
        tone === "up" ? "text-live" : tone === "down" ? "text-loss" : "text-cream")}>
        {value}
      </p>
    </div>
  );
}

function BetCard({ data }: { data: BetDTO }) {
  const { bet, selections } = data;
  return (
    <article className="animate-rise overflow-hidden rounded-xl border border-line bg-panel">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-raise/50 px-4 py-2.5">
        <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase", STATUS_STYLE[bet.status])}>
          {bet.status}
        </span>
        <span className="text-[11px] font-semibold tracking-wide text-mute uppercase">
          {bet.kind === "multi" ? `Multi ×${selections.length}` : "Single"}
        </span>
        <span className="tnum text-[11px] text-faint">
          {new Date(bet.placedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        {bet.note && <span className="text-[10.5px] text-gold/80">{bet.note}</span>}
        <span className="tnum ml-auto text-[12.5px] font-bold text-cream">
          {formatEuro(bet.stakeCents)}
        </span>
      </header>
      <div className="flex flex-col divide-y divide-line/60">
        {selections.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", LEG_DOT[s.status])} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-cream">{s.label}</p>
              <p className="truncate text-[11px] text-faint">
                {s.homeTeam} v {s.awayTeam} · {s.market}{s.line !== null ? ` ${s.line}` : ""}
              </p>
            </div>
            <span className="tnum text-[12.5px] font-bold text-gold">{s.odds.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <footer className="flex items-center justify-between border-t border-line bg-raise/50 px-4 py-2.5 text-[12px]">
        <span className="tnum text-mute">Total odds <span className="font-bold text-gold">{bet.totalOdds.toFixed(2)}</span></span>
        <span className="tnum font-bold">
          {bet.status === "won" ? (
            <span className="text-live">Returned {formatEuro(bet.potentialCents)}</span>
          ) : bet.status === "open" ? (
            <span className="text-cream">To return {formatEuro(bet.potentialCents)}</span>
          ) : bet.status === "void" ? (
            <span className="text-mute">Stake refunded</span>
          ) : (
            <span className="text-loss">−{formatEuro(bet.stakeCents)}</span>
          )}
        </span>
      </footer>
    </article>
  );
}

function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
      <Ticket className="text-faint" size={26} />
      <p className="text-sm font-medium text-mute">{title}</p>
      {body && <p className="max-w-xs text-[12px] leading-relaxed text-faint">{body}</p>}
    </div>
  );
}
