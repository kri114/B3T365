import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LEAGUES } from "@/lib/constants";
import { DateBoard } from "@/components/date-board";
import { Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = LEAGUES.find((l) => l.slug === slug);
  if (!league) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-gold/25 bg-lift">
          <Trophy size={16} className="text-gold" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">{league.name}</h1>
          <p className="text-[12px] text-faint">{league.country} · choose a date above for results & fixtures</p>
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
        <DateBoard league={league.slug} />
      </Suspense>
    </div>
  );
}
