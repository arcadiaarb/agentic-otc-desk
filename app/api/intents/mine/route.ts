import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase";
import { fail, sessionAccount } from "@/lib/api";

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
    return NextResponse.json({ intents });
  } catch (e) {
    console.error("GET /api/intents/mine", e);
    return fail("Could not load your intents.", 500);
  }
}
