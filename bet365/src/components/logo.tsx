import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5 select-none">
      <span className="relative grid h-8 w-8 place-items-center rounded-lg border border-gold/30 bg-gradient-to-br from-lift to-panel">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2l2.4 5.3 5.6.6-4.2 3.9 1.2 5.6L12 14.5 7 17.4l1.2-5.6L4 7.9l5.6-.6L12 2z"
            fill="url(#g)"
          />
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="24" y2="24">
              <stop stopColor="#f2dd9a" />
              <stop offset="1" stopColor="#a8832f" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_50%_0%,rgba(227,195,107,0.25),transparent_70%)]" />
      </span>
      <span className="font-display text-[22px] leading-none font-semibold tracking-tight">
        <span className="text-cream">bet</span>
        <span className="gold-text">365</span>
        {!compact && (
          <span className="ml-2 hidden rounded-full border border-gold/25 px-2 py-0.5 align-[3px] font-sans text-[9px] font-semibold tracking-[0.18em] text-gold/80 uppercase sm:inline-block">
            Virtual
          </span>
        )}
      </span>
    </Link>
  );
}
