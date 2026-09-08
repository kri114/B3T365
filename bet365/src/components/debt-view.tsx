"use client";

import { useCallback, useEffect, useState } from "react";
import { HandCoins, Clock3, Check, X, Undo2 } from "lucide-react";
import clsx from "clsx";
import { formatEuro, parseEuroToCents } from "@/lib/money";
import { useToast, useUser } from "./providers";

type DebtRequest = {
  id: string;
  amountCents: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

const STATUS: Record<string, { cls: string; icon: React.ElementType }> = {
  pending: { cls: "border-sky/25 bg-sky/10 text-sky", icon: Clock3 },
  approved: { cls: "border-live/25 bg-live/10 text-live", icon: Check },
  rejected: { cls: "border-loss/25 bg-loss/10 text-loss", icon: X },
};

export function DebtView() {
  const { user, refresh } = useUser();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DebtRequest[]>([]);
  const [debtCents, setDebtCents] = useState(0);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [repay, setRepay] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/debts", { cache: "no-store" });
      if (res.status === 401) return;
      const data = await res.json();
      setRequests(data.requests ?? []);
      setDebtCents(data.debtCents ?? 0);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const submit = async () => {
    const cents = parseEuroToCents(amount);
    if (!cents) {
      toast({ title: "Enter a valid amount", body: "e.g. 50 or 25.50", tone: "err" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", amountCents: cents, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed.");
      toast({ title: "Request sent to the house", body: "You'll see the decision here.", tone: "ok" });
      setAmount(""); setReason("");
      await load();
    } catch (err) {
      toast({ title: "Could not send request", body: (err as Error).message, tone: "err" });
    } finally { setBusy(false); }
  };

  const doRepay = async () => {
    const cents = parseEuroToCents(repay);
    if (!cents) {
      toast({ title: "Enter a valid amount", tone: "err" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "repay", amountCents: cents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Repayment failed.");
      toast({ title: `Repaid ${formatEuro(data.repaidCents)}`, tone: "ok" });
      setRepay("");
      await Promise.all([load(), refresh()]);
    } catch (err) {
      toast({ title: "Repayment failed", body: (err as Error).message, tone: "err" });
    } finally { setBusy(false); }
  };

  if (!user)
    return (
      <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-mute">
        Sign in to request credit from the house.
      </div>
    );

  const hasPending = requests.some((r) => r.status === "pending");

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-gold/20 bg-gradient-to-br from-lift via-panel to-panel p-5">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-mute uppercase">Outstanding debt</p>
          <p className={clsx("tnum mt-1 text-3xl font-bold", debtCents > 0 ? "text-loss" : "text-live")}>
            {formatEuro(debtCents)}
          </p>
          <p className="mt-1.5 text-[11px] text-faint">
            {debtCents > 0
              ? "Credit advanced by the house. Repay any time from your balance."
              : "You're all square with the house."}
          </p>
          {debtCents > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[12px] text-faint">€</span>
                <input value={repay} onChange={(e) => setRepay(e.target.value)} inputMode="decimal" placeholder="0.00"
                  className="tnum w-full rounded-lg border border-line bg-raise py-2 pr-2 pl-7 text-[13px] font-semibold text-cream outline-none placeholder:text-faint focus:border-gold/50" />
              </div>
              <button onClick={doRepay} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-live/15 px-3 py-2 text-[12px] font-bold text-live transition-colors hover:bg-live/25 disabled:opacity-50">
                <Undo2 size={13} /> Repay
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.18em] text-mute uppercase">
            <HandCoins size={12} className="text-gold" /> Request credit
          </p>
          {hasPending ? (
            <p className="mt-3 rounded-lg border border-sky/25 bg-sky/10 px-3 py-2.5 text-[12px] text-sky">
              You have a pending request awaiting the house&apos;s decision.
            </p>
          ) : (
            <>
              <div className="relative mt-3">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-faint">€</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="How much do you need?"
                  className="tnum w-full rounded-xl border border-line bg-raise py-2.5 pr-3 pl-8 text-[14px] font-bold text-cream outline-none placeholder:text-[12.5px] placeholder:font-normal placeholder:text-faint focus:border-gold/50" />
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason (optional)"
                className="mt-2 w-full rounded-xl border border-line bg-raise px-3 py-2 text-[12.5px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
              <button onClick={submit} disabled={busy}
                className="mt-3 w-full rounded-xl bg-gradient-to-b from-[#eed38a] to-[#c39a42] py-2.5 text-[13px] font-bold text-ink transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60">
                {busy ? "Sending…" : "Send request to the house"}
              </button>
            </>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2.5 text-[12px] font-bold tracking-[0.16em] text-mute uppercase">Your requests</h3>
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl border border-line" />)}
          </div>
        ) : requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-10 text-center text-[12.5px] text-faint">
            No credit requests yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => {
              const s = STATUS[r.status] ?? STATUS.pending;
              const Icon = s.icon;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
                  <span className={clsx("flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", s.cls)}>
                    <Icon size={10} /> {r.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="tnum text-[13px] font-bold text-cream">{formatEuro(r.amountCents)}</p>
                    <p className="truncate text-[10.5px] text-faint">
                      {r.reason || "No reason given"}
                      {r.adminNote ? ` · house: ${r.adminNote}` : ""}
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-[10px] text-faint">
                    {new Date(r.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
