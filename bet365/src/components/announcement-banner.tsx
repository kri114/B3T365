"use client";

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import clsx from "clsx";

type Announcement = {
  id: string;
  message: string;
  tone: "info" | "gold" | "alert";
  createdAt: string;
};

export function AnnouncementBanner({ initial }: { initial: Announcement[] }) {
  const [items, setItems] = useState<Announcement[]>(initial);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bet365_dismissed") ?? "[]") as string[];
      setHidden(new Set(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/announcements", { cache: "no-store" });
        const data = await res.json();
        setItems(data.announcements ?? []);
      } catch { /* ignore */ }
    };
    const t = setInterval(load, 45_000);
    return () => clearInterval(t);
  }, []);

  const dismiss = (id: string) => {
    const next = new Set(hidden);
    next.add(id);
    setHidden(next);
    localStorage.setItem("bet365_dismissed", JSON.stringify([...next]));
  };

  const visible = items.filter((a) => !hidden.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="mx-auto mt-3 flex max-w-[1500px] flex-col gap-2 px-3 sm:px-5">
      {visible.slice(0, 2).map((a) => (
        <div
          key={a.id}
          className={clsx(
            "animate-rise flex items-start gap-3 rounded-xl border px-4 py-3",
            a.tone === "gold"
              ? "border-gold/35 bg-[#181206]"
              : a.tone === "alert"
                ? "border-loss/35 bg-[#1a0d0e]"
                : "border-sky/25 bg-[#0a111c]",
          )}
        >
          <Megaphone
            size={15}
            className={clsx(
              "mt-0.5 shrink-0",
              a.tone === "gold" ? "text-gold" : a.tone === "alert" ? "text-loss" : "text-sky",
            )}
          />
          <p className="flex-1 text-[12.5px] leading-relaxed text-cream/90">{a.message}</p>
          <button onClick={() => dismiss(a.id)} className="p-0.5 text-faint transition-colors hover:text-cream">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
