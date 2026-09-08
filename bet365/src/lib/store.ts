"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SlipItem = {
  key: string; // eventId:market:line:pick
  eventId: string;
  league: string;
  home: string;
  away: string;
  startsAt: string;
  live: boolean;
  market: string;
  line: number | null;
  pick: string;
  label: string;
  odds: number;
};

type BetSlipState = {
  items: SlipItem[];
  mode: "multi" | "singles";
  multiStake: string;
  singleStakes: Record<string, string>;
  open: boolean; // mobile drawer
  toggle: (item: Omit<SlipItem, "key">) => void;
  remove: (key: string) => void;
  clear: () => void;
  setMode: (m: "multi" | "singles") => void;
  setMultiStake: (v: string) => void;
  setSingleStake: (key: string, v: string) => void;
  setOpen: (v: boolean) => void;
  combinedOdds: () => number;
};

export const slipKey = (i: {
  eventId: string;
  market: string;
  line: number | null;
  pick: string;
}) => `${i.eventId}:${i.market}:${i.line ?? "-"}:${i.pick}`;

export const useBetSlip = create<BetSlipState>()(
  persist(
    (set, get) => ({
      items: [],
      mode: "multi",
      multiStake: "",
      singleStakes: {},
      open: false,
      toggle: (raw) => {
        const key = slipKey(raw);
        const { items } = get();
        if (items.some((i) => i.key === key)) {
          set({ items: items.filter((i) => i.key !== key) });
          return;
        }
        // One selection per fixture — replace any existing leg of the same event.
        const withoutEvent = items.filter((i) => i.eventId !== raw.eventId);
        set({ items: [...withoutEvent, { ...raw, key }] });
      },
      remove: (key) => set({ items: get().items.filter((i) => i.key !== key) }),
      clear: () => set({ items: [], singleStakes: {} }),
      setMode: (mode) => set({ mode }),
      setMultiStake: (multiStake) => set({ multiStake }),
      setSingleStake: (key, v) =>
        set({ singleStakes: { ...get().singleStakes, [key]: v } }),
      setOpen: (open) => set({ open }),
      combinedOdds: () =>
        Math.round(get().items.reduce((acc, i) => acc * i.odds, 1) * 100) / 100,
    }),
    { name: "bet365-slip-v1", partialize: (s) => ({ items: s.items, mode: s.mode }) },
  ),
);

export function parseStake(v: string): number | null {
  const cleaned = v.trim().replace(/[€\s]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/* ------------------------------------------------------------------ */
/* Per-date fixture statistics (feeds the calendar strip badges)        */
/* ------------------------------------------------------------------ */

type DateStatsState = {
  counts: Record<string, { total: number; live: number }>;
  setCounts: (date: string, total: number, live: number) => void;
};

export const useDateStats = create<DateStatsState>()((set, get) => ({
  counts: {},
  setCounts: (date, total, live) => {
    const prev = get().counts[date];
    if (prev && prev.total === total && prev.live === live) return;
    set({ counts: { ...get().counts, [date]: { total, live } } });
  },
}));

/* ------------------------------------------------------------------ */
/* Local-date helpers (client)                                          */
/* ------------------------------------------------------------------ */

export function localDateString(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}
