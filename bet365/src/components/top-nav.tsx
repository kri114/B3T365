"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Radio,
  Ticket,
  Wallet,
  ShieldCheck,
  LogOut,
  ChevronDown,
  ReceiptText,
} from "lucide-react";
import clsx from "clsx";
import { Logo } from "./logo";
import { useUser, useToast } from "./providers";
import { useBetSlip } from "@/lib/store";
import { formatEuro } from "@/lib/money";

const LINKS = [
  { href: "/", label: "Sports", icon: ReceiptText },
  { href: "/live", label: "In-Play", icon: Radio },
  { href: "/bets", label: "My Bets", icon: Ticket },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

export function TopNav() {
  const { user, setUser } = useUser();
  const { items, setOpen } = useBetSlip();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setMenuOpen(false);
    toast({ title: "Signed out", tone: "info" });
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-4 px-3 sm:px-5">
        <Logo />

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  active ? "text-gold" : "text-mute hover:text-cream",
                )}
              >
                <Icon size={14} strokeWidth={2.2} />
                {label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-transparent via-gold to-transparent" />
                )}
              </Link>
            );
          })}
          {user?.isAdmin && (
            <Link
              href="/admin"
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                pathname.startsWith("/admin") ? "text-gold" : "text-mute hover:text-cream",
              )}
            >
              <ShieldCheck size={14} strokeWidth={2.2} />
              Console
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/wallet"
                className="tnum hidden items-center gap-2 rounded-lg border border-gold/25 bg-lift px-3 py-1.5 text-[13px] font-bold text-gold transition-colors hover:border-gold/50 sm:flex"
              >
                <Wallet size={14} />
                {formatEuro(user.balanceCents)}
              </Link>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] font-semibold text-cream transition-colors hover:border-line2"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-gold/15 text-[10px] font-bold text-gold">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[110px] truncate sm:inline">{user.username}</span>
                  <ChevronDown size={13} className="text-mute" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-xl border border-line bg-coal shadow-2xl">
                    <Link href="/wallet" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-mute hover:bg-lift hover:text-cream">
                      <Wallet size={14} /> Wallet
                    </Link>
                    <Link href="/bets" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-mute hover:bg-lift hover:text-cream">
                      <Ticket size={14} /> My bets
                    </Link>
                    {user.isAdmin && (
                      <Link href="/admin" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-mute hover:bg-lift hover:text-cream">
                        <ShieldCheck size={14} /> Admin console
                      </Link>
                    )}
                    <button onClick={logout}
                      className="flex w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-left text-[13px] text-loss/90 hover:bg-lift">
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login"
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-mute transition-colors hover:text-cream">
                Sign in
              </Link>
              <Link href="/signup"
                className="rounded-lg bg-gradient-to-b from-[#eed38a] to-[#c39a42] px-3.5 py-1.5 text-[13px] font-bold text-ink shadow-[0_4px_14px_-4px_rgba(227,195,107,0.5)] transition-transform hover:scale-[1.03]">
                Join free
              </Link>
            </>
          )}

          {/* Mobile betslip trigger */}
          <button
            onClick={() => setOpen(true)}
            className="relative grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-mute lg:hidden"
            aria-label="Open bet slip"
          >
            <Ticket size={16} />
            {items.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-ink">
                {items.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav row */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href}
              className={clsx(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-medium",
                active ? "bg-lift text-gold" : "text-mute",
              )}>
              <Icon size={13} /> {label}
            </Link>
          );
        })}
        {user?.isAdmin && (
          <Link href="/admin"
            className={clsx(
              "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-medium",
              pathname.startsWith("/admin") ? "bg-lift text-gold" : "text-mute",
            )}>
            <ShieldCheck size={13} /> Console
          </Link>
        )}
      </nav>
    </header>
  );
}
