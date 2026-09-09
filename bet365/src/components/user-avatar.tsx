"use client";

import clsx from "clsx";
import { Flame, ShieldCheck } from "lucide-react";

export function UserAvatar({
  username,
  avatarUrl,
  nameColor,
  size = 28,
}: {
  username: string;
  avatarUrl?: string | null;
  nameColor?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={username}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-line object-cover"
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        background: `${nameColor ?? "#e3c36b"}22`,
        color: nameColor ?? "#e3c36b",
        fontSize: Math.max(9, size * 0.4),
      }}
      className="grid shrink-0 place-items-center rounded-full font-bold"
    >
      {username.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Fire badge shown next to players on a winning run. */
export function StreakBadge({ streak, compact }: { streak: number; compact?: boolean }) {
  if (!streak || streak < 1) return null;
  const hot = streak >= 5;
  return (
    <span
      title={`${streak} winning bet${streak === 1 ? "" : "s"} in a row`}
      className={clsx(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[9.5px] font-bold tnum",
        hot ? "bg-loss/15 text-loss" : "bg-gold/15 text-gold",
      )}
    >
      <Flame size={9} />
      {streak}
      {!compact && (hot ? " on fire" : "")}
    </span>
  );
}

export function AdminBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gold/15 px-1.5 py-px text-[9px] font-bold text-gold uppercase">
      <ShieldCheck size={9} /> house
    </span>
  );
}
