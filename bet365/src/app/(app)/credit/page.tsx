import { DebtView } from "@/components/debt-view";

export const dynamic = "force-dynamic";

export default function CreditPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">Credit &amp; Debt</h1>
        <p className="mt-0.5 text-[12px] text-faint">
          Ask the house for virtual credit. Approved amounts are added to your wallet and tracked as debt until repaid.
        </p>
      </header>
      <DebtView />
    </div>
  );
}
