import { MatchBoard } from "@/components/match-board";

export const dynamic = "force-dynamic";

export default function LivePage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display flex items-center gap-3 text-2xl font-semibold tracking-tight text-cream">
          In-Play
          <span className="mt-1 flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 font-sans text-[10px] font-bold tracking-[0.18em] text-live uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-dot" />
            Live pricing
          </span>
        </h1>
        <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-mute">
          Every fixture below is being played right now. Prices recompute as goals go in and time
          decays — lock in a quote before it moves.
        </p>
      </header>
      <MatchBoard live days={1} />
    </div>
  );
}
