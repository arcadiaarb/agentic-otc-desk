"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BusyText, PageSpinner } from "@/components/spinner";
import { useWallet } from "@/components/wallet-provider";
import { btnGreen } from "@/lib/ui";

type Msg = { n: number; from: "seller" | "buyer" | "system"; kind: string; text: string; price: number | null; ai?: boolean };
type View = {
  id: string; pair: string; sizeBucket: string; role: "seller" | "buyer"; round: number; maxTurns: number;
  status: "negotiating" | "agreed" | "no_deal" | "closed"; messages: Msg[];
  agreement: { pair: string; amount: string; price: string; nonce: string } | null; yourAmount: number | null;
};

const fmt = (n: number | string) => new Intl.NumberFormat("en", { maximumSignificantDigits: 8 }).format(Number(n));
const STATUS = { negotiating: "Negotiating", agreed: "Deal agreed", no_deal: "No deal", closed: "Closed" };

export default function Room() {
  const { id } = useParams<{ id: string }>();
  const { signedIn, accountId, checking, signingIn, connect, signIn } = useWallet();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Each tick asks the server to advance one agent turn while negotiating, then shows the result.
  useEffect(() => {
    if (!signedIn) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async (status?: string) => {
      try {
        const live = status === "negotiating";
        const res = await fetch(`/api/rooms/${id}${live ? "/step" : ""}`, { method: live ? "POST" : "GET", cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not load the room.");
        if (stop) return;
        setView(data); setError("");
        if (data.status === "negotiating") timer = setTimeout(() => tick("negotiating"), 2500);
      } catch (e) {
        if (stop) return;
        setError(e instanceof Error ? e.message : "Could not load the room.");
        timer = setTimeout(() => tick(status), 5000);
      }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [id, signedIn]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [view?.messages.length]);

  if (checking) return <PageSpinner />;
  if (!signedIn) {
    return (
      <section className="pt-10">
        <h1 className="font-display text-3xl font-medium tracking-tight">Private room</h1>
        <p className="mt-3 max-w-md text-muted">Sign in with the wallet that belongs to this negotiation.</p>
        <button className={`${btnGreen} mt-6`} disabled={signingIn} onClick={accountId ? signIn : connect}>
          {accountId ? (signingIn ? <BusyText text="Signing…" /> : "Sign in") : "Connect Wallet"}
        </button>
      </section>
    );
  }
  if (error && !view) return <p role="alert" className="pt-10 text-orange">{error} <Link href="/my-intents" className="underline">Back to My Intents</Link></p>;
  if (!view) return <PageSpinner />;

  const [base, quote] = view.pair.split(" / ");
  const live = view.status === "negotiating";

  return (
    <section className="mx-auto max-w-2xl pt-10">
      <Link href="/my-intents" className="text-sm text-muted hover:text-text">← My Intents</Link>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-medium tracking-tight">{view.pair} <span className="ml-2 font-sans text-base font-normal text-muted">{view.sizeBucket}</span></h1>
        <span className={`flex items-center gap-2 text-sm ${view.status === "agreed" ? "text-green-ink" : "text-muted"}`}>
          {live && <span className="size-2 animate-pulse rounded-full bg-orange" aria-hidden />}{STATUS[view.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">You are the {view.role}. Your agent negotiates for you; your exact limits stay private.</p>

      <div className="mt-6 space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-live="polite">
        {view.messages.map((m) => {
          if (m.from === "system") return <p key={m.n} className="py-1 text-center text-xs text-muted">{m.text}</p>;
          const mine = m.from === view.role;
          return (
            <div key={m.n} className={`flex ${m.from === "seller" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl border px-4 py-3 ${m.from === "seller" ? "border-green/40" : "border-orange/40"}`}>
                <p className="text-xs text-muted">{mine ? "Your agent" : "Counterparty agent"} · {m.from} · {m.ai ? "AI" : "rule-based"}</p>
                <p className="mt-1 text-sm">{m.text}</p>
                {m.price !== null && (
                  <p className="mt-2 font-display text-base">{fmt(m.price)} <span className="font-sans text-xs text-muted">{quote} per {base}</span></p>
                )}
                {m.kind === "accept" && <p className="mt-2 text-xs font-semibold text-green-ink">Accepted</p>}
              </div>
            </div>
          );
        })}
        {live && <p className="py-1 text-center text-xs text-muted">Agents are exchanging proposals… (turn {view.round + 1} of {view.maxTurns})</p>}
        <div ref={endRef} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-orange">{error}</p>}

      {view.agreement && (
        <div className="mt-6 rounded-2xl border border-green/50 bg-surface p-5">
          <h2 className="font-display text-lg font-medium">Agreement reached</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Pair</dt><dd>{view.agreement.pair}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Amount</dt><dd>{fmt(view.agreement.amount)} {base}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Price</dt><dd>{fmt(view.agreement.price)} {quote} per {base}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Total</dt><dd>{fmt(Number(view.agreement.amount) * Number(view.agreement.price))} {quote}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Nonce</dt><dd className="font-mono text-xs">{view.agreement.nonce.slice(0, 12)}…</dd></div>
          </dl>
          {view.yourAmount !== null && view.yourAmount > Number(view.agreement.amount) && (
            <p className="mt-4 rounded-xl border border-dashed border-orange/50 px-3.5 py-3 text-sm">
              {view.role === "buyer"
                ? <>Partial fill: you asked for {fmt(view.yourAmount)} {base}, and this deal covers {fmt(view.agreement.amount)}. To get the rest, <Link href="/intents" className="underline">request another intent on the board</Link>.</>
                : <>Partial sale: you listed {fmt(view.yourAmount)} {base}, and this deal covers {fmt(view.agreement.amount)}. The intent is now closed, so <Link href="/intents" className="underline">list the rest as a new intent</Link>.</>}
            </p>
          )}
          <p className="mt-4 text-sm text-muted">Signing and settlement through 1Click come in the next phase.</p>
        </div>
      )}
      {view.status === "no_deal" && <p className="mt-6 text-sm text-muted">The agents couldn&apos;t find a price that works for both sides.</p>}
      {view.status === "closed" && <p className="mt-6 text-sm text-muted">This negotiation was closed because the intent is no longer available.</p>}
    </section>
  );
}
