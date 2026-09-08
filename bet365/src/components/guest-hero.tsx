import Link from "next/link";
import { Radio, Sigma, ShieldCheck, Coins, ArrowRight } from "lucide-react";
import { ODDS_ENGINE_FACTORS } from "@/lib/constants";

/** Marketing hero shown on the home board to signed-out visitors. */
export function GuestHero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-gold/15">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/hero-stadium.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/82 to-ink/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/40" />

      <div className="relative max-w-2xl px-6 py-14 sm:px-10 sm:py-20">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-ink/60 px-3.5 py-1.5 text-[10.5px] font-bold tracking-[0.22em] text-gold uppercase backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-dot" />
          Virtual currency · Real fixtures · Real markets
        </p>
        <h1 className="font-display text-[42px] leading-[1.02] font-semibold tracking-tight text-cream sm:text-6xl">
          The beautiful game,
          <br />
          priced <em className="gold-text not-italic">beautifully.</em>
        </h1>
        <p className="mt-5 max-w-lg text-[14.5px] leading-relaxed text-cream/70">
          wager on real fixtures from Europe&apos;s biggest leagues — live and pre-match — with
          virtual euros. Every price is computed, never random: a Poisson model reads each team&apos;s
          strength, morale and venue before the house takes its margin.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/signup"
            className="group flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#eed38a] to-[#c39a42] px-6 py-3.5 text-[14px] font-bold text-ink shadow-[0_10px_36px_-8px_rgba(227,195,107,0.6)] transition-transform hover:scale-[1.03]">
            Create your free account
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link href="/live"
            className="flex items-center gap-2 rounded-xl border border-cream/15 bg-ink/50 px-6 py-3.5 text-[14px] font-semibold text-cream backdrop-blur transition-colors hover:border-gold/40 hover:text-gold">
            <Radio size={15} className="text-live" />
            Watch the live board
          </Link>
        </div>

        <div className="mt-10 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { icon: Sigma, title: "Modelled odds", body: "Strength, form & venue — priced by a Poisson engine with a bookmaker's margin." },
            { icon: Radio, title: "In-play betting", body: "Quotes re-price every few seconds as goals land and the clock runs down." },
            { icon: Coins, title: "Virtual euros", body: "Zero real money. Ever. The house credits wallets and honours every payout." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-cream/10 bg-ink/55 p-3.5 backdrop-blur">
              <Icon size={15} className="text-gold" />
              <p className="mt-2 text-[12.5px] font-bold text-cream">{title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-cream/55">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OddsExplainer() {
  return (
    <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <header className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold/25 bg-lift">
          <ShieldCheck size={14} className="text-gold" />
        </span>
        <div>
          <h2 className="font-display text-[17px] font-semibold text-cream">How the odds are made</h2>
          <p className="text-[11px] text-faint">Transparent pricing — the opposite of a black box</p>
        </div>
      </header>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ODDS_ENGINE_FACTORS.map((f, i) => (
          <li key={f} className="flex items-start gap-2.5 rounded-lg bg-raise/60 px-3 py-2.5 text-[12px] leading-relaxed text-mute">
            <span className="tnum mt-px font-bold text-gold">{String(i + 1).padStart(2, "0")}</span>
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}
