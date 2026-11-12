"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CreateIntentButton } from "@/components/create-intent-dialog";
import { BusyText, Spinner } from "@/components/spinner";
import { FundsCheck } from "@/components/funds-check";
import { useWallet } from "@/components/wallet-provider";
import { sizeForTotal } from "@/lib/intents";
import cfg from "@/lib/pairs.json";
import { btnGhost, btnGreen, btnPrimary, chipCls, fieldCls } from "@/lib/ui";

type Fields = { pair?: string; amount?: string; price?: string; expiry?: string; note?: string; noteDone?: boolean };
type Bubble = { who: "agent" | "me"; text: string };

const CHAT_MS = 5 * 60_000, MAX_MSG = 10;
const BASES = Array.from(new Set(cfg.pairs.map((p) => p.pair.split(" / ")[0])));
const GREETING =
  "Hello, I'm your Listing Agent. I only help you list an intent. This chat lasts 5 minutes or 10 messages, then closes. Nothing from it is saved except the intent you submit.\n\nWhat would you like to sell?";
const fmt = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 8 }).format(n);
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function Create() {
  const { signedIn, accountId, checking, signingIn, authError, connect, signIn } = useWallet();
  // Everything below lives only in this tab's memory. Nothing from the chat is stored anywhere.
  const [bubbles, setBubbles] = useState<Bubble[]>([{ who: "agent", text: GREETING }]);
  const [chips, setChips] = useState<string[]>(BASES);
  const [fields, setFields] = useState<Fields>({});
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [used, setUsed] = useState(0);
  const [closed, setClosed] = useState(false);
  const [done, setDone] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [fundsOk, setFundsOk] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startedAt || closed) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, closed]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [bubbles.length]);

  const left = startedAt ? Math.max(0, startedAt + CHAT_MS - now) : CHAT_MS;
  const over = closed || (startedAt > 0 && left === 0);
  const mm = Math.floor(left / 60000), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const total = Number(fields.amount) * Number(fields.price);
  const [base, quote] = (fields.pair ?? "").split(" / ");

  const reset = () => {
    setBubbles([{ who: "agent", text: GREETING }]); setChips(BASES); setFields({}); setReady(false); setToken(""); setStartedAt(0);
    setUsed(0); setClosed(false); setDone(false); setInput(""); setError("");
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy || over || done) return;
    setBusy(true); setError(""); setInput("");
    setBubbles((b) => [...b, { who: "me", text: t }]);
    try {
      const res = await post("/api/listing-agent", { message: t, fields, token });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { if (res.status === 410) setClosed(true); throw new Error(d.error ?? "Something went wrong. Try again."); }
      setBubbles((b) => [...b, { who: "agent", text: d.reply }]);
      setFields(d.fields); setChips(d.chips ?? []); setReady(!!d.ready); setToken(d.token);
      setStartedAt(d.startedAt); setUsed(d.used); setNow(Date.now());
      if (d.closed) setClosed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true); setError("");
    try {
      if (!signedIn && !(await signIn())) throw new Error(authError || "Sign the message in your wallet to continue.");
      const res = await post("/api/intents", {
        pair: fields.pair, size: sizeForTotal(total), expiry: fields.expiry, amount: fields.amount, price: fields.price, note: fields.note ?? "",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not list your intent. Try again.");
      setDone(true); setReady(false);
      setBubbles((b) => [...b, { who: "agent", text: "Done. Your intent is on the board." }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not list your intent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setFields({}); setReady(false); setClosed(true);
    setBubbles((b) => [...b, { who: "agent", text: "Cancelled. Nothing was saved." }]);
  };

  const row = (k: string, v: string) => (
    <div className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>
  );
  const hasPartial = !!(fields.pair || fields.amount || fields.price || fields.expiry);

  return (
    <section className="mx-auto -mb-24 flex min-h-[calc(100dvh-5rem)] max-w-2xl flex-col pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-medium tracking-tight">Create intent with AI</h1>
        <span className="text-sm text-muted" aria-live="off">
          {startedAt && !over ? `${mm}:${ss} left · ${MAX_MSG - used} messages left` : `5:00 · ${MAX_MSG} messages`}
        </span>
      </div>

      <div className="mt-6 flex-1 space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-live="polite">
        {bubbles.map((m, i) => (
          <div key={i} className={`flex ${m.who === "agent" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[88%] whitespace-pre-line rounded-2xl border px-4 py-3 text-sm ${m.who === "agent" ? "border-green/40" : "border-line"}`}>
              {m.who === "agent" && <p className="mb-1 text-xs text-muted">Listing Agent</p>}
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="py-1"><Spinner className="size-4" label="Thinking" /></div>}
        {!over && !done && chips.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {chips.map((c) => (
              <button key={c} disabled={!signedIn || busy} onClick={() => send(c)} className={chipCls}>{c}</button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-orange">{error}</p>}

      {ready && !done && (
        <div className="mt-6 rounded-2xl border border-dashed border-green/60 p-5">
          <h2 className="font-display text-lg font-medium">Your listing</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {row("Pair", fields.pair ?? "")}
            {row("Amount", `${fmt(Number(fields.amount))} ${base}`)}
            {row("Price", `${fmt(Number(fields.price))} ${quote} per ${base}`)}
            {row("You'd receive at least", `${fmt(total)} ${quote}`)}
            {row("Size range (public)", sizeForTotal(total))}
            {row("Open for", fields.expiry ?? "")}
            {fields.note ? row("Note (private)", fields.note.length > 60 ? `${fields.note.slice(0, 60)}…` : fields.note) : null}
          </dl>
          {signedIn && <div className="mt-4"><FundsCheck pair={fields.pair ?? ""} amount={fields.amount ?? ""} onChange={setFundsOk} /></div>}
          <div className="mt-5 flex justify-end gap-3">
            <button className={btnGhost} onClick={cancel} disabled={busy}>Cancel</button>
            <button className={btnPrimary} onClick={submit} disabled={busy || (signedIn && !fundsOk)}>{busy ? <BusyText text="Submitting…" /> : "Submit"}</button>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-10 mt-4 bg-bg pb-5 pt-3">
        {checking ? null : !signedIn ? (
          <div>
            <p className="text-sm text-muted">Sign in with your wallet to send messages.</p>
            {authError && <p role="alert" className="mt-2 text-sm text-orange">{authError}</p>}
            <button className={`${btnGreen} mt-3`} disabled={signingIn} onClick={accountId ? signIn : connect}>
              {accountId ? (signingIn ? <BusyText text="Signing…" /> : "Sign in") : "Connect Wallet"}
            </button>
          </div>
        ) : done ? (
          <div className="flex flex-wrap gap-3">
            <Link href="/intents" className={btnPrimary}>View Intent</Link>
            <Link href="/my-intents" className={btnGhost}>My Intents</Link>
            <button className={btnGhost} onClick={reset}>List another</button>
          </div>
        ) : over ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">This chat has closed.</p>
            <div className="flex flex-wrap gap-3">
              {!ready && hasPartial && (
                <CreateIntentButton className={btnPrimary} initial={{ ...fields, size: total > 0 ? sizeForTotal(total) : "" }}>Continue in the form</CreateIntentButton>
              )}
              <button className={btnGhost} onClick={reset}>Start a new chat</button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-3">
            <input className={fieldCls} value={input} maxLength={300} autoComplete="off" placeholder="Type your answer" onChange={(e) => setInput(e.target.value)} disabled={busy} />
            <button className={btnPrimary} type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        )}
      </div>
    </section>
  );
}
