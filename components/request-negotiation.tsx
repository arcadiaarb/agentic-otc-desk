"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useWallet } from "./wallet-provider";
import type { CardIntent } from "./intent-card";
import { btnGhost, btnPrimary, fieldCls } from "@/lib/ui";
import { TotalLine } from "./total-line";
import { SpotHint } from "./spot-hint";
import { SIZE_RANGE } from "@/lib/intents";

// Buyer's private terms. They go to the server (encrypted) and are only used by the buyer's agent.
export function RequestNegotiationButton({ intent }: { intent: CardIntent }) {
  const { accountId, signedIn, connect, signIn, authError } = useWallet();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [awaitingWallet, setAwaitingWallet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [terms, setTerms] = useState({ amount: "", price: "", note: "" });
  const [base, quote] = intent.pair.split(" / ");
  const over = Number(terms.amount) * Number(terms.price) >= (SIZE_RANGE[intent.size]?.[1] ?? Infinity);

  useEffect(() => { if (!over) setAck(false); }, [over]);
  useEffect(() => {
    if (awaitingWallet && accountId) { setAwaitingWallet(false); setOpen(true); }
  }, [awaitingWallet, accountId]);

  const start = () => {
    if (!accountId) { setAwaitingWallet(true); connect(); return; } // connect first, then reopen
    setOpen(true);
  };

  const submit = async () => {
    if (!(Number(terms.amount) > 0) || !(Number(terms.price) > 0)) { setError("Enter an amount and a maximum price greater than zero."); return; }
    setBusy(true); setError("");
    try {
      if (!signedIn && !(await signIn())) throw new Error(authError || "Sign the message in your wallet to continue.");
      const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intentId: intent.id, ...terms }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not open the negotiation. Try again.");
      router.push(`/room/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the negotiation. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <button className={`${btnGhost} w-full`} onClick={start}>Request Negotiation</button>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
          <Dialog.Close aria-label="Close" className="absolute right-4 top-4 text-muted hover:text-text"><X className="size-5" /></Dialog.Close>
          <Dialog.Title className="flex items-center gap-2.5 font-display text-lg font-medium">
            <span className="size-2.5 rounded-full bg-orange" aria-hidden />Your private terms
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted">
            For {intent.pair}. Your agent negotiates within these. The seller never sees them.
          </Dialog.Description>
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Exact amount to buy ({base})</span>
              <input className={fieldCls} type="number" inputMode="decimal" min="0" step="any" autoComplete="off" placeholder="0.00" value={terms.amount} onChange={(e) => setTerms({ ...terms, amount: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Maximum price ({quote} per {base})</span>
              <input className={fieldCls} type="number" inputMode="decimal" min="0" step="any" autoComplete="off" placeholder="0.00" value={terms.price} onChange={(e) => setTerms({ ...terms, price: e.target.value })} />
            </label>
            <SpotHint pair={intent.pair} price={terms.price} />
            <TotalLine amount={terms.amount} price={terms.price} quote={quote} verb="You plan to spend up to" />
            {over && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-orange/50 px-3.5 py-3 text-sm">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--orange)]" />
                <span>I understand this listing is in the “{intent.size}” range, so I&apos;ll likely get less than I&apos;m asking for.</span>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Note (optional)</span>
              <textarea className={`${fieldCls} min-h-24 resize-y`} autoComplete="off" maxLength={500} placeholder="Anything your agent should know" value={terms.note} onChange={(e) => setTerms({ ...terms, note: e.target.value })} />
            </label>
          </div>
          {error && <p role="alert" className="mt-4 text-sm text-orange">{error}</p>}
          <div className="mt-7 flex justify-end gap-3">
            <button className={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
            <button className={btnPrimary} onClick={submit} disabled={busy || (over && !ack)}>{busy ? "Opening…" : "Start negotiation"}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
