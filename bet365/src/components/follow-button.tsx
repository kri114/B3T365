"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, BellRing } from "lucide-react";
import clsx from "clsx";
import { useToast, useUser } from "./providers";
import { enableNotifications, notificationState } from "@/lib/notifications";

type Props = {
  eventId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  compact?: boolean;
};

/** Follow a fixture to receive goal / kick-off / HT / FT push alerts. */
export function FollowButton({ eventId, league, homeTeam, awayTeam, startsAt, compact }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/favorites", { cache: "no-store" });
      const data = await res.json();
      setFollowing((data.favorites ?? []).some((f: { eventId: string }) => f.eventId === eventId));
    } catch { /* ignore */ }
  }, [user, eventId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!user) {
      toast({ title: "Sign in required", body: "Follow matches to get live alerts.", tone: "info" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, league, homeTeam, awayTeam, startsAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not update.");
      setFollowing(data.following);

      if (data.following) {
        const state = await notificationState();
        if (state === "granted") {
          toast({ title: "Following this match", body: "Alerts on for goals, HT and FT.", tone: "ok" });
        } else if (state === "unsupported") {
          toast({ title: "Following this match", body: "This browser can't show push alerts.", tone: "info" });
        } else {
          const ok = await enableNotifications();
          toast(
            ok
              ? { title: "Alerts enabled", body: "Goals, kick-off, half time and full time.", tone: "ok" }
              : { title: "Following this match", body: "Enable notifications to get alerts.", tone: "info" },
          );
        }
      } else {
        toast({ title: "Unfollowed", tone: "info" });
      }
    } catch (err) {
      toast({ title: "Failed", body: (err as Error).message, tone: "err" });
    } finally { setBusy(false); }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={following ? "Unfollow — stop alerts" : "Follow — get goal & result alerts"}
      className={clsx(
        "flex shrink-0 items-center gap-1.5 rounded-lg border transition-all",
        compact ? "px-2 py-2" : "px-3 py-2 text-[12px] font-bold",
        following
          ? "border-gold/50 bg-gold/10 text-gold"
          : "border-line bg-raise text-mute hover:border-gold/40 hover:text-gold",
      )}
    >
      {following ? <BellRing size={13} /> : <Star size={13} />}
      {!compact && (following ? "Following" : "Follow")}
    </button>
  );
}
