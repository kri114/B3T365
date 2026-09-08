import { WalletView } from "@/components/wallet-view";

export const dynamic = "force-dynamic";

export default function WalletPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">Wallet</h1>
        <p className="mt-0.5 text-[12px] text-faint">
          Your virtual euros and every movement on the ledger.
        </p>
      </header>
      <WalletView />
    </div>
  );
}
