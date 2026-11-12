"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { actionCreators } from "@near-js/transactions";
import { BusyText, PageSpinner, Spinner } from "./spinner";
import { useWallet } from "./wallet-provider";
import { useVerifierKey } from "./use-verifier-key";
import { btnAction, btnGhost } from "@/lib/ui";

type Phase = "simulating" | "executing" | "simulate_failed" | "submit_failed" | "done" | "stalled";
type View = {
  network: string; verifier: string; status: "awaiting_buyer" | "awaiting_seller" | "ready" | "settled" | "expired"; phase: Phase | null;
  role: "seller" | "buyer"; pair: string; deadline: string; sellerHours: number; error: string; txUrl: string | null;
  amount: string; price: string; total: string; baseSymbol: string; quoteSymbol: string; turn: "buyer" | "seller" | null;
  you: { signed: boolean; contract: string; symbol: string; need: string; inVerifier: string; inWallet: string; enough: boolean; depositUnits: string };
  otherSigned: boolean;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtLeft = (ms: number) => {
  if (ms <= 0) return "a moment";
  const m = Math.floor(ms / 60000);
  return m >= 90 ? `${Math.floor(m / 60)} hr` : `${Math.max(m, 1)} min`;
};

// The pending-sale settlement page: one small step at a time, so it's clear where anything goes wrong.
// Buyer: balance -> register key -> sign -> info.  Seller: waiting -> sign.  Both: progress -> success.
export function SettlementFlow({ roomId }: { roomId: string }) {
  const { accountId, getWallet } = useWallet();
  const key = useVerifierKey();
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState<"" | "deposit" | "sign" | "retry">("");
  const [signMsg, setSignMsg] = useState("");
  const [needKey, setNeedKey] = useState(""); // exact key the verifier says is missing
  const [now, setNow] = useState(Date.now());
  const [tick, setTick] = useState(0);

  const load = useCallback(async (): Promise<View | null> => {
    try {
      const res = await fetch(`/api/settlements/${roomId}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not load the settlement.");
      setV(d); setErr("");
      return d;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the settlement.");
      return null;
    }
  }, [roomId]);

  const finished = v?.status === "settled" || v?.status === "expired";
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (finished) return; const t = setInterval(load, v?.status === "ready" ? 2000 : 4000); return () => clearInterval(t); }, [load, finished, v?.status]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (v?.phase !== "executing") return; const t = setInterval(() => setTick((x) => x + 1), 3000); return () => clearInterval(t); }, [v?.phase]);

  const deposit = async () => {
    if (!v) return;
    setBusy("deposit"); setErr("");
    try {
      const w = await getWallet();
      if (!w) throw new Error("Connect your wallet first.");
      // NEP-141 deposit: ft_transfer_call to the verifier with an empty msg credits the sender. Needs exactly 1 yoctoNEAR.
      await w.signAndSendTransaction({
        signerId: accountId ?? undefined, receiverId: v.you.contract,
        actions: [actionCreators.functionCall("ft_transfer_call", { receiver_id: v.verifier, amount: v.you.depositUnits, msg: "" }, 100n * 10n ** 12n, 1n)],
      });
      for (let i = 0; i < 10; i++) { if ((await load())?.you.enough) break; await wait(2000); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The deposit didn't go through.");
    } finally {
      setBusy("");
    }
  };

  const sign = async () => {
    setBusy("sign"); setErr("");
    try {
      setSignMsg("Preparing your trade…");
      const prep = await fetch(`/api/settlements/${roomId}/prepare`, { method: "POST" });
      const p = await prep.json().catch(() => ({}));
      if (!prep.ok) throw new Error(p.error ?? "Could not prepare the trade.");
      const w = await getWallet();
      if (!w?.signMessage) throw new Error("This wallet can't sign messages. Try MyNearWallet or Meteor.");
      const { Buffer: Shim } = await import("buffer"); // wallets expect a real Buffer for the nonce
      const g = globalThis as unknown as { Buffer?: typeof Shim };
      g.Buffer ??= Shim;
      setSignMsg("Waiting for your wallet…");
      const signed = await Promise.race([
        w.signMessage({ message: p.message, recipient: p.recipient, nonce: g.Buffer.from(p.nonce, "base64") }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Your wallet didn't respond within 3 minutes. Close its window and try again.")), 180_000)),
      ]);
      if (!signed) throw new Error("Your wallet didn't return a signature. Try again.");
      setSignMsg("Saving your signature…");
      const res = await fetch(`/api/settlements/${roomId}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: signed.publicKey, signature: signed.signature }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { if (d.code === "key_not_registered" && d.publicKey) setNeedKey(d.publicKey); throw new Error(d.error ?? "Could not record your signature."); }
      setNeedKey("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not sign the trade.");
    } finally {
      setBusy(""); setSignMsg("");
    }
  };

  const retry = async () => {
    setBusy("retry"); setErr("");
    try {
      const res = await fetch(`/api/settlements/${roomId}/submit`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not retry.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not retry.");
    } finally {
      setBusy("");
    }
  };

  if (!v) return err ? <p role="alert" className="pt-10 text-center text-orange">{err}</p> : <PageSpinner />;

  const left = Date.parse(v.deadline) - now;
  const canDeposit = !v.you.enough && BigInt(v.you.depositUnits || "0") > 0n;
  const buyer = v.role === "buyer";

  const Row = ({ k, children }: { k: string; children: ReactNode }) => <div className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right">{children}</dd></div>;
  const Terms = () => (
    <dl className="mt-4 space-y-2 rounded-xl border border-dashed border-line p-4 text-sm">
      <Row k="Pair">{v.pair}</Row>
      <Row k="Amount">{v.amount} {v.baseSymbol}</Row>
      <Row k="Price">{v.price} {v.quoteSymbol} per {v.baseSymbol}</Row>
      <Row k="Total">{v.total} {v.quoteSymbol}</Row>
    </dl>
  );
  const Title = ({ children, sub }: { children: ReactNode; sub?: string }) => (
    <div><h2 className="font-display text-xl font-medium">{children}</h2>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>
  );
  const Err = () => (err || (v.error && !v.phase) ? <p role="alert" className="mt-4 text-sm text-orange">{err || v.error}</p> : null);
  const Dots = ({ n }: { n: number }) => (
    <div className="mb-5 flex gap-1.5" aria-label={`Step ${n} of 3`}>{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-8 rounded-full ${i <= n ? "bg-orange" : "bg-line"}`} />)}</div>
  );

  let body: ReactNode;

  if (v.status === "expired") {
    body = <><Title sub="The signing window ended before the deal could be completed.">Deal expired</Title><p className="mt-4 text-sm text-muted">The intent went back on the board.</p></>;

  } else if (v.status === "settled" || v.status === "ready") {
    // ---- Progress (both roles see this once the seller has signed)
    const p = v.status === "settled" ? "done" : v.phase;
    const alt = ["Executing Transaction", "Please wait a moment"][tick % 2];
    body = (
      <div className="flex flex-col items-center py-6 text-center">
        {(p === "simulating") && <><Spinner className="size-12 border-[3px]" /><p className="mt-5 font-medium">Starting Transaction</p></>}
        {(p === "executing") && <><Spinner className="size-12 border-[3px]" /><p className="mt-5 font-medium" aria-live="polite">{alt}</p></>}
        {(p === "simulate_failed" || p === "stalled") && (
          <>
            <p className="font-medium text-orange">{p === "stalled" ? "The transaction didn't start" : "Error Starting the Transaction"}</p>
            {v.error && <p className="mt-2 max-w-sm break-words text-xs text-muted">{v.error}</p>}
            <button className={`${btnAction} mt-5`} disabled={busy === "retry"} onClick={retry}>{busy === "retry" ? <BusyText text="Retrying…" /> : "Retry"}</button>
          </>
        )}
        {p === "submit_failed" && (
          <>
            <p className="font-medium text-orange">Error Submitting the Transaction</p>
            {v.error && <p className="mt-2 max-w-sm break-words text-xs text-muted">{v.error}</p>}
            <button className={`${btnAction} mt-5`} disabled={busy === "retry"} onClick={retry}>{busy === "retry" ? <BusyText text="Retrying…" /> : "Retry"}</button>
          </>
        )}
        {p === "done" && (
          <>
            <p className="font-display text-xl font-medium text-green-ink">Swap Successful</p>
            <p className="mt-2 text-sm">Thank You for Choosing Tacet</p>
            {v.txUrl && <a href={v.txUrl} target="_blank" rel="noreferrer" className="mt-4 max-w-full break-all text-xs underline">Transaction: {v.txUrl.split("/txns/")[1]}</a>}
          </>
        )}
      </div>
    );

  } else if (buyer && v.you.signed) {
    body = (
      <>
        <Title>Signed</Title>
        <p className="mt-4 text-sm">Your signature was successful. Waiting for the seller to sign, and the funds will be released.</p>
        <p className="mt-3 text-sm text-muted">The seller has {fmtLeft(left)} left to sign.</p>
      </>
    );

  } else if (buyer) {
    // ---- Buyer steps
    if (step === 1) {
      body = (
        <>
          <Dots n={1} />
          <Title sub="Trades settle from inside the verifier, not from your wallet.">Balance in verifier</Title>
          <dl className="mt-4 space-y-2 text-sm">
            <Row k="In verifier"><strong>{v.you.inVerifier} {v.you.symbol}</strong></Row>
            <Row k="In your wallet"><strong>{v.you.inWallet} {v.you.symbol}</strong></Row>
            <Row k="You need">{v.you.need} {v.you.symbol}</Row>
          </dl>
          <div className="mt-5">
            {v.you.enough
              ? <button className={btnAction} onClick={() => setStep(2)}>Next</button>
              : canDeposit
                ? <button className={btnAction} disabled={busy === "deposit"} onClick={deposit}>{busy === "deposit" ? <BusyText text="Depositing…" /> : "Deposit"}</button>
                : <p className="text-sm text-muted">Your wallet has no {v.you.symbol} to deposit. {v.network === "testnet" ? "On testnet, get tokens from the Tidepool app, then reload." : ""}</p>}
          </div>
        </>
      );
    } else if (step === 2) {
      body = (
        <>
          <Dots n={2} />
          <Title sub="A one-time step so the verifier accepts your signature.">Register key</Title>
          <div className="mt-4 space-y-3 text-sm">
            {(key.registered === undefined || key.busy === "check") && <div className="flex items-center gap-2 text-muted"><Spinner className="size-4" /> Checking…</div>}
            {key.registered === true && <p className="text-green-ink">Your key is registered.</p>}
            {key.registered === false && <p>Your key isn&apos;t registered yet.</p>}
            {key.registered === null && <p className="text-muted">We couldn&apos;t verify this automatically. You can register to be safe, or continue and we&apos;ll find out when you sign.</p>}
            {key.pk && <p className="break-all font-mono text-xs text-muted">{key.pk}</p>}
            {key.tx && <a href={key.tx} target="_blank" rel="noreferrer" className="text-xs underline">View registration transaction</a>}
            {key.error && <p role="alert" className="text-orange">{key.error}</p>}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {key.registered === true && <button className={btnAction} onClick={() => setStep(3)}>Next</button>}
            {(key.registered === false || key.registered === null) && <button className={btnAction} disabled={!!key.busy} onClick={() => key.register()}>{key.busy === "register" ? <BusyText text="Registering…" /> : "Register"}</button>}
            {key.registered === null && <button className={btnGhost} onClick={() => setStep(3)}>Next</button>}
            {key.registered !== undefined && <button className={btnGhost} disabled={!!key.busy} onClick={() => key.check()}>Check again</button>}
          </div>
        </>
      );
    } else {
      body = (
        <>
          <Dots n={3} />
          <Title>Swap</Title>
          <Terms />
          <p className="mt-4 text-sm text-muted">You have {fmtLeft(left)} to sign the trade, or it will be relisted.</p>
          <div className="mt-5"><button className={btnAction} disabled={busy === "sign"} onClick={sign}>{busy === "sign" ? <BusyText text={signMsg || "Signing…"} /> : "Sign the Trade"}</button></div>
          {needKey && (
            <div className="mt-4 rounded-xl border border-dashed border-orange/50 p-3 text-sm">
              <p>The verifier says the key your wallet signed with isn&apos;t registered. Register that exact key, then sign again.</p>
              <p className="mt-1 break-all font-mono text-xs text-muted">{needKey}</p>
              <button className={`${btnGhost} mt-2`} disabled={!!key.busy} onClick={async () => { await key.register(needKey); setNeedKey(""); }}>{key.busy === "register" ? <BusyText text="Registering…" tone="orange" /> : "Register this key"}</button>
            </div>
          )}
        </>
      );
    }

  } else if (v.status === "awaiting_buyer") {
    // ---- Seller: the buyer hasn't signed yet
    body = (
      <>
        <Title sub={`The buyer has ${fmtLeft(left)} to sign. After that you get ${v.sellerHours} hours.`}>Waiting</Title>
        <div className="mt-6 flex items-center gap-3 text-sm text-muted"><Spinner className="size-5" /> Waiting for the buyer to sign the trade…</div>
        <Terms />
      </>
    );

  } else {
    // ---- Seller: the buyer has signed, it's your turn
    body = (
      <>
        <Title sub={`You have ${fmtLeft(left)} left to sign.`}>Your turn</Title>
        <p className="mt-4 text-sm">The buyer has successfully signed the trade. Waiting for you to sign.</p>
        <Terms />
        {!v.you.enough && (
          <div className="mt-4 rounded-xl border border-dashed border-orange/50 p-3 text-sm">
            <p>Your {v.you.symbol} inside the verifier ({v.you.inVerifier}) doesn&apos;t cover this trade ({v.you.need}).</p>
            {canDeposit && <button className={`${btnAction} mt-2`} disabled={busy === "deposit"} onClick={deposit}>{busy === "deposit" ? <BusyText text="Depositing…" /> : "Deposit"}</button>}
          </div>
        )}
        {key.registered === false && !needKey && (
          <div className="mt-4 rounded-xl border border-dashed border-orange/50 p-3 text-sm">
            <p>Your wallet key isn&apos;t registered with the verifier.</p>
            <button className={`${btnGhost} mt-2`} disabled={!!key.busy} onClick={() => key.register()}>{key.busy === "register" ? <BusyText text="Registering…" tone="orange" /> : "Register key"}</button>
          </div>
        )}
        {needKey && (
          <div className="mt-4 rounded-xl border border-dashed border-orange/50 p-3 text-sm">
            <p>The verifier says the key your wallet signed with isn&apos;t registered. Register that exact key, then sign again.</p>
            <p className="mt-1 break-all font-mono text-xs text-muted">{needKey}</p>
            <button className={`${btnGhost} mt-2`} disabled={!!key.busy} onClick={async () => { await key.register(needKey); setNeedKey(""); }}>{key.busy === "register" ? <BusyText text="Registering…" tone="orange" /> : "Register this key"}</button>
          </div>
        )}
        <div className="mt-5"><button className={btnAction} disabled={busy === "sign" || !v.you.enough} onClick={sign}>{busy === "sign" ? <BusyText text={signMsg || "Signing…"} /> : "Sign Trade"}</button></div>
      </>
    );
  }

  return (
    <section className="mx-auto max-w-lg pt-10">
      <div className="flex items-center justify-between">
        <Link href="/my-intents" className="text-sm text-muted hover:text-text">← My Intents</Link>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{v.network}</span>
      </div>
      <div className="mt-4 rounded-2xl border border-line bg-surface p-6">
        {body}
        <Err />
      </div>
      <p className="mt-4 text-center text-xs text-muted"><Link href={`/room/${roomId}?stay=1`} className="underline">View the negotiation</Link></p>
    </section>
  );
}
