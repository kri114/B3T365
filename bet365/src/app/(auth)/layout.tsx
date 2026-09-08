import Link from "next/link";
import { Logo } from "@/components/logo";
import { ArrowLeft } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/auth-texture.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-ink/82" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,8,10,0.9)_100%)]" />

      <div className="relative flex w-full max-w-4xl overflow-hidden rounded-3xl border border-gold/15 bg-coal/85 shadow-2xl backdrop-blur-xl">
        <div className="flex w-full flex-col items-center px-6 py-10 sm:px-12">
          <div className="mb-8 flex w-full items-center justify-between">
            <Logo />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[12px] font-semibold text-mute transition-colors hover:text-gold"
            >
              <ArrowLeft size={13} /> Back to the board
            </Link>
          </div>
          {children}
          <p className="mt-10 max-w-sm text-center text-[10.5px] leading-relaxed text-faint">
            A private virtual-currency sportsbook. No real money is accepted, staked, won or paid
            out. 18+ · play responsibly.
          </p>
        </div>
      </div>
    </div>
  );
}
