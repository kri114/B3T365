"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus, Eye, EyeOff } from "lucide-react";
import { useUser, useToast } from "./providers";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser } = useUser();
  const { toast } = useToast();
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong.");
      setUser(data.user);
      toast({
        title: mode === "login" ? `Welcome back, ${data.user.username}` : "Account created",
        body:
          mode === "signup"
            ? "Your wallet starts at €0.00 — the house funds accounts manually."
            : undefined,
        tone: "ok",
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-cream">
        {isLogin ? "Welcome back." : "Take your seat."}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">
        {isLogin
          ? "Sign in to your virtual account to keep betting."
          : "Every account runs on virtual euros — funded and managed by the house. No deposit, no risk."}
      </p>

      <label className="mt-7 block text-[11px] font-bold tracking-[0.16em] text-mute uppercase">
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          placeholder={isLogin ? "Your username" : "3–20 letters, numbers, _"}
          className="mt-1.5 w-full rounded-xl border border-line bg-raise px-4 py-3 text-[14px] font-medium text-cream outline-none normal-case placeholder:text-faint focus:border-gold/50"
        />
      </label>

      <label className="mt-4 block text-[11px] font-bold tracking-[0.16em] text-mute uppercase">
        Password
        <span className="relative mt-1.5 block">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPw ? "text" : "password"}
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? "Your password" : "At least 6 characters"}
            className="w-full rounded-xl border border-line bg-raise px-4 py-3 pr-11 text-[14px] font-medium text-cream outline-none normal-case placeholder:text-faint focus:border-gold/50"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-faint hover:text-cream"
            tabIndex={-1}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>

      {error && (
        <p className="mt-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-[12.5px] text-loss">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#eed38a] to-[#c39a42] py-3 text-[14px] font-bold text-ink shadow-[0_6px_24px_-6px_rgba(227,195,107,0.55)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
      >
        {isLogin ? <LogIn size={15} /> : <UserPlus size={15} />}
        {busy ? "One moment…" : isLogin ? "Sign in" : "Create account"}
      </button>

      <p className="mt-5 text-center text-[12.5px] text-mute">
        {isLogin ? "New to the house? " : "Already have an account? "}
        <Link
          href={isLogin ? "/signup" : "/login"}
          className="font-semibold text-gold hover:underline"
        >
          {isLogin ? "Create one free" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
