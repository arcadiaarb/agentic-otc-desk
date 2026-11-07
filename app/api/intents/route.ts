import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase";
import { commit, encryptPrivate, newSalt } from "@/lib/crypto";
import { EXPIRY_MS, PAIRS, SIZES } from "@/lib/intents";

export const dynamic = "force-dynamic";

type IntentDoc = { pair: string; sizeBucket: string; commitment: string; status: string; createdAt: Timestamp; expiresAt: Timestamp };

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Public board: metadata + commitment only. Never touches intent_private.
export async function GET() {
  try {
    // Single-field filter only, so no composite index is needed. Status and sort happen in code.
    const snap = await db().collection("intents").where("expiresAt", ">", Timestamp.now()).limit(100).get();
    const intents = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as IntentDoc) }))
      .filter((r) => r.status === "open")
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      .slice(0, 50)
      .map((r) => ({ id: r.id, pair: r.pair, size: r.sizeBucket, commitment: r.commitment, expiresAt: r.expiresAt.toDate().toISOString() }));
    return NextResponse.json({ intents });
  } catch (e) {
    console.error("GET /api/intents", e);
    return fail("Could not load intents.", 500);
  }
}

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail("Invalid request."); }

  const { pair, size, expiry, accountId } = b;
  const num = (v: unknown) => (typeof v === "string" && v.length <= 32 && Number(v) > 0 && Number.isFinite(Number(v)) ? v.trim() : null);
  const amount = num(b.amount), price = num(b.price);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "";

  if (typeof pair !== "string" || !PAIRS.includes(pair)) return fail("Choose a valid asset pair.");
  if (typeof size !== "string" || !SIZES.includes(size)) return fail("Choose a valid size category.");
  if (typeof expiry !== "string" || !(expiry in EXPIRY_MS)) return fail("Choose how long the listing stays open.");
  if (!amount || !price) return fail("Enter an exact amount and price greater than zero.");
  if (typeof accountId !== "string" || !/^[a-z0-9._-]{2,64}$/.test(accountId)) return fail("Connect a wallet to submit.");

  try {
    const id = randomUUID();
    const details = { amount, price, note, salt: newSalt() };
    const commitment = commit(id, pair, details);
    const payloadEnc = encryptPrivate(details); // fail early on a bad key
    const firestore = db();
    const now = Timestamp.now();

    // One atomic batch: the public row never exists without its private row.
    const batch = firestore.batch();
    batch.set(firestore.collection("intents").doc(id), {
      pair, sizeBucket: size, commitment, status: "open", createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + EXPIRY_MS[expiry]),
    });
    batch.set(firestore.collection("intent_private").doc(id), { sellerAccount: accountId, payloadEnc, createdAt: now });
    await batch.commit();

    return NextResponse.json({ id, commitment }, { status: 201 });
  } catch (e) {
    console.error("POST /api/intents", e);
    return fail("Could not list your intent. Try again.", 500);
  }
}
