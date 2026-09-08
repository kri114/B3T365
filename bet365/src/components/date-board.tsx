"use client";

import { useSearchParams } from "next/navigation";
import { MatchBoard } from "./match-board";

/**
 * Reads the ?date= param written by the DateStrip and renders the board for
 * that calendar day. No param → the default rolling window.
 */
export function DateBoard({ league }: { league?: string }) {
  const params = useSearchParams();
  const raw = params.get("date");
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;

  if (league) {
    return date
      ? <MatchBoard league={league} date={date} />
      : <MatchBoard league={league} days={3} />;
  }
  return date ? <MatchBoard date={date} /> : <MatchBoard days={2} />;
}
