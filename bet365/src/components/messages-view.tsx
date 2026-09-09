"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Send, ArrowLeft, Flag, MessagesSquare, X } from "lucide-react";
import clsx from "clsx";
import { useToast, useUser } from "./providers";
import { UserAvatar, StreakBadge, AdminBadge } from "./user-avatar";

type Conversation = {
  peerId: string; username: string; avatarUrl: string | null; nameColor: string;
  isAdmin: boolean; lastBody: string; lastAt: string; lastMine: boolean; unread: number;
};
type Peer = {
  id: string; username: string; avatarUrl: string | null; nameColor: string;
  isAdmin: boolean; winStreak?: number;
};
type DM = { id: string; body: string | null; deleted?: boolean; mine: boolean; createdAt: string };

export function MessagesView() {
  const { user } = useUser();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [results, setResults] = useState<Peer[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Peer | null>(null);
  const [messages, setMessages] = useState<DM[]>([]);
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<Peer | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/dm", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch { /* keep */ }
  }, []);

  const loadThread = useCallback(async (peerId: string) => {
    try {
      const res = await fetch(`/api/dm?with=${peerId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setActive(data.peer);
      setMessages(data.messages ?? []);
    } catch { /* keep */ }
  }, []);

  useEffect(() => {
    loadConversations();
    const t = setInterval(() => {
      loadConversations();
      if (active) loadThread(active.id);
    }, 5000);
    return () => clearInterval(t);
  }, [loadConversations, loadThread, active]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Search other players.
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data = await res.json();
        setResults(data.users ?? []);
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !active) return;
    setDraft("");
    try {
      const res = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: active.id, body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Not sent.");
      await loadThread(active.id);
      await loadConversations();
    } catch (err) {
      toast({ title: "Not sent", body: (err as Error).message, tone: "err" });
      setDraft(text);
    }
  };

  if (!user)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
        <MessagesSquare className="text-faint" size={26} />
        <p className="text-sm text-mute">Sign in to message other players.</p>
      </div>
    );

  return (
    <>
      <div className="grid h-[calc(100dvh-15rem)] min-h-[440px] grid-cols-1 overflow-hidden rounded-2xl border border-line bg-panel md:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <div className={clsx("flex flex-col border-r border-line", active && "hidden md:flex")}>
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search size={13} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search players…"
                className="w-full rounded-lg border border-line bg-raise py-2 pr-3 pl-8 text-[12.5px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {query.trim() ? (
              results.length === 0 ? (
                <p className="p-4 text-center text-[12px] text-faint">No players found.</p>
              ) : (
                results.map((p) => (
                  <button key={p.id} onClick={() => { setActive(p); loadThread(p.id); setQuery(""); }}
                    className="flex w-full items-center gap-2.5 border-b border-line/50 px-3 py-2.5 text-left hover:bg-raise">
                    <UserAvatar username={p.username} avatarUrl={p.avatarUrl} nameColor={p.nameColor} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-bold" style={{ color: p.nameColor }}>{p.username}</span>
                        {p.isAdmin && <AdminBadge />}
                        <StreakBadge streak={p.winStreak ?? 0} compact />
                      </span>
                      <span className="text-[10.5px] text-faint">Tap to message</span>
                    </span>
                  </button>
                ))
              )
            ) : conversations.length === 0 ? (
              <p className="p-4 text-center text-[12px] leading-relaxed text-faint">
                No conversations yet. Search for a player above to start chatting.
              </p>
            ) : (
              conversations.map((c) => (
                <button key={c.peerId}
                  onClick={() => { setActive({ id: c.peerId, username: c.username, avatarUrl: c.avatarUrl, nameColor: c.nameColor, isAdmin: c.isAdmin }); loadThread(c.peerId); }}
                  className={clsx("flex w-full items-center gap-2.5 border-b border-line/50 px-3 py-2.5 text-left transition-colors hover:bg-raise",
                    active?.id === c.peerId && "bg-lift")}>
                  <UserAvatar username={c.username} avatarUrl={c.avatarUrl} nameColor={c.nameColor} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-bold" style={{ color: c.nameColor }}>{c.username}</span>
                      {c.isAdmin && <AdminBadge />}
                    </span>
                    <span className="block truncate text-[11px] text-faint">
                      {c.lastMine ? "You: " : ""}{c.lastBody}
                    </span>
                  </span>
                  {c.unread > 0 && (
                    <span className="tnum grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-ink">
                      {c.unread}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={clsx("flex flex-col", !active && "hidden md:flex")}>
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <MessagesSquare size={24} className="text-faint" />
              <p className="text-[12.5px] text-mute">Pick a conversation, or search for a player.</p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
                <button onClick={() => setActive(null)} className="p-1 text-faint hover:text-cream md:hidden">
                  <ArrowLeft size={16} />
                </button>
                <UserAvatar username={active.username} avatarUrl={active.avatarUrl} nameColor={active.nameColor} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-bold" style={{ color: active.nameColor }}>{active.username}</span>
                    {active.isAdmin && <AdminBadge />}
                    <StreakBadge streak={active.winStreak ?? 0} compact />
                  </span>
                </span>
                <button onClick={() => setReporting(active)}
                  className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-mute hover:border-loss/40 hover:text-loss"
                  title="Report this player">
                  <Flag size={11} /> Report
                </button>
              </header>

              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-faint">
                    Say hello to {active.username}.
                  </p>
                ) : messages.map((m) => (
                  <div key={m.id} className={clsx("flex flex-col", m.mine ? "items-end" : "items-start")}>
                    <p className={clsx(
                      "max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed break-words",
                      m.deleted
                        ? "border border-dashed border-line text-faint italic"
                        : m.mine
                          ? "bg-gradient-to-b from-[#e9cf85] to-[#c9a24a] font-medium text-ink"
                          : "border border-line bg-raise text-cream/90",
                    )}>
                      {m.deleted ? "message removed" : m.body}
                    </p>
                    <span className="tnum mt-0.5 text-[9.5px] text-faint">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 border-t border-line bg-raise/40 px-3 py-3">
                <input value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  maxLength={600} placeholder={`Message ${active.username}…`}
                  className="flex-1 rounded-xl border border-line bg-raise px-4 py-2.5 text-[13px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
                <button onClick={send} disabled={!draft.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#eed38a] to-[#c39a42] text-ink transition-transform hover:scale-105 disabled:opacity-40">
                  <Send size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {reporting && <ReportDialog peer={reporting} onClose={() => setReporting(null)} />}
    </>
  );
}

function ReportDialog({ peer, onClose }: { peer: Peer; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: peer.id, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed.");
      toast({ title: "Report sent to the house", body: "The admin will review it.", tone: "ok" });
      onClose();
    } catch (err) {
      toast({ title: "Could not report", body: (err as Error).message, tone: "err" });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center px-5">
      <div className="absolute inset-0 bg-ink/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-loss/30 bg-coal p-5 shadow-2xl">
        <div className="flex items-center gap-2">
          <Flag size={15} className="text-loss" />
          <h3 className="text-[14px] font-bold text-cream">Report {peer.username}</h3>
          <button onClick={onClose} className="ml-auto p-1 text-faint hover:text-cream"><X size={15} /></button>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">
          Tell the house what happened. Reports are private and reviewed in the admin console.
        </p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={400}
          placeholder="Describe the problem…"
          className="mt-3 w-full rounded-lg border border-line bg-raise px-3 py-2.5 text-[12.5px] text-cream outline-none placeholder:text-faint focus:border-loss/50" />
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-line py-2 text-[12px] font-bold text-mute hover:text-cream">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !reason.trim()}
            className="flex-1 rounded-lg bg-loss/20 py-2 text-[12px] font-bold text-loss hover:bg-loss/30 disabled:opacity-40">
            {busy ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
