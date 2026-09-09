"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Trash2, KeyRound, Save, Flame, Trophy, ShieldQuestion } from "lucide-react";
import clsx from "clsx";
import { formatEuro } from "@/lib/money";
import { useToast, useUser } from "./providers";
import { UserAvatar } from "./user-avatar";

type Profile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  nameColor: string;
  balanceCents: number;
  debtCents: number;
  creditLimitCents: number;
  winStreak: number;
  bestStreak: number;
  isAdmin: boolean;
  createdAt: string;
};

const COLOURS = ["#e3c36b", "#3ddc84", "#7fb5ff", "#f47174", "#f4a3c1", "#b39ddb", "#7fd8d0", "#f0a868", "#f2edde"];

export function ProfileView() {
  const { user, refresh } = useUser();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingReset, setPendingReset] = useState<{ id: string } | null>(null);
  const [username, setUsername] = useState("");
  const [colour, setColour] = useState("#e3c36b");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data.profile);
      setPendingReset(data.pendingReset);
      setUsername(data.profile.username);
      setColour(data.profile.nameColor);
      setAvatar(data.profile.avatarUrl);
    } catch { /* keep */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Downscale to 128×128 so the data URL stays small enough for the DB. */
  const pickAvatar = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image file", tone: "err" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setAvatar(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", username, nameColor: colour, avatarUrl: avatar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed.");
      toast({ title: "Profile saved", tone: "ok" });
      await Promise.all([load(), refresh()]);
    } catch (err) {
      toast({ title: "Could not save", body: (err as Error).message, tone: "err" });
    } finally { setBusy(false); }
  };

  if (!user || !profile)
    return (
      <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-mute">
        Sign in to manage your profile.
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      {/* Identity */}
      <section className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <UserAvatar username={username || profile.username} avatarUrl={avatar} nameColor={colour} size={72} />
            <button onClick={() => fileRef.current?.click()}
              className="absolute -right-1 -bottom-1 grid h-7 w-7 place-items-center rounded-full border border-gold/40 bg-coal text-gold transition-transform hover:scale-110"
              title="Upload a picture">
              <Camera size={13} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAvatar(f); }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold tracking-[0.18em] text-mute uppercase">Display name</p>
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20}
              style={{ color: colour }}
              className="mt-1 w-full max-w-xs rounded-lg border border-line bg-raise px-3 py-2 text-[15px] font-bold outline-none focus:border-gold/50" />
            <p className="mt-1 text-[10.5px] text-faint">3–20 characters: letters, numbers, underscores.</p>
          </div>
          {avatar && (
            <button onClick={() => setAvatar(null)}
              className="flex items-center gap-1.5 self-start rounded-lg border border-line px-3 py-2 text-[11.5px] font-bold text-mute hover:border-loss/40 hover:text-loss">
              <Trash2 size={12} /> Remove photo
            </button>
          )}
        </div>

        <p className="mt-5 text-[10.5px] font-bold tracking-[0.18em] text-mute uppercase">Name colour</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {COLOURS.map((c) => (
            <button key={c} onClick={() => setColour(c)}
              style={{ background: c }}
              className={clsx(
                "h-7 w-7 rounded-full transition-transform hover:scale-110",
                colour.toLowerCase() === c.toLowerCase() ? "ring-2 ring-cream ring-offset-2 ring-offset-panel" : "",
              )} />
          ))}
          <input type="color" value={colour} onChange={(e) => setColour(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-line bg-raise" title="Custom colour" />
        </div>

        <button onClick={saveProfile} disabled={busy}
          className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#eed38a] to-[#c39a42] px-5 py-2.5 text-[13px] font-bold text-ink transition-transform hover:scale-[1.02] disabled:opacity-60">
          <Save size={14} /> {busy ? "Saving…" : "Save profile"}
        </button>
      </section>

      {/* Streak & wallet */}
      <section className="grid gap-3 sm:grid-cols-3">
        <StatBox icon={Flame} label="Win streak" value={String(profile.winStreak)}
          sub={profile.winStreak >= 5 ? "You're on fire" : "Consecutive winning bets"}
          tone={profile.winStreak >= 5 ? "hot" : profile.winStreak > 0 ? "gold" : undefined} />
        <StatBox icon={Trophy} label="Best streak" value={String(profile.bestStreak)} sub="Personal record" />
        <StatBox icon={Flame} label="Balance" value={formatEuro(profile.balanceCents)}
          sub={profile.debtCents > 0 ? `${formatEuro(profile.debtCents)} owed` : "Virtual euros"}
          tone={profile.balanceCents < 0 ? "loss" : undefined} />
      </section>

      <PasswordPanel pendingReset={pendingReset} reload={load} />
    </div>
  );
}

