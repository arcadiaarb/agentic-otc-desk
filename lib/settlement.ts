// Server-only. Settlement state machine for an agreed deal.
// awaiting_buyer -> awaiting_seller -> ready -> settled   (or expired when the signing window closes)
// While `ready`, `phase` tells the UI what the relayer is doing: simulating -> executing -> done (or a *_failed state to retry).
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { base58 } from "@scure/base";
import { db } from "./firebase";
import { seal, unseal } from "./crypto";
import { NET, NETWORK, assetFor, txUrl } from "./network";
import { formatUnits, parseUnits } from "./units";
import * as chain from "./chain";
import type { RoomDoc } from "./rooms";

export type Role = "seller" | "buyer";
type Phase = "simulating" | "executing" | "simulate_failed" | "submit_failed" | "done";
type Signed = { standard: "nep413"; payload: { recipient: string; nonce: string; message: string }; public_key: string; signature: string };
type Secret = { prepared: Partial<Record<Role, { message: string; nonce: string }>>; signed: Partial<Record<Role, Signed>> };
export type SettlementDoc = {
  roomId: string; intentId: string; pair: string; sellerAccount: string; buyerAccount: string;
  baseAmount: string; price: string; baseUnits: string; quoteUnits: string; baseId: string; quoteId: string; network: string;
  deadlineMs: number; status: "awaiting_buyer" | "awaiting_seller" | "ready" | "settled" | "expired";
  phase?: Phase; phaseAt?: number; intentDeadlineMs?: number;
  secretEnc?: string; txHash?: string; error?: string; createdAt: Timestamp; updatedAt: Timestamp;
};

export class SettleError extends Error {
  constructor(message: string, public status = 400, public code?: string, public extra?: Record<string, unknown>) { super(message); }
}
const BUYER_MINUTES = Number(process.env.BUYER_SIGN_MINUTES) || 15; // the buyer is online right after the agreement
const SELLER_HOURS = Number(process.env.SELLER_SIGN_HOURS) || 24;   // the seller gets a full window once the buyer is committed
const PHASE_STALE_MS = 90_000;
const OPEN = ["awaiting_buyer", "awaiting_seller", "ready"];
const col = () => db().collection("settlements");
const secretOf = (d: SettlementDoc): Secret => (d.secretEnc ? unseal<Secret>(d.secretEnc) : { prepared: {}, signed: {} });
const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 220);

async function setIntentStatus(intentId: string, status: string, onlyIfCurrent?: string) {
  const ref = db().collection("intents").doc(intentId), snap = await ref.get();
  if (!snap.exists) return; // intent already cleaned up
  const d = snap.data()!;
  if (onlyIfCurrent && d.status !== onlyIfCurrent) return;
  if (status === "open" && d.expiresAt.toMillis() <= Date.now()) return; // listing itself has expired
  await ref.update({ status });
}

async function expireIfNeeded(d: SettlementDoc): Promise<SettlementDoc> {
  if (OPEN.includes(d.status) && Date.now() > d.deadlineMs) {
    await col().doc(d.roomId).update({ status: "expired", updatedAt: Timestamp.now() });
    await setIntentStatus(d.intentId, "open", "pending"); // the listing goes back on the board
    return { ...d, status: "expired" };
  }
  return d;
}

export async function ensureSettlement(roomId: string, room: RoomDoc): Promise<SettlementDoc> {
  const ref = col().doc(roomId), snap = await ref.get();
  if (snap.exists) return expireIfNeeded(snap.data() as SettlementDoc);
  if (room.status !== "agreed" || !room.agreement) throw new SettleError("There is no agreed deal in this room.", 409);
  const [baseSym, quoteSym] = room.pair.split(" / ");
  const base = assetFor(baseSym), quote = assetFor(quoteSym);
  if (!base || !quote) throw new SettleError(`Settlement isn't set up for ${room.pair} on ${NETWORK} yet.`, 501);
  const baseUnits = parseUnits(room.agreement.amount, base.decimals);
  const quoteUnits = (baseUnits * parseUnits(room.agreement.price, quote.decimals)) / 10n ** BigInt(base.decimals);
  if (baseUnits <= 0n || quoteUnits <= 0n) throw new SettleError("The agreed amount is too small to settle.");
  const now = Timestamp.now();
  const doc: SettlementDoc = {
    roomId, intentId: room.intentId, pair: room.pair, sellerAccount: room.sellerAccount, buyerAccount: room.buyerAccount,
    baseAmount: room.agreement.amount, price: room.agreement.price, baseUnits: baseUnits.toString(), quoteUnits: quoteUnits.toString(),
    baseId: base.id, quoteId: quote.id, network: NETWORK, deadlineMs: (room.agreedAtMs ?? Date.now()) + BUYER_MINUTES * 60_000,
    status: "awaiting_buyer", createdAt: now, updatedAt: now,
  };
  try { await ref.create(doc); } catch { return expireIfNeeded((await ref.get()).data() as SettlementDoc); } // the other side created it first
  return expireIfNeeded(doc);
}

