"use client";

import { useParams } from "next/navigation";
import { PageSpinner } from "@/components/spinner";
import { SettlementFlow } from "@/components/settlement-flow";
import { useWallet } from "@/components/wallet-provider";
import { btnGreen } from "@/lib/ui";

// Pending-sale settlement. The room sends both sides here as soon as an agreement is reached.
export default function PendingSettlement() {
  const { roomId } = useParams<{ roomId: string }>();
  const { signedIn, accountId, checking, signingIn, connect, signIn } = useWallet();
  if (checking) return <PageSpinner />;
  if (!signedIn) {
    return (
      <section className="mx-auto max-w-lg pt-10">
        <h1 className="font-display text-2xl font-medium tracking-tight">Settlement</h1>
        <p className="mt-3 text-muted">Sign in with the wallet that belongs to this deal.</p>
        <button className={`${btnGreen} mt-6`} disabled={signingIn} onClick={accountId ? signIn : connect}>{accountId ? (signingIn ? "Signing…" : "Sign in") : "Connect Wallet"}</button>
      </section>
    );
  }
  return <SettlementFlow roomId={roomId} />;
}
