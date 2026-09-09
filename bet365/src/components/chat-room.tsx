"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, ShieldCheck, Trash2, MessagesSquare } from "lucide-react";
import clsx from "clsx";
import { useToast, useUser } from "./providers";
import { UserAvatar, StreakBadge } from "./user-avatar";

type Msg = {
  id: string;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  userId: string;
  username: string;
  isAdmin: boolean;
  avatarUrl?: string | null;
  nameColor?: string | null;
  winStreak?: number;
};

export function ChatRoom() {
  const { user } = useUser();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    try {
      const url = cursorRef.current ? `/api/chat?after=${encodeURIComponent(cursorRef.current)}` : "/api/chat";
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) { setLoading(false); return; }
      const data = await res.json();
      const incoming: Msg[] = data.messages ?? [];
      if (incoming.length > 0) {
        cursorRef.current = incoming[incoming.length - 1].createdAt;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
          return merged.slice(-300);
        });
      } else if (!cursorRef.current) {
        setMessages([]);
      }
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  // Keep the view pinned to the newest message unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Message not sent.");
      stickToBottom.current = true;
      await load();
    } catch (err) {
      toast({ title: "Not sent", body: (err as Error).message, tone: "err" });
      setDraft(text);
    } finally { setSending(false); }
  };

  const remove = async (id: string) => {
    await fetch("/api/chat", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true, body: null } : m)));
  };

  if (!user)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
        <MessagesSquare className="text-faint" size={26} />
        <p className="text-sm text-mute">Sign in to join the conversation.</p>
      </div>
    );

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line bg-raise/50 px-4 py-2.5">
        <MessagesSquare size={14} className="text-gold" />
        <span className="text-[12.5px] font-bold tracking-wide text-cream">Punters&apos; Lounge</span>
        <span className="ml-auto text-[10.5px] text-faint">live · refreshes every 4s</span>
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4"
      >
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-[12.5px] text-faint">
            No messages yet — start the debate about tonight&apos;s fixtures.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.userId === user.id;
            return (
              <div key={m.id} className={clsx("group flex flex-col", mine ? "items-end" : "items-start")}>
                <div className="flex items-center gap-2">
                  {!mine && (
                    <>
                      <UserAvatar username={m.username} avatarUrl={m.avatarUrl} nameColor={m.nameColor} size={20} />
                      <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: m.nameColor ?? "#e3c36b" }}>
                        {m.isAdmin && <ShieldCheck size={10} className="text-gold" />}
                        {m.username}
                      </span>
                      <StreakBadge streak={m.winStreak ?? 0} compact />
                    </>
                  )}
                  <span className="tnum text-[9.5px] text-faint">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {user.isAdmin && !m.deleted && (
                    <button onClick={() => remove(m.id)}
                      className="text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-loss"
                      title="Delete message">
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                <p className={clsx(
                  "mt-0.5 max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed break-words",
                  m.deleted
                    ? "border border-dashed border-line bg-transparent text-faint italic"
                    : mine
                      ? "bg-gradient-to-b from-[#e9cf85] to-[#c9a24a] font-medium text-ink"
                      : "border border-line bg-raise text-cream/90",
                )}>
                  {m.deleted ? "message removed by the house" : m.body}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-raise/40 px-3 py-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          maxLength={400}
          placeholder="Talk tactics, brag about your acca…"
          className="flex-1 rounded-xl border border-line bg-raise px-4 py-2.5 text-[13px] text-cream outline-none placeholder:text-faint focus:border-gold/50"
        />
        <button onClick={send} disabled={sending || !draft.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#eed38a] to-[#c39a42] text-ink transition-transform hover:scale-105 active:scale-95 disabled:opacity-40">
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