export async function settlementView(roomId: string, room: RoomDoc, role: Role, me: string) {
  const d = await ensureSettlement(roomId, room);
  const [baseSym, quoteSym] = d.pair.split(" / ");
  const base = assetFor(baseSym)!, quote = assetFor(quoteSym)!;
  const need = role === "seller" ? { asset: base, units: BigInt(d.baseUnits) } : { asset: quote, units: BigInt(d.quoteUnits) };
  const sec = secretOf(d);
  let inVerifier = 0n, inWallet = 0n, chainError = "";
  try {
    [inVerifier, inWallet] = await Promise.all([chain.verifierBalance(me, need.asset.id), chain.walletBalance(me, need.asset.contract)]);
  } catch (e) { chainError = short(e); }
  const missing = need.units > inVerifier ? need.units - inVerifier : 0n;
  const f = (v: bigint) => formatUnits(v, need.asset.decimals);

  // `ready` with no live phase means the relayer never started or the server restarted mid-run: let the UI offer Retry.
  let phase: Phase | "stalled" | null = d.phase ?? null;
  if (d.status === "ready" && (!phase || ((phase === "simulating" || phase === "executing") && Date.now() - (d.phaseAt ?? 0) > PHASE_STALE_MS))) phase = "stalled";

  return {
    roomId, network: d.network, verifier: NET.verifier, status: d.status, phase, role, pair: d.pair,
    deadline: new Date(d.deadlineMs).toISOString(), sellerHours: SELLER_HOURS, error: d.error ?? chainError, txUrl: d.txHash ? txUrl(d.txHash) : null,
    amount: d.baseAmount, price: d.price, total: formatUnits(BigInt(d.quoteUnits), quote.decimals), baseSymbol: base.symbol, quoteSymbol: quote.symbol,
    turn: d.status === "awaiting_buyer" ? "buyer" : d.status === "awaiting_seller" ? "seller" : null,
    you: {
      accountId: me, signed: !!sec.signed[role], contract: need.asset.contract, symbol: need.asset.symbol, needUnits: need.units.toString(), need: f(need.units),
      inVerifier: f(inVerifier), inWallet: f(inWallet), enough: missing === 0n,
      depositUnits: (missing > 0n ? (missing < inWallet ? missing : inWallet) : 0n).toString(),
    },
    otherSigned: !!sec.signed[role === "buyer" ? "seller" : "buyer"],
  };
}

export async function prepare(roomId: string, room: RoomDoc, role: Role, me: string) {
  const d = await ensureSettlement(roomId, room);
  if (!OPEN.includes(d.status)) throw new SettleError("This deal can no longer be signed.", 409);
  if (role === "seller" && d.status === "awaiting_buyer") throw new SettleError("The buyer signs first. Check back once they have.", 409);
  if ((role === "buyer" && d.status !== "awaiting_buyer") || (role === "seller" && d.status !== "awaiting_seller")) throw new SettleError("You have already signed.", 409);
  if (d.deadlineMs - Date.now() < 2 * 60_000) throw new SettleError("Too close to the deadline to sign safely.", 409);

  const [baseSym, quoteSym] = d.pair.split(" / ");
  const need = role === "seller" ? { id: d.baseId, units: BigInt(d.baseUnits) } : { id: d.quoteId, units: BigInt(d.quoteUnits) };
  if ((await chain.verifierBalance(me, need.id)) < need.units) throw new SettleError(`Not enough ${role === "seller" ? baseSym : quoteSym} inside the verifier. Deposit first.`, 409, "insufficient_funds");

  // Mirror intents: what the seller gives is exactly what the buyer gets. Exact numbers, as the verifier requires.
  const diff = role === "seller"
    ? { [d.baseId]: `-${d.baseUnits}`, [d.quoteId]: d.quoteUnits }
    : { [d.baseId]: d.baseUnits, [d.quoteId]: `-${d.quoteUnits}` };
  // The buyer's signed intent must stay valid for the whole seller window; the seller's uses the same end time.
  const intentDeadlineMs = role === "buyer" ? Date.now() + SELLER_HOURS * 3_600_000 : d.intentDeadlineMs;
  if (!intentDeadlineMs) throw new SettleError("The buyer hasn't signed yet.", 409);
  const nonce = await chain.newNonce();
  const message = JSON.stringify({ deadline: new Date(intentDeadlineMs).toISOString(), intents: [{ intent: "token_diff", diff }], signer_id: me });
  const sec = secretOf(d);
  sec.prepared[role] = { message, nonce: nonce.toString("base64") };
  await col().doc(roomId).update({ secretEnc: seal(sec), updatedAt: Timestamp.now(), ...(role === "buyer" ? { intentDeadlineMs } : {}) });
  return { message, nonce: nonce.toString("base64"), recipient: NET.verifier };
}

