"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import clsx from "clsx";
import { formatEuro } from "@/lib/money";
import { useUser } from "./providers";

type Tx = {
  id: string;
  deltaCents: number;
  balanceAfter: number;
  kind: string;
  note: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  admin_credit: "House credit",
  admin_debit: "House deduction",
  bet_stake: "Bet stake",
  bet_payout: "Bet winnings",
  bet_refund: "Bet refund",
};

export function WalletView() {
  const { user } = useUser();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (res.status === 401) { setTxs([]); return; }
      const data = await res.json();
      setTxs(data.transactions ?? []);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  if (!user)
    return (
      <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-mute">
        Sign in to view your wallet.
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br from-lift via-panel to-panel p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_-20%,rgba(227,195,107,0.16),transparent_55%)]" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-gold/30 bg-ink/40">
            <Wallet size={17} className="text-gold" />
          </span>
          <div>
            <p className="text-[10.5px] font-bold tracking-[0.18em] text-mute uppercase">Virtual balance</p>
            <p className="tnum text-3xl font-bold tracking-tight text-gold">{formatEuro(user.balanceCents)}</p>
          </div>
        </div>
        <p className="relative mt-3 max-w-md text-[11.5px] leading-relaxed text-faint">
          Virtual euros only — they can never be bought, sold or withdrawn. The house (admin) credits
          and debits wallets manually, so every euro here is accounted for below.
        </p>
      </section>

      <section>
        <h3 className="mb-2.5 text-[12px] font-bold tracking-[0.16em] text-mute uppercase">Ledger</h3>
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg border border-line" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-10 text-center text-[12.5px] text-faint">
            No movements yet. Your stakes, winnings and house adjustments will appear here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            {txs.map((tx, i) => (
              <div key={tx.id}
                className={clsx("flex items-center gap-3 px-4 py-3", i % 2 === 0 ? "bg-panel" : "bg-coal/70")}>
                <span className={clsx(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                  tx.deltaCents >= 0 ? "bg-live/10 text-live" : "bg-loss/10 text-loss",
                )}>
                  {tx.deltaCents >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-cream">
                    {KIND_LABEL[tx.kind] ?? tx.kind}
                  </p>
                  <p className="truncate text-[10.5px] text-faint">
                    {tx.note ?? "—"} · {new Date(tx.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className={clsx("tnum text-[13px] font-bold", tx.deltaCents >= 0 ? "text-live" : "text-loss")}>
                    {tx.deltaCents >= 0 ? "+" : "−"}{formatEuro(Math.abs(tx.deltaCents))}
                  </p>
                  <p className="tnum text-[10px] text-faint">bal {formatEuro(tx.balanceAfter)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
