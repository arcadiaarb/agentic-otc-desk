"use client";

import { useCallback, useEffect, useState } from "react";
import { CreateIntentButton } from "@/components/create-intent-dialog";
import { IntentCard } from "@/components/intent-card";
import { timeLeft, type PublicIntent } from "@/lib/intents";
import { btnGhost } from "@/lib/ui";

export default function Intents() {
  const [intents, setIntents] = useState<PublicIntent[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/intents", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      setIntents((await res.json()).intents);
      setError("");
    } catch {
      setError("Couldn't load intents. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // pick up listings from other users
    return () => clearInterval(t);
  }, [load]);

  return (
    <section className="pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Open intents</h1>
          <p className="mt-2 text-muted">Only the broad strokes are public. Exact size and price stay sealed.</p>
        </div>
        <CreateIntentButton onCreated={load} />
      </div>
      <p role="status" className="mt-6 min-h-5 text-sm text-green-ink">{notice}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-orange">
          {error} <button className="underline" onClick={load}>Retry</button>
        </p>
      )}
      {intents === null && !error && <p className="mt-2 text-muted">Loading intents…</p>}
      {intents?.length === 0 && <p className="mt-2 text-muted">No open intents yet. Create the first one.</p>}
      <div className="mt-2 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {intents?.map((i) => (
          <IntentCard key={i.id} intent={{ ...i, expiresLabel: timeLeft(i.expiresAt) }} action={
            <button className={`${btnGhost} w-full`} onClick={() => setNotice("Negotiation rooms open in the next step. This button is a preview.")}>
              Request Negotiation
            </button>
          } />
        ))}
      </div>
    </section>
  );
}
