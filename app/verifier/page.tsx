"use client";

import { useCallback, useEffect, useState } from "react";
import { actionCreators } from "@near-js/transactions";
import { BusyText, PageSpinner } from "@/components/spinner";
import { useVerifierKey } from "@/components/use-verifier-key";
import { useWallet } from "@/components/wallet-provider";
import { parseUnits } from "@/lib/units";
import { txUrl } from "@/lib/network";
import { btnAction, btnGhost, btnGreen, fieldCls } from "@/lib/ui";

type Tok = { symbol: string; id: string; contract: string; decimals: number; walletTransfers: boolean; registered: boolean | null; inVerifier: string; inVerifierUnits: string; inWallet: string; inWalletUnits: string };
type Data = { network: string; verifier: string; tokens: Tok[] };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STORAGE_FEE = 1250000000000000000000n; // 0.00125 NEAR: one-time registration with a token contract (NEP-145)

// Your balances inside the verifier, your key status, and deposit / withdraw.
export default function Verifier() {
  const { signedIn, accountId, checking, signingIn, connect, signIn, getWallet } = useWallet();
  const key = useVerifierKey();
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"" | "deposit" | "withdraw">("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [tx, setTx] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/verifier/balances", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't read your balances.");
      setData(d); setErr("");
      setSel((s) => s || d.tokens[0]?.id || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read your balances.");
    }
  }, []);
  useEffect(() => { if (signedIn) void load(); }, [signedIn, load]);

  const run = async (kind: "deposit" | "withdraw") => {
    if (!data) return;
    setErr(""); setMsg(""); setTx("");
    const tok = data.tokens.find((t) => t.id === sel);
    if (!tok) return;
    let units: bigint;
    try { units = parseUnits(amount, tok.decimals); } catch { setErr("Enter a valid amount."); return; }
    if (units <= 0n) { setErr("Enter an amount greater than zero."); return; }
    if (kind === "withdraw") {
      if (!tok.walletTransfers) { setErr(`${tok.symbol} is a bridged token. It can't be withdrawn to a NEAR wallet from here.`); return; }
      if (units > BigInt(tok.inVerifierUnits)) { setErr(`You only have ${tok.inVerifier} ${tok.symbol} in the verifier.`); return; }
    } else {
      if (!tok.walletTransfers) { setErr(`${tok.symbol} is a bridged token. Deposit it from its own chain, not from a NEAR wallet.`); return; }
      if (units > BigInt(tok.inWalletUnits)) { setErr(`Your wallet only has ${tok.inWallet} ${tok.symbol}.`); return; }
    }

    setBusy(kind);
    try {
      const w = await getWallet();
      if (!w) throw new Error("Connect your wallet first.");
      const send = async (receiverId: string, method: string, args: object, gas: bigint, deposit: bigint) => {
        const out = (await w.signAndSendTransaction({ signerId: accountId ?? undefined, receiverId, actions: [actionCreators.functionCall(method, args, gas, deposit)] })) as { transaction?: { hash?: string }; status?: { Failure?: unknown } } | void;
        if (out?.transaction?.hash) setTx(txUrl(out.transaction.hash));
        if (out?.status?.Failure) throw new Error(JSON.stringify(out.status.Failure).slice(0, 200));
      };
      if (kind === "deposit") {
        await send(tok.contract, "ft_transfer_call", { receiver_id: data.verifier, amount: units.toString(), msg: "" }, 100n * 10n ** 12n, 1n);
      } else {
        // A token contract refuses to send to an account that never registered with it (the "smart contract panicked" error).
        // So the first withdrawal of each token registers the account first (NEP-145, about 0.00125 NEAR, one time).
        if (tok.registered !== true) await send(tok.contract, "storage_deposit", { account_id: accountId, registration_only: true }, 30n * 10n ** 12n, STORAGE_FEE);
        // Direct withdrawal (no msg, so a failed transfer is refunded). Needs exactly 1 yoctoNEAR.
        await send(data.verifier, "ft_withdraw", { token: tok.contract, receiver_id: accountId, amount: units.toString() }, 100n * 10n ** 12n, 1n);
      }
      for (let i = 0; i < 4; i++) { await wait(2000); await load(); }
      setAmount(""); setMsg(kind === "deposit" ? "Deposited. Your balances are updated." : "Withdrawn to your wallet. Your balances are updated.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The transaction didn't go through.");
    } finally {
      setBusy("");
    }
  };

  if (checking) return <PageSpinner />;
  if (!signedIn) {
    return (
      <section className="mx-auto max-w-lg pt-10">
        <h1 className="font-display text-2xl font-medium tracking-tight">Verifier</h1>
        <p className="mt-3 text-muted">Sign in with your wallet to see your balances in the verifier.</p>
        <button className={`${btnGreen} mt-6`} disabled={signingIn} onClick={accountId ? signIn : connect}>{accountId ? (signingIn ? "Signing…" : "Sign in") : "Connect Wallet"}</button>
      </section>
    );
  }
  if (!data) return err ? <p role="alert" className="pt-10 text-center text-orange">{err}</p> : <PageSpinner />;

  return (
    <section className="mx-auto max-w-lg pt-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium tracking-tight">Your wallet in the verifier</h1>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{data.network}</span>
      </div>
      <p className="mt-2 text-sm text-muted">Deals settle from the tokens you hold inside the verifier. They stay yours, and you can withdraw them any time.</p>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm text-muted">You have</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.tokens.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-4">
              <span><strong>{t.inVerifier}</strong> {t.symbol}</span>
              <span className="text-xs text-muted">{t.walletTransfers ? `wallet: ${t.inWallet}` : "bridged"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-5 text-sm">
        {key.registered === true && <p>Your key is registered. <span className="text-green-ink">Ready to sign deals.</span></p>}
        {key.needsProbe && <p className="text-muted">Your wallet key isn&apos;t registered with the verifier yet. Your wallet will ask for one free signature to identify the key, then we register it.</p>}
        {!key.needsProbe && key.registered === false && <p className="text-orange">Your key isn&apos;t registered with the verifier yet.</p>}
        {!key.needsProbe && key.registered === null && <p className="text-muted">We couldn&apos;t verify your key automatically.</p>}
        {!key.needsProbe && key.registered === undefined && <p className="text-muted">Checking your key…</p>}
        {key.signKey && <p className="mt-1 break-all font-mono text-xs text-muted">{key.signKey}</p>}
        {key.tx && <a href={key.tx} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">View registration transaction</a>}
        {key.error && <p role="alert" className="mt-2 text-orange">{key.error}</p>}
        {key.registered !== true && (
          <div className="mt-3 flex flex-wrap gap-3">
            <button className={btnAction} disabled={!!key.busy} onClick={() => key.register()}>{key.busy === "register" ? <BusyText text="Registering…" /> : "Register Key"}</button>
            {!key.needsProbe && <button className={btnGhost} disabled={!!key.busy} onClick={() => key.check()}>Check again</button>}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input className={fieldCls} type="number" inputMode="decimal" min="0" step="any" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
          <select className={`${fieldCls} sm:max-w-44`} value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Token">
            {data.tokens.map((t) => <option key={t.id} value={t.id}>{t.symbol}</option>)}
          </select>
        </div>
        <div className="mt-4 flex gap-3">
          <button className={btnAction} disabled={!!busy} onClick={() => run("deposit")}>{busy === "deposit" ? <BusyText text="Depositing…" /> : "Deposit"}</button>
          <button className={btnGhost} disabled={!!busy} onClick={() => run("withdraw")}>{busy === "withdraw" ? <BusyText text="Withdrawing…" tone="orange" /> : "Withdraw"}</button>
        </div>
        <p className="mt-3 text-xs text-muted">The first time you withdraw a token, your account is also registered with that token (a one-time fee of about 0.00125 NEAR), so you&apos;ll see an extra approval.</p>
        {msg && <p className="mt-3 text-sm text-green-ink">{msg}</p>}
        {tx && <a href={tx} target="_blank" rel="noreferrer" className="mt-2 block text-xs underline">View transaction</a>}
        {err && <p role="alert" className="mt-3 text-sm text-orange">{err}</p>}
      </div>
    </section>
  );
}
