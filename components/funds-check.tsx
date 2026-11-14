"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { actionCreators } from "@near-js/transactions";
import { BusyText, Spinner } from "./spinner";
import { useWallet } from "./wallet-provider";
import { useVerifierKey } from "./use-verifier-key";
import { btnAction } from "@/lib/ui";

type Funds = { network: string; verifier: string; symbol: string; contract: string; walletTransfers: boolean; need: string; inVerifier: string; inWallet: string; enough: boolean; depositUnits: string };

// Seller readiness: tokens inside the verifier, and the wallet key registered with it.
export function FundsCheck({ pair, amount, onChange }: { pair: string; amount: string; onChange?: (ready: boolean) => void }) {
  const { accountId, getWallet } = useWallet();
  const [f, setF] = useState<Funds | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"check" | "deposit" | "">("check");
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = useVerifierKey();

  const check = useCallback(async () => {
    setBusy("check"); setErr("");
    try {
      const res = await fetch(`/api/funds?pair=${encodeURIComponent(pair)}&amount=${encodeURIComponent(amount)}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't check your funds.");
      setF(d);
    } catch (e) {
      setF(null); setErr(e instanceof Error ? e.message : "Couldn't check your funds.");
    } finally {
      setBusy("");
    }
  }, [pair, amount]);
  useEffect(() => { check(); }, [check]);

  // Ready = funds inside the verifier AND the key is registered (or the verifier simply couldn't answer after we know the key).
  const keyOk = key.registered === true || (key.registered === null && !key.needsProbe);
  useEffect(() => { cb.current?.(!!f?.enough && keyOk); }, [f, keyOk]);

  const deposit = async () => {
    if (!f) return;
    setBusy("deposit"); setErr("");
    try {
      const w = await getWallet();
      if (!w) throw new Error("Connect your wallet first.");
      await w.signAndSendTransaction({
        signerId: accountId ?? undefined, receiverId: f.contract,
        actions: [actionCreators.functionCall("ft_transfer_call", { receiver_id: f.verifier, amount: f.depositUnits, msg: "" }, 100n * 10n ** 12n, 1n)],
      });
      await check();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The deposit didn't go through.");
      setBusy("");
    }
  };

  const canDeposit = !!f && !f.enough && f.walletTransfers && BigInt(f.depositUnits || "0") > 0n;
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-line p-4 text-sm">
      {!f && busy === "check" && <div className="flex justify-center py-2"><Spinner /></div>}
      {f && (
        <>
          <p>
            Your {f.symbol} inside the verifier: <strong>{f.inVerifier}</strong> (this listing needs {f.need}).{" "}
            {f.enough ? <span className="text-green-ink">Enough.</span> : <span className="text-orange">Not enough yet.</span>}
          </p>
          {canDeposit && (
            <button className={btnAction} disabled={!!busy} onClick={deposit}>
              {busy === "deposit" ? <BusyText text="Depositing…" /> : `Deposit from wallet (${f.inWallet} ${f.symbol} available)`}
            </button>
          )}
          {!f.enough && !f.walletTransfers && <p className="text-muted">{f.symbol} is a bridged token. It has to be deposited from its own chain, not from a NEAR wallet.</p>}
          {!f.enough && f.walletTransfers && !canDeposit && (
            <p className="text-muted">Your wallet has no {f.symbol} to deposit. {f.network === "testnet" ? "Get tokens from the Tidepool app, or use the Verifier page." : "Use the Verifier page to top up."}</p>
          )}
          <div className="border-t border-dashed border-line pt-2">
            {key.registered === true && <p>Wallet key: <span className="text-green-ink">registered with the verifier.</span></p>}
            {(key.needsProbe || key.registered === false) && (
              <div className="space-y-2">
                <p className="text-orange">Your wallet key must be registered with the verifier (one-time step).{key.needsProbe ? " Your wallet will ask for one free signature to identify the key." : ""}</p>
                <button className={btnAction} disabled={!!key.busy} onClick={() => key.register()}>{key.busy === "register" ? <BusyText text="Registering…" /> : "Register key"}</button>
              </div>
            )}
            {!key.needsProbe && key.registered === null && <p className="text-muted">Couldn&apos;t verify your wallet key automatically. You can continue; signing will tell us if it&apos;s missing.</p>}
            {!key.needsProbe && key.registered === undefined && <p className="text-muted">Checking your wallet key…</p>}
            {key.tx && <a href={key.tx} target="_blank" rel="noreferrer" className="text-xs underline">View registration transaction</a>}
            {key.error && <p role="alert" className="text-orange">{key.error}</p>}
          </div>
          <button type="button" className="text-xs text-muted underline" disabled={!!busy || !!key.busy} onClick={() => { check(); key.check(); }}>{busy === "check" ? "Checking…" : "Re-check"}</button>
        </>
      )}
      {err && <p role="alert" className="text-orange">{err}</p>}
    </div>
  );
}
