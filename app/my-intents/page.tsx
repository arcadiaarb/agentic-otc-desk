"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CreateIntentButton } from "@/components/create-intent-dialog";
import { useWallet } from "@/components/wallet-provider";
import { timeLeft } from "@/lib/intents";
import { btnGhost, btnGreen } from "@/lib/ui";

type Mine = { id: string; pair: string; size: string; commitment: string; status: string; expiresAt: string };
type RoomRow = { id: string; pair: string; role: "seller" | "buyer"; status: string };

const label = (i: Mine) => (i.status === "open" && Date.parse(i.expiresAt) <= Date.now() ? "expired" : i.status);
const STATUS: Record<string, string> = { negotiating: "Negotiating", agreed: "Deal agreed", no_deal: "No deal", closed: "Closed" };

export default function MyIntents() {
  const { signedIn, accountId, checking, signingIn, authError, connect, signIn } = useWallet();
  const [intents, setIntents] = useState<Mine[] | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch("/api/intents/mine", { cache: "no-store" }), fetch("/api/rooms", { cache: "no-store" })]);
      if (!a.ok || !b.ok) throw new Error("load failed");
      setIntents((await a.json()).intents);
      setRooms((await b.json()).rooms);
      setError("");
    } catch {
      setError("Couldn't load your intents. Try again.");
    }
  }, []);
  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);

  const remove = async (i: Mine) => {
    if (!confirm(`Delete your ${i.pair} intent? It disappears from the board and any open negotiation on it is closed.`)) return;
    setDeleting(i.id);
    try {
      const res = await fetch(`/api/intents/${i.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("Couldn't delete that intent. Try again.");
    } finally {
      setDeleting("");
    }
  };

  if (checking) return <p className="pt-10 text-muted">Loading…</p>;
  if (!signedIn) {
    return (
      <section className="pt-10">
        <h1 className="font-display text-3xl font-medium tracking-tight">My Intents</h1>
        <p className="mt-3 max-w-md text-muted">Sign in with your wallet to manage your intents and negotiations.</p>
        {authError && <p role="alert" className="mt-3 text-sm text-orange">{authError}</p>}
        <button className={`${btnGreen} mt-6`} disabled={signingIn} onClick={accountId ? signIn : connect}>
          {accountId ? (signingIn ? "Signing…" : "Sign in") : "Connect Wallet"}
        </button>
      </section>
    );
  }

  return (
    <section className="pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-medium tracking-tight">My Intents</h1>
        <CreateIntentButton onCreated={load} />
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-orange">{error}</p>}
      {intents === null && !error && <p className="mt-6 text-muted">Loading…</p>}
      {intents?.length === 0 && <p className="mt-6 text-muted">You haven&apos;t listed anything yet.</p>}
      <ul className="mt-6 space-y-3">
        {intents?.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
            <div>
              <p className="font-display font-medium">{i.pair} <span className="ml-2 font-sans text-sm font-normal text-muted">{i.size}</span></p>
              <p className="mt-1 text-sm text-muted">
                <span className={label(i) === "open" ? "text-green-ink" : ""}>{label(i)}</span>
                {label(i) === "open" && ` · expires in ${timeLeft(i.expiresAt)}`}
              </p>
            </div>
            <button className={btnGhost} disabled={deleting === i.id} onClick={() => remove(i)}>{deleting === i.id ? "Deleting…" : "Delete"}</button>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 font-display text-xl font-medium">Negotiations</h2>
      {rooms.length === 0 && <p className="mt-3 text-muted">None yet. Open one from the board, or wait for a buyer.</p>}
      <ul className="mt-4 space-y-3">
        {rooms.map((r) => (
          <li key={r.id}>
            <Link href={`/room/${r.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-green">
              <span className="font-display font-medium">{r.pair} <span className="ml-2 font-sans text-sm font-normal text-muted">you are the {r.role}</span></span>
              <span className={`text-sm ${r.status === "agreed" ? "text-green-ink" : "text-muted"}`}>{STATUS[r.status] ?? r.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
