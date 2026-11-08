// Server-only. Room state in Firestore + one-turn-at-a-time negotiation stepping.
import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./firebase";
import { decryptPrivate, seal, unseal } from "./crypto";
import { MAX_TURNS, agentMove, meets, prec, type Role } from "./negotiation";

export type Agreement = { pair: string; amount: string; price: string; nonce: string; intentId: string };
export type RoomDoc = {
  intentId: string; pair: string; sizeBucket: string; sellerAccount: string; buyerAccount: string;
  status: "negotiating" | "agreed" | "no_deal" | "closed"; turn: Role; turnCount: number; busyUntil: number;
  agreement: Agreement | null; amountsEnc?: string; createdAt: Timestamp; updatedAt: Timestamp;
};
type MsgDoc = { n: number; from: Role | "system"; kind: "propose" | "accept" | "walk" | "system"; text: string; price: number | null; ai: boolean; at: Timestamp };

export async function loadRoom(id: string, account: string) {
  const snap = await db().collection("rooms").doc(id).get();
  if (!snap.exists) return null;
  const room = snap.data() as RoomDoc;
  const role: Role | null = account === room.sellerAccount ? "seller" : account === room.buyerAccount ? "buyer" : null;
  return role ? { room, role } : null; // non-participants get the same "not found"
}

export async function roomView(id: string, room: RoomDoc, role: Role) {
  // After a deal, each side may see only THEIR OWN original amount (to spot a partial fill).
  let yourAmount: number | null = null;
  if (room.status === "agreed" && room.amountsEnc) {
    try { const a = unseal<{ seller: string; buyer: string }>(room.amountsEnc); yourAmount = Number(role === "seller" ? a.seller : a.buyer); } catch { /* ignore */ }
  }
  const msgs = await db().collection("rooms").doc(id).collection("messages").orderBy("n").get();
  return {
    id, pair: room.pair, sizeBucket: room.sizeBucket, status: room.status, role, round: room.turnCount, maxTurns: MAX_TURNS,
    agreement: room.agreement, yourAmount,
    messages: msgs.docs.map((d) => { const m = d.data() as MsgDoc; return { n: m.n, from: m.from, kind: m.kind, text: m.text, price: m.price, ai: m.ai }; }),
  };
}

// Runs at most one agent turn. A Firestore lock stops two open tabs from both stepping.
export async function stepRoom(id: string) {
  const fs = db();
  const ref = fs.collection("rooms").doc(id);
  const room = await fs.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as RoomDoc | undefined;
    if (!d || d.status !== "negotiating" || d.busyUntil > Date.now()) return null;
    tx.update(ref, { busyUntil: Date.now() + 30_000 });
    return d;
  });
  if (!room) return;

  const finish = async (status: RoomDoc["status"], text: string, n: number) => {
    const b = fs.batch();
    b.set(ref.collection("messages").doc(), { n, from: "system", kind: "system", text, price: null, ai: false, at: Timestamp.now() });
    b.update(ref, { status, busyUntil: 0, updatedAt: Timestamp.now() });
    await b.commit();
  };

  try {
    const msgs = (await ref.collection("messages").orderBy("n").get()).docs.map((d) => d.data() as MsgDoc);
    const [pub, sp, bp] = await Promise.all([
      fs.collection("intents").doc(room.intentId).get(),
      fs.collection("intent_private").doc(room.intentId).get(),
      fs.collection("room_private").doc(id).get(),
    ]);
    if (!pub.exists || pub.data()?.status !== "open" || !sp.exists || !bp.exists) return await finish("closed", "This intent is no longer available.", msgs.length);

    const seller = decryptPrivate(sp.data()!.payloadEnc), buyer = decryptPrivate(bp.data()!.payloadEnc);
    const role = room.turn, other: Role = role === "seller" ? "buyer" : "seller";
    const mine = role === "seller" ? seller : buyer;
    const limit = Number(mine.price);
    const last = (r: Role) => [...msgs].reverse().find((m) => m.kind === "propose" && m.from === r)?.price ?? undefined;
    const own = last(role), their = last(other);
    const canTake = their !== undefined && meets(role, their, limit);

    // Stalemate: both sides repeated their last price and the gap is still there. Stop instead of grinding on.
    const prices = (r: Role) => msgs.filter((m) => m.kind === "propose" && m.from === r).map((m) => m.price);
    const stuck = (a: (number | null)[]) => a.length >= 2 && a[a.length - 1] === a[a.length - 2];
    if (!canTake && stuck(prices("seller")) && stuck(prices("buyer")))
      return await finish("no_deal", "Both sides have stopped moving and the gap remains. No deal.", msgs.length);

    // Only public transcript goes to the agent: proposals and their (digit-free) messages.
    const history = msgs.filter((m) => m.kind === "propose" || m.kind === "accept")
      .map((m) => `${m.from === role ? "You" : "Counterparty"} ${m.kind === "accept" ? "accepted" : `proposed ${m.price}`}: "${m.text}"`).join("\n");

    // Spell out both standing prices so the model can't confuse directions.
    const brief = history ? `${history}\nYour last proposal: ${own ?? "none yet"}. Counterparty's latest proposal: ${their ?? "none yet"}.` : "";

    const move = canTake && room.turnCount >= MAX_TURNS - 3
      ? { action: "accept" as const, text: "Let's settle at that price.", ai: false, price: undefined }
      : room.turnCount >= MAX_TURNS - 1
        ? { action: "walk" as const, text: "We couldn't find a price that works for both sides.", ai: false, price: undefined }
        : await agentMove({ role, pair: room.pair, limit, amount: Number(mine.amount), note: mine.note, own, other: their, turn: room.turnCount, history: brief });

    const now = Timestamp.now();
    const b = fs.batch();
    b.set(ref.collection("messages").doc(), { n: msgs.length, from: role, kind: move.action, text: move.text, price: move.action === "propose" ? move.price ?? null : null, ai: move.ai, at: now });
    const upd: Record<string, unknown> = { turnCount: room.turnCount + 1, updatedAt: now, busyUntil: 0 };
    if (move.action === "propose") upd.turn = other;
    if (move.action === "walk") upd.status = "no_deal";
    if (move.action === "accept") {
      upd.status = "agreed";
      upd.amountsEnc = seal({ seller: seller.amount, buyer: buyer.amount });
      upd.agreement = { pair: room.pair, amount: String(prec(Math.min(Number(seller.amount), Number(buyer.amount)))), price: String(their), nonce: randomBytes(16).toString("hex"), intentId: room.intentId } satisfies Agreement;
      b.update(fs.collection("intents").doc(room.intentId), { status: "closed" }); // sold: off the board
    }
    b.update(ref, upd);
    await b.commit();
  } catch (e) {
    console.error("stepRoom", e);
    await ref.update({ busyUntil: 0 }).catch(() => {});
  }
}
