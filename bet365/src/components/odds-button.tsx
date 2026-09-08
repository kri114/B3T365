"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";

type Props = {
  label?: string;
  sub?: string;
  odds: number;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  compact?: boolean;
};

/**
 * A bookmaker-style price button. Flashes green/red when the quote moves
 * between refreshes — just like a real trading board.
 */
export function OddsButton({ label, sub, odds, active, disabled, onClick, compact }: Props) {
  const prev = useRef<number>(odds);
  const [dir, setDir] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (odds > prev.current + 0.001) setDir("up");
    else if (odds < prev.current - 0.001) setDir("down");
    if (odds !== prev.current) {
      prev.current = odds;
      const t = setTimeout(() => setDir(null), 1200);
      return () => clearTimeout(t);
    }
  }, [odds]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "group/odds relative flex flex-col items-center justify-center gap-0.5 rounded-lg border transition-all duration-200 tnum",
        compact ? "px-2 py-1.5 min-w-[64px]" : "px-3 py-2 min-w-[72px]",
        active
          ? "border-gold bg-gradient-to-b from-[#e9cf85] to-[#c9a24a] text-ink shadow-[0_4px_18px_-6px_rgba(227,195,107,0.55)]"
          : "border-line bg-raise text-cream hover:border-gold/45 hover:bg-lift hover:shadow-[0_4px_16px_-8px_rgba(227,195,107,0.35)]",
        dir === "up" && !active && "animate-flash-up",
        dir === "down" && !active && "animate-flash-down",
        disabled && "cursor-not-allowed opacity-40 hover:border-line hover:bg-raise",
        !disabled && "cursor-pointer active:scale-[0.97]",
      )}
    >
      {dir && !active && (
        <span
          className={clsx(
            "absolute -top-1.5 -right-1.5 rounded-full p-0.5",
            dir === "up" ? "bg-live/90 text-ink" : "bg-loss/90 text-ink",
          )}
        >
          {dir === "up" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        </span>
      )}
      {(label || sub) && (
        <span
          className={clsx(
            "text-[10px] font-medium uppercase tracking-[0.08em]",
            active ? "text-ink/70" : "text-mute",
          )}
        >
          {sub ?? label}
        </span>
      )}
      <span
        className={clsx(
          "font-semibold leading-none",
          compact ? "text-[12.5px]" : "text-[13.5px]",
          active ? "text-ink" : "text-gold group-hover/odds:text-[#f0d88f]",
        )}
      >
        {odds.toFixed(2)}
      </span>
      {label && sub && (
        <span
          className={clsx(
            "max-w-[110px] truncate text-[10.5px] font-medium",
            active ? "text-ink/80" : "text-mute",
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
}
