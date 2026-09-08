import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { DateBoard } from "@/components/date-board";
import { GuestHero, OddsExplainer } from "@/components/guest-hero";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser().catch(() => null);

  return (
    <div className="flex flex-col gap-7">
      {!user && <GuestHero />}

      <div className="flex flex-col gap-4">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-cream">
              On the board
            </h2>
            <p className="mt-0.5 text-[12px] text-faint">
              Pick a date above — results, live action and upcoming fixtures with decimal prices.
            </p>
          </div>
        </header>
        <Suspense
          fallback={
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-[86px] rounded-xl border border-line" />
              ))}
            </div>
          }
        >
          <DateBoard />
        </Suspense>
      </div>

      {!user && <OddsExplainer />}
    </div>
  );
}
