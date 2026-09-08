"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Swords, Megaphone, Plus, Minus, Ban, RotateCcw, Trash2,
  ShieldCheck, Search, CircleDollarSign, Ticket, Activity, HandCoins, Check, X,
} from "lucide-react";
import clsx from "clsx";
import { formatEuro, parseEuroToCents } from "@/lib/money";
import { useToast, useUser } from "./providers";
import type { BetDTO } from "./bets-view";

type AdminUser = {
  id: string;
  username: string;
  balanceCents: number;
  isAdmin: boolean;
  isBanned: boolean;
  banReason: string | null;
  createdAt: string;
  openBets: number;
};

type Announcement = { id: string; message: string; tone: string; active: boolean; createdAt: string };
type AdminBet = BetDTO & { username: string };

type DebtRow = {
  request: {
    id: string;
    userId: string;
    amountCents: number;
    reason: string | null;
    status: "pending" | "approved" | "rejected";
    adminNote: string | null;
    createdAt: string;
  };
  username: string;
  balanceCents: number;
  debtCents: number;
};

const TABS = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "users", label: "Users & Wallets", icon: Users },
  { id: "bets", label: "Bets", icon: Ticket },
  { id: "debts", label: "Credit Requests", icon: HandCoins },
  { id: "news", label: "Announcements", icon: Megaphone },
] as const;

