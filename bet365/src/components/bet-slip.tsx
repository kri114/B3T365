"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2, Ticket, ChevronRight, Radio } from "lucide-react";
import clsx from "clsx";
import { useBetSlip, parseStake } from "@/lib/store";
import { useUser, useToast } from "./providers";
import { formatEuro } from "@/lib/money";

export function BetSlip() {
  const {
    items, mode, multiStake, singleStakes, open,
    remove, clear, setMode, setMultiStake, setSingleStake, setOpen,
  } = useBetSlip();
  const { user, refresh } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [placing, setPlacing] = useState(false);

  const combined = useMemo(
    () => Math.round(items.reduce((acc, i) => acc * i.odds, 1) * 100) / 100,
    [items],
  );
  const multiStakeCents = parseStake(multiStake) ?? 0;
  const multiReturn = Math.round(multiStakeCents * combined);

  const singlesTotalStake = items.reduce(
    (acc, i) => acc + (parseStake(singleStakes[i.key] ?? "") ?? 0), 0,
  );
  const singlesReturn = items.reduce((acc, i) => {
    const s = parseStake(singleStakes[i.key] ?? "") ?? 0;
    return acc + Math.round(s * i.odds);
  }, 0);

  const canPlace =
    user &&
    !placing &&
    items.length > 0 &&
    (mode === "multi"
      ? multiStakeCents >= 10
      : items.every((i) => (parseStake(singleStakes[i.key] ?? "") ?? 0) >= 10));

  const place = async () => {
    if (!user) return;
    if (user.balanceCents < (mode === "multi" ? multiStakeCents : singlesTotalStake)) {
      toast({ title: "Insufficient balance", body: "Top up via the house (admin) to keep playing.", tone: "err" });
      return;
    }
    setPlacing(true);
    try {
      if (mode === "multi") {
        const res = await fetch("/api/bets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: items.length > 1 ? "multi" : "single",
            stakeCents: multiStakeCents,
            selections: items.map(({ eventId, league, market, line, pick }) => ({ eventId, league, market, line, pick })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Bet rejected.");
        toast({
          title: `Bet placed @ ${data.bet.totalOdds.toFixed(2)}`,
          body: `Potential return ${formatEuro(data.bet.potentialCents)}`,
          tone: "ok",
        });
        clear();
      } else {
        const errors: string[] = [];
        for (const item of items) {
          const stake = parseStake(singleStakes[item.key] ?? "") ?? 0;
          const res = await fetch("/api/bets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "single",
              stakeCents: stake,
              selections: [{ eventId: item.eventId, league: item.league, market: item.market, line: item.line, pick: item.pick }],
            }),
          });
          const data = await res.json();
          if (!res.ok) errors.push(`${item.home} v ${item.away}: ${data?.error ?? "rejected"}`);
        }
        if (errors.length === 0) {
          toast({ title: `${items.length} single${items.length > 1 ? "s" : ""} placed`, tone: "ok" });
          clear();
        } else {
          toast({ title: "Some singles failed", body: errors[0], tone: "err" });
        }
      }
      await refresh();
    } catch (err) {
      toast({ title: "Bet not placed", body: (err as Error).message, tone: "err" });
    } finally {
      setPlacing(false);
    }
  };

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-bold tracking-wide text-cream uppercase">
          <Ticket size={15} className="text-gold" />
          Bet Slip
          {items.length > 0 && (
            <span className="rounded-full bg-gold px-1.5 py-px text-[10.5px] font-bold text-ink tnum">
              {items.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <button onClick={clear} className="rounded-md p-1.5 text-faint transition-colors hover:text-loss" title="Clear slip">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-faint hover:text-cream lg:hidden">
            <X size={15} />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel">
            <Ticket size={20} className="text-faint" />
          </span>
          <p className="text-[13px] font-medium text-mute">Your slip is empty.</p>
          <p className="text-[11.5px] leading-relaxed text-faint">
            Tap any price on the board to add a selection. Combine legs into a multi for bigger returns.
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-1 px-3 pt-3">
            {(["multi", "singles"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={clsx(
                  "flex-1 rounded-lg border py-1.5 text-[12px] font-bold transition-colors",
                  mode === m
                    ? "border-gold/40 bg-gold/10 text-gold"
                    : "border-line text-mute hover:text-cream",
                )}>
                {m === "multi" ? "Multi" : "Singles"}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {items.map((item) => (
              <div key={item.key} className="rounded-xl border border-line bg-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-bold text-cream">{item.label}</p>
                    <p className="mt-0.5 truncate text-[11px] text-mute">
                      {item.home} v {item.away}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                      {item.live && (
                        <span className="flex items-center gap-1 font-bold text-live">
                          <Radio size={9} /> LIVE
                        </span>
                      )}
                      {item.market === "OU" ? `Total ${item.line}` : item.market}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="tnum rounded-md bg-lift px-2 py-1 text-[13px] font-bold text-gold">
                      {item.odds.toFixed(2)}
                    </span>
                    <button onClick={() => remove(item.key)} className="p-1 text-faint hover:text-loss">
                      <X size={13} />
                    </button>
                  </div>
                </div>
                {mode === "singles" && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[12px] text-faint">€</span>
                      <input
                        value={singleStakes[item.key] ?? ""}
                        onChange={(e) => setSingleStake(item.key, e.target.value)}
                        inputMode="decimal" placeholder="0.00"
                        className="tnum w-full rounded-lg border border-line bg-raise py-1.5 pr-2 pl-7 text-[13px] font-semibold text-cream outline-none placeholder:text-faint focus:border-gold/50"
                      />
                    </div>
                    <span className="tnum text-[11px] whitespace-nowrap text-mute">
                      → {formatEuro(Math.round((parseStake(singleStakes[item.key] ?? "") ?? 0) * item.odds))}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-line px-4 py-3.5">
            {mode === "multi" ? (
              <>
                <div className="mb-2 flex items-center justify-between text-[12px] text-mute">
                  <span>Combined odds</span>
                  <span className="tnum text-[14px] font-bold text-gold">{combined.toFixed(2)}</span>
                </div>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-faint">€</span>
                  <input
                    value={multiStake}
                    onChange={(e) => setMultiStake(e.target.value)}
                    inputMode="decimal" placeholder="Enter stake"
                    className="tnum w-full rounded-xl border border-line bg-raise py-2.5 pr-3 pl-8 text-[15px] font-bold text-cream outline-none placeholder:text-[13px] placeholder:font-normal placeholder:text-faint focus:border-gold/50"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px] text-mute">
                  <span>Potential return</span>
                  <span className="tnum text-[14px] font-bold text-live">
                    {multiStakeCents > 0 ? formatEuro(multiReturn) : "—"}
                  </span>
                </div>
              </>
            ) : (
              <div className="mb-2 flex items-center justify-between text-[12px] text-mute">
                <span>Total stake / return</span>
                <span className="tnum text-[12.5px] font-bold">
                  <span className="text-cream">{formatEuro(singlesTotalStake)}</span>
                  <span className="mx-1 text-faint">→</span>
                  <span className="text-live">{formatEuro(singlesReturn)}</span>
                </span>
              </div>
            )}

            <button
              disabled={!canPlace}
              onClick={user ? place : () => router.push("/login")}
              className={clsx(
                "mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold tracking-wide transition-all",
                canPlace
                  ? "bg-gradient-to-b from-[#eed38a] to-[#c39a42] text-ink shadow-[0_6px_24px_-6px_rgba(227,195,107,0.55)] hover:brightness-105 active:scale-[0.98]"
                  : "cursor-not-allowed bg-lift text-faint",
              )}>
              {placing ? "Placing…" : user ? `Place bet — ${mode === "multi" ? combined.toFixed(2) : `${items.length} single${items.length > 1 ? "s" : ""}`}` : "Sign in to bet"}
              {!placing && <ChevronRight size={15} />}
            </button>
            {user && (
              <p className="tnum mt-2 text-center text-[11px] text-faint">
                Balance: {formatEuro(user.balanceCents)}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[300px] shrink-0 border-l border-line bg-coal/80 lg:block">
        {body}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-[85%] max-w-[340px] border-l border-line bg-coal shadow-2xl">
            {body}
          </div>
        </div>
      )}
    </>
  );
}
