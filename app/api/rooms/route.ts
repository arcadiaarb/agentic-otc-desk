import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase";
import { decryptPrivate, encryptPrivate, newSalt } from "@/lib/crypto";
import { sellerFunds } from "@/lib/funds";
import { fail, num, sessionAccount } from "@/lib/api";

export const dynamic = "force-dynamic";

// Buyer asks to negotiate. Their exact amount and max price are encrypted and never shown to anyone.
export async function POST(req: Request) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet first.", 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail("Invalid request."); }
  const intentId = b.intentId, amount = num(b.amount), price = num(b.price);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "";
  if (typeof intentId !== "string" || !/^[0-9a-f-]{36}$/.test(intentId)) return fail("Unknown intent.", 404);
  if (!amount || !price) return fail("Enter your exact amount and maximum price.");

  try {
    const fs = db();
    const [pub, priv] = await Promise.all([fs.collection("intents").doc(intentId).get(), fs.collection("intent_private").doc(intentId).get()]);
    const d = pub.data();
    if (!d || !priv.exists || d.status !== "open" || d.expiresAt.toMillis() <= Date.now()) return fail("This intent is no longer open.", 404);
    const seller = priv.data()!.sellerAccount as string;
    if (seller === me) return fail("You can't negotiate on your own intent.");

    // Funds can leave the verifier any time, so check again now. (If the chain can't be reached we let it through; signing re-checks.)
    try {
      const f = await sellerFunds(seller, d.pair as string, decryptPrivate(priv.data()!.payloadEnc).amount);
      if (!f.enough) {
        await fs.collection("intents").doc(intentId).update({ status: "unfunded" });
        return fail("This listing isn't funded right now, so it can't be negotiated.", 409);
      }
    } catch (e) { console.error("funds check", e instanceof Error ? e.message : e); }

    const existing = await fs.collection("rooms").where("buyerAccount", "==", me).where("intentId", "==", intentId).get();
    const live = existing.docs.find((r) => r.data().status === "negotiating");
    if (live) return NextResponse.json({ id: live.id });

    const id = randomUUID(), now = Timestamp.now();
    const batch = fs.batch();
    batch.set(fs.collection("rooms").doc(id), {
      intentId, pair: d.pair, sizeBucket: d.sizeBucket, sellerAccount: seller, buyerAccount: me,
      status: "negotiating", turn: "seller", turnCount: 0, busyUntil: 0, agreement: null, createdAt: now, updatedAt: now,
    });
    batch.set(fs.collection("room_private").doc(id), { payloadEnc: encryptPrivate({ amount, price, note, salt: newSalt() }), createdAt: now });
    batch.set(fs.collection("rooms").doc(id).collection("messages").doc(), {
      n: 0, from: "system", kind: "system", text: "Negotiation started. The agents will trade proposals. Exact limits stay private.", price: null, ai: false, at: now,
    });
    await batch.commit();
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    console.error("POST /api/rooms", e);
    return fail("Could not open the negotiation. Try again.", 500);
  }
}

// Rooms where I'm the seller or the buyer.
export async function GET(req: Request) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  try {
    const fs = db();
    const [s, bq] = await Promise.all([
      fs.collection("rooms").where("sellerAccount", "==", me).get(),
      fs.collection("rooms").where("buyerAccount", "==", me).get(),
    ]);
    const rooms = [...s.docs, ...bq.docs]
      .map((r) => { const d = r.data(); return { id: r.id, pair: d.pair as string, role: d.sellerAccount === me ? "seller" : "buyer", status: d.status as string, updatedAt: (d.updatedAt as Timestamp).toMillis() }; })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const agreed = rooms.filter((r) => r.status === "agreed");
    const sdocs = agreed.length ? await fs.getAll(...agreed.map((r) => fs.collection("settlements").doc(r.id))) : [];
    const smap = new Map(sdocs.map((x) => [x.id, x.exists ? x.data() : null]));
    return NextResponse.json({
      rooms: rooms.map((r) => {
        if (r.status !== "agreed") return r;
        const s = smap.get(r.id), status: string = s?.status ?? "awaiting_buyer";
        const action = (status === "awaiting_buyer" && r.role === "buyer") || (status === "awaiting_seller" && r.role === "seller");
        return { ...r, settlement: { status, deadlineMs: (s?.deadlineMs as number | undefined) ?? null, action } };
      }),
    });
  } catch (e) {
    console.error("GET /api/rooms", e);
    return fail("Could not load your negotiations.", 500);
  }
}