export function AdminConsole() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bets, setBets] = useState<AdminBet[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const { toast } = useToast();
  const { user: me } = useUser();

  const loadDebts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/debts", { cache: "no-store" });
      const data = await res.json();
      setDebts(data.requests ?? []);
    } catch { /* keep */ }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch { /* keep */ }
  }, []);

  const loadBets = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bets", { cache: "no-store" });
      const data = await res.json();
      setBets(data.bets ?? []);
    } catch { /* keep */ }
  }, []);

  const loadNews = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/announcements", { cache: "no-store" });
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
    } catch { /* keep */ }
  }, []);

  useEffect(() => {
    loadUsers(); loadBets(); loadNews(); loadDebts();
    const t = setInterval(() => { loadUsers(); loadBets(); loadDebts(); }, 20_000);
    return () => clearInterval(t);
  }, [loadUsers, loadBets, loadNews, loadDebts]);

  const userAction = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast({ title: "Action failed", body: data?.error, tone: "err" });
    else toast({ title: okMsg, tone: "ok" });
    await loadUsers();
  };

  const stats = useMemo(() => {
    const totalBalances = users.reduce((a, u) => a + u.balanceCents, 0);
    const open = bets.filter((b) => b.bet.status === "open");
    const liability = open.reduce((a, b) => a + b.bet.potentialCents, 0);
    const staked = open.reduce((a, b) => a + b.bet.stakeCents, 0);
    const totalDebt = [
      ...new Map(debts.map((d) => [d.request.userId, d.debtCents])).values(),
    ].reduce((a, v) => a + v, 0);
    return { totalBalances, openCount: open.length, liability, staked, totalDebt };
  }, [users, bets, debts]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-gold/30 bg-lift">
          <ShieldCheck size={16} className="text-gold" />
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold text-cream">House Console</h1>
          <p className="text-[11px] text-faint">Signed in as {me?.username} · single-device session active</p>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12.5px] font-bold transition-colors",
              tab === id ? "border-gold/40 bg-gold/10 text-gold" : "border-line text-mute hover:text-cream",
            )}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Registered players" value={String(users.filter((u) => !u.isAdmin).length)} icon={Users} />
          <StatCard label="Virtual euros in circulation" value={formatEuro(stats.totalBalances)} icon={CircleDollarSign} />
          <StatCard label="Open bets" value={String(stats.openCount)} icon={Ticket} />
          <StatCard label="Open liability" value={formatEuro(stats.liability)} icon={Swords}
            sub={`${formatEuro(stats.staked)} staked`} />
          <StatCard
            label="Pending credit requests"
            value={String(debts.filter((d) => d.request.status === "pending").length)}
            icon={HandCoins}
            sub={`${formatEuro(stats.totalDebt)} owed to the house`}
          />
          <div className="col-span-2 rounded-xl border border-line bg-panel p-4 text-[11.5px] leading-relaxed text-mute lg:col-span-4">
            <p className="mb-1 font-bold tracking-wider text-gold uppercase">How you control the economy</p>
            <p>
              Fund or fine any wallet under <b className="text-cream">Users &amp; Wallets</b> — adjustments land instantly
              and appear in the player&apos;s ledger. Under <b className="text-cream">Bets</b> you can force any ticket to
              be won, lost or voided, which is how you decide exactly how much each player wins or loses.
              Under <b className="text-cream">Announcements</b> you publish messages that appear at the top of every screen.
            </p>
          </div>
        </div>
      )}

      {tab === "users" && <UsersPanel users={users} me={me?.id} onAction={userAction} />}
      {tab === "bets" && <BetsPanel bets={bets} reload={loadBets} />}
      {tab === "debts" && <DebtsPanel rows={debts} reload={async () => { await loadDebts(); await loadUsers(); }} />}
      {tab === "news" && <NewsPanel announcements={announcements} reload={loadNews} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: React.ElementType; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-faint uppercase">
        <Icon size={11} /> {label}
      </div>
      <p className="tnum mt-1.5 truncate text-xl font-bold text-cream">{value}</p>
      {sub && <p className="text-[10.5px] text-faint">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UsersPanel({
  users, me, onAction,
}: {
  users: AdminUser[];
  me?: string;
  onAction: (id: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const filtered = users.filter((u) => u.username.toLowerCase().includes(query.toLowerCase()));

  const move = (u: AdminUser, dir: "credit" | "debit") => {
    const cents = parseEuroToCents(amounts[u.id] ?? "");
    if (!cents || cents <= 0) {
      toast({ title: "Enter an amount first", body: "e.g. 250 or 99.50 (euros)", tone: "err" });
      return;
    }
    onAction(u.id, { action: dir, amountCents: cents, note: notes[u.id] || undefined },
      `${dir === "credit" ? "Credited" : "Debited"} ${formatEuro(cents)} ${dir === "credit" ? "to" : "from"} ${u.username}`);
    setAmounts((a) => ({ ...a, [u.id]: "" }));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-xs">
        <Search size={13} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players…"
          className="w-full rounded-lg border border-line bg-raise py-2 pr-3 pl-8 text-[13px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-line bg-raise/60 text-[10px] font-bold tracking-wider text-faint uppercase">
              <th className="px-4 py-2.5">Player</th>
              <th className="px-4 py-2.5">Balance</th>
              <th className="px-4 py-2.5">Open bets</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Wallet control (€)</th>
              <th className="px-4 py-2.5">Moderation</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-line/50 align-middle last:border-0 hover:bg-raise/30">
                <td className="px-4 py-3">
                  <span className="text-[13px] font-bold text-cream">{u.username}</span>
                  {u.id === me && <span className="ml-1.5 rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold uppercase">you</span>}
                  {u.isAdmin && <span className="ml-1.5 rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold uppercase">admin</span>}
                  <p className="text-[10px] text-faint">joined {new Date(u.createdAt).toLocaleDateString()}</p>
                </td>
                <td className="tnum px-4 py-3 text-[14px] font-bold text-gold">{formatEuro(u.balanceCents)}</td>
                <td className="tnum px-4 py-3 text-[12.5px] text-mute">{u.openBets}</td>
                <td className="px-4 py-3">
                  {u.isBanned ? (
                    <span className="rounded-full bg-loss/15 px-2 py-0.5 text-[10px] font-bold text-loss uppercase">banned</span>
                  ) : (
                    <span className="rounded-full bg-live/10 px-2 py-0.5 text-[10px] font-bold text-live uppercase">active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={amounts[u.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [u.id]: e.target.value }))}
                      inputMode="decimal" placeholder="0.00"
                      className="tnum w-24 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-[12.5px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
                    <button onClick={() => move(u, "credit")} title="Credit"
                      className="grid h-7 w-7 place-items-center rounded-lg bg-live/15 text-live transition-transform hover:scale-105">
                      <Plus size={14} />
                    </button>
                    <button onClick={() => move(u, "debit")} title="Debit"
                      className="grid h-7 w-7 place-items-center rounded-lg bg-loss/15 text-loss transition-transform hover:scale-105">
                      <Minus size={14} />
                    </button>
                    <input
                      value={notes[u.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [u.id]: e.target.value }))}
                      placeholder="note (optional)"
                      className="w-32 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-[11px] text-mute outline-none placeholder:text-faint focus:border-gold/50" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.isAdmin ? (
                    <span className="text-[10.5px] text-faint">protected</span>
                  ) : u.isBanned ? (
                    <button onClick={() => onAction(u.id, { action: "unban" }, `${u.username} unbanned`)}
                      className="flex items-center gap-1 rounded-lg bg-live/15 px-2.5 py-1.5 text-[11px] font-bold text-live">
                      <RotateCcw size={12} /> Unban
                    </button>
                  ) : (
                    <button onClick={() => onAction(u.id, { action: "ban", note: notes[u.id] || undefined }, `${u.username} banned`)}
                      className="flex items-center gap-1 rounded-lg bg-loss/15 px-2.5 py-1.5 text-[11px] font-bold text-loss">
                      <Ban size={12} /> Ban
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BetsPanel({ bets, reload }: { bets: AdminBet[]; reload: () => Promise<void> }) {
  const { toast } = useToast();

  const override = async (id: string, action: "won" | "lost" | "void") => {
    const res = await fetch(`/api/admin/bets/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast({ title: "Override failed", body: data?.error, tone: "err" });
    else toast({ title: `Bet forced to ${action.toUpperCase()}`, tone: "ok" });
    await reload();
  };

  if (bets.length === 0)
    return <p className="rounded-xl border border-dashed border-line py-14 text-center text-[12.5px] text-faint">No bets placed yet.</p>;

  return (
    <div className="flex flex-col gap-2.5">
      {bets.map((b) => (
        <div key={b.bet.id} className="rounded-xl border border-line bg-panel p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-bold text-cream">{b.username}</span>
            <span className={clsx("rounded-full border px-2 py-px text-[9.5px] font-bold uppercase",
              b.bet.status === "open" ? "border-sky/25 bg-sky/10 text-sky"
                : b.bet.status === "won" ? "border-live/25 bg-live/10 text-live"
                : b.bet.status === "lost" ? "border-loss/25 bg-loss/10 text-loss"
                : "border-line2 bg-lift text-mute")}>
              {b.bet.status}
            </span>
            <span className="text-[10.5px] tracking-wide text-faint uppercase">
              {b.bet.kind} · {b.selections.length} leg{b.selections.length > 1 ? "s" : ""}
            </span>
            <span className="tnum ml-auto text-[12.5px] text-mute">
              stake <b className="text-cream">{formatEuro(b.bet.stakeCents)}</b> @ {b.bet.totalOdds.toFixed(2)} →{" "}
              <b className="text-gold">{formatEuro(b.bet.potentialCents)}</b>
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] text-faint">
            {b.selections.map((s) => `${s.label} (${s.homeTeam} v ${s.awayTeam})`).join("  ·  ")}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold tracking-wider text-faint uppercase">Force:</span>
            <button onClick={() => override(b.bet.id, "won")}
              className="rounded-md bg-live/15 px-2.5 py-1 text-[11px] font-bold text-live hover:bg-live/25">WON</button>
            <button onClick={() => override(b.bet.id, "lost")}
              className="rounded-md bg-loss/15 px-2.5 py-1 text-[11px] font-bold text-loss hover:bg-loss/25">LOST</button>
            <button onClick={() => override(b.bet.id, "void")}
              className="rounded-md bg-lift px-2.5 py-1 text-[11px] font-bold text-mute hover:text-cream">VOID</button>
            <span className="tnum ml-auto text-[10px] text-faint">
              {new Date(b.bet.placedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DebtsPanel({ rows, reload }: { rows: DebtRow[]; reload: () => Promise<void> }) {
  const { toast } = useToast();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = async (id: string, action: "approve" | "reject") => {
    const override = parseEuroToCents(amounts[id] ?? "");
    const res = await fetch("/api/admin/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        action,
        note: notes[id] || undefined,
        amountCents: action === "approve" && override ? override : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast({ title: "Action failed", body: data?.error, tone: "err" });
    else
      toast({
        title: action === "approve" ? `Credit approved (${formatEuro(data.approvedCents)})` : "Request rejected",
        tone: "ok",
      });
    await reload();
  };

  const clearDebt = async (userId: string, username: string) => {
    const res = await fetch("/api/admin/debts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) toast({ title: `${username}'s debt cleared`, tone: "ok" });
    await reload();
  };

  const pending = rows.filter((r) => r.request.status === "pending");
  const decided = rows.filter((r) => r.request.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[11px] font-bold tracking-wider text-faint uppercase">
          Pending ({pending.length})
        </p>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-10 text-center text-[12.5px] text-faint">
            No pending credit requests.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {pending.map(({ request: r, username, balanceCents, debtCents }) => (
              <div key={r.id} className="rounded-xl border border-sky/25 bg-panel p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-cream">{username}</span>
                  <span className="tnum text-[11px] text-faint">
                    balance {formatEuro(balanceCents)} · debt {formatEuro(debtCents)}
                  </span>
                  <span className="tnum ml-auto text-[15px] font-bold text-gold">
                    {formatEuro(r.amountCents)}
                  </span>
                </div>
                {r.reason && <p className="mt-1 text-[11.5px] text-mute">&ldquo;{r.reason}&rdquo;</p>}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <div className="relative">
                    <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[11px] text-faint">€</span>
                    <input value={amounts[r.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                      inputMode="decimal" placeholder="counter-offer"
                      className="tnum w-28 rounded-lg border border-line bg-raise py-1.5 pr-2 pl-6 text-[12px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
                  </div>
                  <input value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="note to player"
                    className="w-40 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-[11px] text-mute outline-none placeholder:text-faint focus:border-gold/50" />
                  <button onClick={() => decide(r.id, "approve")}
                    className="flex items-center gap-1 rounded-lg bg-live/15 px-3 py-1.5 text-[11.5px] font-bold text-live hover:bg-live/25">
                    <Check size={13} /> Approve
                  </button>
                  <button onClick={() => decide(r.id, "reject")}
                    className="flex items-center gap-1 rounded-lg bg-loss/15 px-3 py-1.5 text-[11.5px] font-bold text-loss hover:bg-loss/25">
                    <X size={13} /> Reject
                  </button>
                  <span className="tnum ml-auto text-[10px] text-faint">
                    {new Date(r.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold tracking-wider text-faint uppercase">Outstanding debts</p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="border-b border-line bg-raise/60 text-[10px] font-bold tracking-wider text-faint uppercase">
                <th className="px-4 py-2.5">Player</th>
                <th className="px-4 py-2.5">Owes</th>
                <th className="px-4 py-2.5">Balance</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {[...new Map(rows.filter((r) => r.debtCents > 0).map((r) => [r.request.userId, r])).values()].map(
                ({ request: r, username, balanceCents, debtCents }) => (
                  <tr key={r.userId} className="border-b border-line/50 last:border-0">
                    <td className="px-4 py-2.5 text-[12.5px] font-bold text-cream">{username}</td>
                    <td className="tnum px-4 py-2.5 text-[13px] font-bold text-loss">{formatEuro(debtCents)}</td>
                    <td className="tnum px-4 py-2.5 text-[12px] text-mute">{formatEuro(balanceCents)}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => clearDebt(r.userId, username)}
                        className="rounded-md bg-lift px-2.5 py-1 text-[11px] font-bold text-mute hover:text-cream">
                        Forgive
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {rows.every((r) => r.debtCents <= 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[12px] text-faint">
                    Nobody owes the house anything.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {decided.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold tracking-wider text-faint uppercase">History</p>
          <div className="flex flex-col gap-1.5">
            {decided.slice(0, 25).map(({ request: r, username }) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3.5 py-2">
                <span className={clsx("rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase",
                  r.status === "approved" ? "bg-live/10 text-live" : "bg-loss/10 text-loss")}>
                  {r.status}
                </span>
                <span className="text-[12px] font-semibold text-cream">{username}</span>
                <span className="tnum text-[12px] text-gold">{formatEuro(r.amountCents)}</span>
                <span className="truncate text-[10.5px] text-faint">{r.adminNote ?? r.reason ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewsPanel({ announcements, reload }: { announcements: Announcement[]; reload: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("gold");
  const { toast } = useToast();

  const create = async () => {
    if (!message.trim()) return;
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, tone }),
    });
    if (res.ok) {
      toast({ title: "Announcement published", tone: "ok" });
      setMessage("");
      await reload();
    } else toast({ title: "Publish failed", tone: "err" });
  };

  const toggle = async (id: string, active: boolean) => {
    await fetch("/api/admin/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    await reload();
  };

  const remove = async (id: string) => {
    await fetch("/api/admin/announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await reload();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="mb-2 text-[11px] font-bold tracking-wider text-faint uppercase">New announcement</p>
        <textarea
          value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300}
          placeholder="Shown as a banner at the top of every player's screen…"
          className="w-full rounded-lg border border-line bg-raise px-3 py-2.5 text-[13px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
        <div className="mt-2 flex items-center gap-2">
          {(["gold", "info", "alert"] as const).map((t) => (
            <button key={t} onClick={() => setTone(t)}
              className={clsx("rounded-lg border px-3 py-1.5 text-[11.5px] font-bold capitalize transition-colors",
                tone === t ? "border-gold/40 bg-gold/10 text-gold" : "border-line text-mute")}>
              {t}
            </button>
          ))}
          <button onClick={create}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#eed38a] to-[#c39a42] px-4 py-1.5 text-[12px] font-bold text-ink">
            <Megaphone size={13} /> Publish
          </button>
        </div>
      </div>

      {announcements.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-[12.5px] text-faint">No announcements yet.</p>
      ) : (
        announcements.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3.5">
            <span className={clsx("mt-0.5 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase",
              a.active ? "bg-live/10 text-live" : "bg-lift text-faint")}>
              {a.active ? "live" : "hidden"}
            </span>
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-cream/90">{a.message}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              <button onClick={() => toggle(a.id, !a.active)}
                className="rounded-md bg-lift px-2.5 py-1 text-[11px] font-bold text-mute hover:text-cream">
                {a.active ? "Hide" : "Show"}
              </button>
              <button onClick={() => remove(a.id)} className="rounded-md bg-loss/10 p-1.5 text-loss hover:bg-loss/20">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