function StatBox({ icon: Icon, label, value, sub, tone }: {
  icon: React.ElementType; label: string; value: string; sub: string;
  tone?: "hot" | "gold" | "loss";
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-faint uppercase">
        <Icon size={11} /> {label}
      </div>
      <p className={clsx("tnum mt-1 text-2xl font-bold",
        tone === "hot" ? "text-loss" : tone === "loss" ? "text-loss" : tone === "gold" ? "text-gold" : "text-cream")}>
        {value}
      </p>
      <p className="text-[10.5px] text-faint">{sub}</p>
    </div>
  );
}

function PasswordPanel({ pendingReset, reload }: { pendingReset: { id: string } | null; reload: () => Promise<void> }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"change" | "forgot">("change");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "change"
            ? { action: "password", currentPassword: current, newPassword: next }
            : { action: "requestReset", newPassword: next, note },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed.");
      toast({ title: data.message ?? "Done", tone: "ok" });
      setCurrent(""); setNext(""); setNote("");
      await reload();
    } catch (err) {
      toast({ title: "Failed", body: (err as Error).message, tone: "err" });
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <header className="flex items-center gap-2">
        <KeyRound size={14} className="text-gold" />
        <h3 className="text-[13.5px] font-bold tracking-wide text-cream">Password</h3>
      </header>

      {pendingReset ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-sky/25 bg-sky/10 px-3 py-2.5 text-[12px] text-sky">
          <ShieldQuestion size={14} />
          Your reset request is awaiting the house. Once approved, sign in with your new password.
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-1.5">
            {(["change", "forgot"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={clsx("rounded-lg border px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                  mode === m ? "border-gold/40 bg-gold/10 text-gold" : "border-line text-mute hover:text-cream")}>
                {m === "change" ? "I know my password" : "I forgot it"}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:max-w-sm">
            {mode === "change" && (
              <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                placeholder="Current password" autoComplete="current-password"
                className="rounded-lg border border-line bg-raise px-3 py-2.5 text-[13px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
            )}
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
              placeholder="New password (min 6 characters)" autoComplete="new-password"
              className="rounded-lg border border-line bg-raise px-3 py-2.5 text-[13px] text-cream outline-none placeholder:text-faint focus:border-gold/50" />
            {mode === "forgot" && (
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
                placeholder="Message to the house (optional)"
                className="rounded-lg border border-line bg-raise px-3 py-2 text-[12px] text-mute outline-none placeholder:text-faint focus:border-gold/50" />
            )}
            <button onClick={submit} disabled={busy || next.length < 6}
              className="rounded-xl border border-gold/30 bg-gold/10 py-2.5 text-[12.5px] font-bold text-gold transition-colors hover:bg-gold/20 disabled:opacity-40">
              {busy ? "Working…" : mode === "change" ? "Change password" : "Request reset from the house"}
            </button>
            {mode === "forgot" && (
              <p className="text-[10.5px] leading-relaxed text-faint">
                Choose the password you want. It only becomes active once the admin approves the
                request — you&apos;ll be signed out everywhere when that happens.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