export async function signTrade(roomId: string, room: RoomDoc, role: Role, me: string, publicKey: string, signature: string) {
  const d = await ensureSettlement(roomId, room);
  const turnOk = (role === "buyer" && d.status === "awaiting_buyer") || (role === "seller" && d.status === "awaiting_seller");
  if (!turnOk) throw new SettleError("It isn't your turn to sign.", 409);
  const sec = secretOf(d), prep = sec.prepared[role];
  if (!prep) throw new SettleError("Start the signing step again.", 409);
  if (!chain.verifySignature(prep.message, prep.nonce, NET.verifier, publicKey, signature)) throw new SettleError("That signature doesn't match this trade. Try again.");
  // The wallet may sign with a different key than the one it listed, so the exact key is returned for registration.
  if ((await chain.keyRegistered(me, publicKey)) === false) throw new SettleError("Register your wallet key with the verifier first.", 409, "key_not_registered", { publicKey });

  sec.signed[role] = { standard: "nep413", payload: { recipient: NET.verifier, nonce: prep.nonce, message: prep.message }, public_key: publicKey, signature: "ed25519:" + base58.encode(chain.sigBytes(signature)) };
  await col().doc(roomId).update({
    secretEnc: seal(sec), updatedAt: Timestamp.now(),
    ...(role === "buyer"
      // Once the buyer is committed, the seller's clock starts (ending a few minutes before the signed offers expire).
      ? { status: "awaiting_seller", ...(d.intentDeadlineMs ? { deadlineMs: d.intentDeadlineMs - 5 * 60_000 } : {}) }
      : { status: "ready", phase: "simulating", phaseAt: Date.now(), error: FieldValue.delete() }),
  });
  if (role === "seller") startSubmit(roomId); // runs in the background; the page follows `phase`
}

// Both signed: simulate, then submit one atomic transaction from the relayer account.
async function runSubmit(roomId: string) {
  const ref = col().doc(roomId), snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data() as SettlementDoc;
  if (d.status !== "ready") return;
  const sec = secretOf(d);
  if (!sec.signed.seller || !sec.signed.buyer) return;
  const signed = [sec.signed.seller, sec.signed.buyer];
  const phase = (p: Phase, extra: Record<string, unknown> = {}) => ref.update({ phase: p, phaseAt: Date.now(), updatedAt: Timestamp.now(), ...extra });

  await phase("simulating", { error: FieldValue.delete() });
  try { await chain.simulate(signed); } catch (e) { return void (await phase("simulate_failed", { error: short(e) })); }
  await phase("executing");
  let hash: string;
  try { hash = await chain.execute(signed); }
  catch (e) { return void (await phase("submit_failed", { error: e instanceof chain.RelayerMissing ? e.message : short(e) })); }
  await ref.update({ status: "settled", phase: "done", phaseAt: Date.now(), txHash: hash, error: FieldValue.delete(), updatedAt: Timestamp.now() });
  await setIntentStatus(d.intentId, "closed");
}
function startSubmit(roomId: string) {
  runSubmit(roomId).catch((e) => console.error("settlement submit", short(e)));
}

// Retry button. Does nothing if a run is already in flight.
export async function requestSubmit(roomId: string, room: RoomDoc) {
  const d = await ensureSettlement(roomId, room);
  if (d.status !== "ready") return;
  const running = (d.phase === "simulating" || d.phase === "executing") && Date.now() - (d.phaseAt ?? 0) < PHASE_STALE_MS;
  if (!running) startSubmit(roomId);
}
