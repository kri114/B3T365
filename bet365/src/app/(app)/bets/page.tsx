import { BetsView } from "@/components/bets-view";

export const dynamic = "force-dynamic";

export default function BetsPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">My Bets</h1>
        <p className="mt-0.5 text-[12px] text-faint">
          Tickets settle automatically when fixtures reach full time.
        </p>
      </header>
      <BetsView />
    </div>
  );
}
