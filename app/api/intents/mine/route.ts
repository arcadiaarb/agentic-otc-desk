import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase";
import { fail, sessionAccount } from "@/lib/api";
import { decryptPrivate } from "@/lib/crypto";
import { sellerFunds } from "@/lib/funds";

export const dynamic = "force-dynamic";

// The signed-in seller's own intents. Public fields only; private details never leave the server.
export async function GET(req: Request) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  try {
    const fs = db();
    const owned = await fs.collection("intent_private").where("sellerAccount", "==", me).get();
    if (owned.empty) return NextResponse.json({ intents: [] });
    const pubs = await fs.getAll(...owned.docs.map((d) => fs.collection("intents").doc(d.id)));
    const intents = pubs
      .filter((p) => p.exists)
      .map((p) => {
        const d = p.data() as { pair: string; sizeBucket: string; commitment: string; status: string; createdAt: Timestamp; expiresAt: Timestamp };
        return { id: p.id, pair: d.pair, size: d.sizeBucket, commitment: d.commitment, status: d.status, createdAt: d.createdAt.toMillis(), expiresAt: d.expiresAt.toDate().toISOString() };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    // Re-check funding: open <-> unfunded follows whether the tokens are still inside the verifier.
    const priv = new Map(owned.docs.map((x) => [x.id, x.data().payloadEnc as string]));
    await Promise.all(intents.map(async (i) => {
      if (i.status !== "open" && i.status !== "unfunded") return;
      try {
        const funded = (await sellerFunds(me, i.pair, decryptPrivate(priv.get(i.id)!).amount)).enough;
        const next = funded ? (Date.parse(i.expiresAt) > Date.now() ? "open" : i.status) : "unfunded";
        if (next !== i.status) { await fs.collection("intents").doc(i.id).update({ status: next }); i.status = next; }
      } catch { /* chain unreachable: leave as is */ }
    }));
    return NextResponse.json({ intents });
  } catch (e) {
    console.error("GET /api/intents/mine", e);
    return fail("Could not load your intents.", 500);
  }
}
