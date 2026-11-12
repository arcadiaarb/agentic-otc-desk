"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { useWallet } from "./wallet-provider";
import { EXPIRIES, PAIRS, SIZES, fitsSize } from "@/lib/intents";
import { btnAction, btnGhost, btnPrimary } from "@/lib/ui";
import { FundsCheck } from "./funds-check";
import { TotalLine } from "./total-line";
import { BusyText } from "./spinner";
import { SpotHint } from "./spot-hint";

type Step = "public" | "private" | "funds" | "done";
const field = "w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-sm placeholder:text-muted/60";

function Select({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      <span className="relative block">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} appearance-none pr-10`}>
          <option value="" disabled>{placeholder}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

export function CreateIntentButton({ className = btnPrimary, children = "Create Intent", onCreated, initial }: { className?: string; children?: ReactNode; onCreated?: () => void; initial?: { pair?: string; size?: string; expiry?: string; amount?: string; price?: string; note?: string } }) {
  const { accountId, signedIn, connect, signIn, authError } = useWallet();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("public");
  const [pub, setPub] = useState({ pair: initial?.pair ?? "", size: initial?.size ?? "", expiry: initial?.expiry ?? "" });
  const [priv, setPriv] = useState({ amount: initial?.amount ?? "", price: initial?.price ?? "", note: initial?.note ?? "" });
  const [error, setError] = useState("");
  const [awaitingWallet, setAwaitingWallet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fundsOk, setFundsOk] = useState(false);

  const [base, quote] = pub.pair.split(" / ");
  const publicDone = pub.pair && pub.size && pub.expiry;

  const reset = () => {
    setStep("public"); setPub({ pair: "", size: "", expiry: "" });
    setPriv({ amount: "", price: "", note: "" }); setError("");
  };

  // After connecting from the submit flow, bring the form back with the draft intact.
  useEffect(() => {
    if (awaitingWallet && accountId) { setAwaitingWallet(false); setStep("funds"); setOpen(true); }
  }, [awaitingWallet, accountId]);

  // Step 2 -> 3. Connecting a wallet closes the dialog first (its focus trap would block the wallet modal).
  const goFunds = () => {
    if (!(Number(priv.amount) > 0) || !(Number(priv.price) > 0)) { setError("Enter an exact amount and price greater than zero."); return; }
    if (!fitsSize(pub.size, Number(priv.amount) * Number(priv.price))) { setError(`That total doesn't fit “${pub.size}”. Go back and pick the matching size range.`); return; }
    setError("");
    if (!accountId) { setAwaitingWallet(true); setOpen(false); connect(); return; }
    setStep("funds");
  };
  const signInHere = async () => { setError(""); if (!(await signIn())) setError(authError || "Sign the message in your wallet to continue."); };

  const submit = async () => {
    if (!(Number(priv.amount) > 0) || !(Number(priv.price) > 0)) {
      setError("Enter an exact amount and price greater than zero.");
      return;
    }
    if (!accountId) {
      // Close first: the dialog's focus trap would block the wallet modal.
      setError(""); setAwaitingWallet(true); setOpen(false); connect();
      return;
    }
    setSubmitting(true); setError("");
    try {
      // Prove wallet ownership first (a wallet popup); the server trusts only the signed session.
      if (!signedIn && !(await signIn())) throw new Error(authError || "Sign the message in your wallet to continue.");
      // Private details go to the server only; the response carries just the id and commitment.
      const res = await fetch("/api/intents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pub, ...priv }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not list your intent. Try again.");
      setPriv({ amount: "", price: "", note: "" });
      setStep("done"); onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not list your intent. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <button className={className} onClick={() => { if (step === "done") reset(); setOpen(true); }}>{children}</button>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
          <Dialog.Close aria-label="Close" className="absolute right-4 top-4 text-muted hover:text-text"><X className="size-5" /></Dialog.Close>

          {step === "public" && (
            <>
              <Dialog.Title className="flex items-center gap-2.5 font-display text-lg font-medium">
                <span className="size-2.5 rounded-full bg-green" aria-hidden />Public Intent Info
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-muted">This will appear on the marketplace.</Dialog.Description>
              <div className="mt-6 space-y-4">
                <Select label="Asset pair" placeholder="Choose a pair" value={pub.pair} onChange={(pair) => setPub({ ...pub, pair })} options={PAIRS} />
                <Select label="Size category" placeholder="Choose a size range" value={pub.size} onChange={(size) => setPub({ ...pub, size })} options={SIZES} />
                <Select label="Open for" placeholder="Choose a duration" value={pub.expiry} onChange={(expiry) => setPub({ ...pub, expiry })} options={EXPIRIES} />
              </div>
              <div className="mt-7 flex justify-end gap-3">
                <button className={btnGhost} onClick={() => { reset(); setOpen(false); }}>Cancel</button>
                <button className={btnPrimary} disabled={!publicDone} onClick={() => setStep("private")}>Next</button>
              </div>
            </>
          )}

          {step === "private" && (
            <>
              <Dialog.Title className="flex items-center gap-2.5 font-display text-lg font-medium">
                <span className="size-2.5 rounded-full bg-orange" aria-hidden />Private Intent
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-muted">This will not be public and can&apos;t be seen on the marketplace.</Dialog.Description>
              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Exact amount ({base})</span>
                  <input className={field} type="number" inputMode="decimal" min="0" step="any" autoComplete="off" placeholder="0.00" value={priv.amount} onChange={(e) => setPriv({ ...priv, amount: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Exact price ({quote} per {base})</span>
                  <input className={field} type="number" inputMode="decimal" min="0" step="any" autoComplete="off" placeholder="0.00" value={priv.price} onChange={(e) => setPriv({ ...priv, price: e.target.value })} />
                </label>
                <SpotHint pair={pub.pair} price={priv.price} />
                <TotalLine amount={priv.amount} price={priv.price} quote={quote} verb="You expect to receive at least" />
                {Number(priv.amount) > 0 && Number(priv.price) > 0 && !fitsSize(pub.size, Number(priv.amount) * Number(priv.price)) && (
                  <p role="alert" className="text-sm text-orange">That total doesn&apos;t fit “{pub.size}”. Go back and pick the matching size range.</p>
                )}
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Note (optional)</span>
                  <textarea className={`${field} min-h-24 resize-y`} autoComplete="off" placeholder="Anything the buyer should know" value={priv.note} onChange={(e) => setPriv({ ...priv, note: e.target.value })} />
                </label>
              </div>
              {error && <p role="alert" className="mt-4 text-sm text-orange">{error}</p>}
              <div className="mt-7 flex justify-end gap-3">
                <button className={btnGhost} onClick={() => { setError(""); setStep("public"); }}>Back</button>
                <button className={btnPrimary} onClick={goFunds}>Next</button>
              </div>
            </>
          )}

          {step === "funds" && (
            <>
              <Dialog.Title className="flex items-center gap-2.5 font-display text-lg font-medium">
                <span className="size-2.5 rounded-full bg-orange" aria-hidden />Funds Settlement
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-muted">A deal can only settle if your tokens are inside the verifier. They stay yours, and only move when you sign a deal.</Dialog.Description>
              <div className="mt-6">
                {signedIn ? <FundsCheck pair={pub.pair} amount={priv.amount} onChange={setFundsOk} /> : (
                  <div className="rounded-xl border border-dashed border-line p-4 text-sm">
                    <p className="text-muted">Sign in with your wallet to check your funds.</p>
                    <button className={`${btnAction} mt-3`} onClick={signInHere}>Sign in</button>
                  </div>
                )}
              </div>
              {error && <p role="alert" className="mt-4 text-sm text-orange">{error}</p>}
              <div className="mt-7 flex justify-end gap-3">
                <button className={btnGhost} onClick={() => { setError(""); setStep("private"); }}>Back</button>
                <button className={btnPrimary} onClick={submit} disabled={submitting || !signedIn || !fundsOk}>{submitting ? <BusyText text="Submitting…" /> : "Submit"}</button>
              </div>
            </>
          )}

          {step === "done" && (
            <>
              <Dialog.Title className="font-display text-lg font-medium">Intent listed</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-muted">
                Your listing is on the board. The exact amount, price and note are encrypted on the server and never shown to buyers.
              </Dialog.Description>
              <div className="mt-7 flex justify-end gap-3">
                <button className={btnGhost} onClick={() => setOpen(false)}>Close</button>
                <Link href="/intents" className={btnPrimary} onClick={() => setOpen(false)}>View Intent</Link>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
