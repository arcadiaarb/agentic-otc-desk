"use client";

import { useCallback, useEffect, useState } from "react";
import { actionCreators } from "@near-js/transactions";
import { BusyText } from "./spinner";
import { useWallet } from "./wallet-provider";
import { btnAction, btnGhost } from "@/lib/ui";

type View = {
  network: string; verifier: string; status: "awaiting_buyer" | "awaiting_seller" | "ready" | "settled" | "expired";
  role: "seller" | "buyer"; deadline: string; error: string; txUrl: string | null;
  amount: string; price: string; total: string; baseSymbol: string; quoteSymbol: string; turn: "buyer" | "seller" | null;
  you: { signed: boolean; contract: string; symbol: string; need: string; inVerifier: string; inWallet: string; enough: boolean; depositUnits: string; keyRegistered: boolean | null };
  otherSigned: boolean;
};

const TGAS = (n: number) => BigInt(n) * 10n ** 12n;
const fmtLeft = (ms: number) => {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60000);
  return m >= 90 ? `${Math.floor(m / 60)} hr` : `${Math.max(m, 1)} min`;
};

// After a deal: top up funds inside the verifier, sign your side, and the trade settles in one atomic transaction.
export function SettlementPanel({ roomId }: { roomId: string }) {
  const { accountId, getWallet } = useWallet();
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "deposit" | "register" | "sign">("");
  const [needsKey, setNeedsKey] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/settlements/${roomId}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not load the settlement.");
      setV(d); setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the settlement.");
    }
  }, [roomId]);

  const done = v?.status === "settled" || v?.status === "expired";
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (done) return; const t = setInterval(load, 6000); return () => clearInterval(t); }, [load, done]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const run = async (kind: "deposit" | "register" | "sign", fn: () => Promise<void>) => {
    setBusy(kind); setErr("");
    try { await fn(); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(""); }
  };

  // Funds must sit inside the verifier (not just in the wallet) so both sides can move in one transaction.
  const deposit = () => run("deposit", async () => {
    const w = await getWallet();
    if (!w || !v) throw new Error("Connect your wallet first.");
    await w.signAndSendTransaction({
      signerId: accountId ?? undefined, receiverId: v.you.contract,
      actions: [actionCreators.functionCall("ft_transfer_call", { receiver_id: v.verifier, amount: v.you.depositUnits, msg: "" }, TGAS(100), 1n)],
    });
  });

  // Named accounts must register their key with the verifier once before their signature counts.
  const registerKey = () => run("register", async () => {
    const w = await getWallet();
    if (!w || !v) throw new Error("Connect your wallet first.");
    const pk = (await w.getAccounts()).find((a) => a.accountId === accountId)?.publicKey;
    if (!pk) throw new Error("Your wallet didn't share its public key. Disconnect and sign in again.");
    await w.signAndSendTransaction({
      signerId: accountId ?? undefined, receiverId: v.verifier,
      actions: [actionCreators.functionCall("add_public_key", { public_key: pk }, TGAS(100), 1n)],
    });
    setNeedsKey(false);
  });

  const sign = () => run("sign", async () => {
    const w = await getWallet();
    if (!w?.signMessage) throw new Error("This wallet can't sign messages. Try MyNearWallet or Meteor.");
    const prep = await fetch(`/api/settlements/${roomId}/prepare`, { method: "POST" });
    const p = await prep.json().catch(() => ({}));
    if (!prep.ok) throw new Error(p.error ?? "Could not prepare the trade.");
    const { Buffer: Shim } = await import("buffer"); // wallets expect a real Buffer for the nonce
    const g = globalThis as unknown as { Buffer?: typeof Shim };
    g.Buffer ??= Shim;
    const signed = await w.signMessage({ message: p.message, recipient: p.recipient, nonce: g.Buffer.from(p.nonce, "base64") });
    if (!signed) throw new Error("Your wallet didn't return a signature. Try again.");
    const res = await fetch(`/api/settlements/${roomId}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: signed.publicKey, signature: signed.signature }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { if (d.code === "key_not_registered") setNeedsKey(true); throw new Error(d.error ?? "Could not record your signature."); }
  });

  if (!v) return err ? <p role="alert" className="mt-4 text-sm text-orange">{err}</p> : null;

  const left = Date.parse(v.deadline) - now;
  const yourTurn = v.turn === v.role;
  const keyMissing = v.you.keyRegistered === false || needsKey;
  const other = v.role === "buyer" ? "seller" : "buyer";

  return (
    <div className="mt-6 border-t border-dashed border-line pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-medium">Settlement</h3>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{v.network}</span>
      </div>

      {v.status === "settled" && (
        <p className="mt-3 text-sm text-green-ink">
          Settled. Both sides were paid in one atomic transaction.{" "}
          {v.txUrl && <a href={v.txUrl} target="_blank" rel="noreferrer" className="underline">View transaction</a>}
        </p>
      )}
      {v.status === "expired" && <p className="mt-3 text-sm text-muted">The signing window ended before both sides signed, so the intent went back on the board.</p>}

      {!done && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">Both sides must sign within {fmtLeft(left)}. The buyer signs first, then the seller.</p>

          <p>
            Your funds in the verifier: <strong>{v.you.inVerifier} {v.you.symbol}</strong> (need {v.you.need}).{" "}
            {v.you.enough ? <span className="text-green-ink">Enough.</span> : <span className="text-orange">Not enough yet.</span>}
          </p>
          {!v.you.enough && BigInt(v.you.depositUnits || "0") > 0n && (
            <button className={btnAction} disabled={!!busy} onClick={deposit}>{busy === "deposit" ? <BusyText text="Depositing…" /> : `Deposit from wallet (${v.you.inWallet} ${v.you.symbol} available)`}</button>
          )}
          {!v.you.enough && BigInt(v.you.depositUnits || "0") === 0n && (
            <p className="text-muted">Your wallet has no {v.you.symbol} to deposit. {v.network === "testnet" ? "Get tokens from the Tidepool app or faucet, then deposit." : ""}</p>
          )}

          {keyMissing && (
            <div className="rounded-xl border border-dashed border-orange/50 p-3">
              <p>One-time step: register your wallet key with the verifier so your signature is accepted.</p>
              <button className={`${btnGhost} mt-2`} disabled={!!busy} onClick={registerKey}>{busy === "register" ? <BusyText text="Registering…" tone="orange" /> : "Register key"}</button>
            </div>
          )}

          {v.you.signed ? (
            <p className="text-green-ink">You signed. Waiting for the {other}{v.status === "ready" ? " (submitting)" : ""}.</p>
          ) : yourTurn ? (
            <button className={btnAction} disabled={!!busy || !v.you.enough || keyMissing} onClick={sign}>{busy === "sign" ? <BusyText text="Waiting for your wallet…" /> : "Sign the trade"}</button>
          ) : (
            <p className="text-muted">Waiting for the {v.turn} to sign.</p>
          )}
        </div>
      )}
      {(err || v.error) && <p role="alert" className="mt-3 text-sm text-orange">{err || v.error}</p>}
    </div>
  );
}
