import { NextResponse } from "next/server";
import { fail, num, sessionAccount } from "@/lib/api";
import { EXPIRIES, PAIRS } from "@/lib/intents";
import { handle, type Fields } from "@/lib/listing";
import { getPrices } from "@/lib/prices";
import { makeChatToken, readChatToken } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAT_MS = 5 * 60_000, MAX_MSG = 10, MAX_CHATS_PER_HOUR = 6;
// Counters only (no message content is ever stored). In memory, so they reset if the server restarts.
const used = new Map<string, number>();     // "account|startedAt" -> messages used
const starts = new Map<string, number[]>(); // account -> chat start times

function cleanFields(v: unknown): Fields {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>, f: Fields = {};
  if (typeof o.pair === "string" && PAIRS.includes(o.pair)) f.pair = o.pair;
  if (typeof o.expiry === "string" && EXPIRIES.includes(o.expiry)) f.expiry = o.expiry;
  const a = num(o.amount), p = num(o.price);
  if (a) f.amount = a;
  if (p) f.price = p;
  if (typeof o.note === "string") f.note = o.note.slice(0, 500);
  if (o.noteDone === true) f.noteDone = true;
  return f;
}

export async function POST(req: Request) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet to chat.", 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail("Invalid request."); }
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message || message.length > 300) return fail("Keep each message under 300 characters.");

  const now = Date.now();
  let startedAt: number;
  if (typeof b.token === "string" && b.token) {
    const s = readChatToken(b.token, me);
    if (s === null) return fail("This chat has closed. Start a new one.", 410);
    startedAt = s;
  } else {
    const recent = (starts.get(me) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= MAX_CHATS_PER_HOUR) return fail("You've started several chats recently. Try again later, or use the regular form.", 429);
    startedAt = now;
    starts.set(me, [...recent, now]);
  }
  for (const k of used.keys()) if (now - Number(k.split("|")[1]) > 600_000) used.delete(k);

  const key = `${me}|${startedAt}`, n = used.get(key) ?? 0;
  if (now - startedAt > CHAT_MS || n >= MAX_MSG) return fail("This chat has closed.", 410);
  used.set(key, n + 1);

  try {
    const { prices } = await getPrices();
    const out = await handle(message, cleanFields(b.fields), prices);
    return NextResponse.json({ ...out, token: makeChatToken(me, startedAt), startedAt, used: n + 1, max: MAX_MSG, closed: n + 1 >= MAX_MSG });
  } catch (e) {
    console.error("listing-agent", e instanceof Error ? e.message : "error"); // never log message content
    return fail("The agent hit a problem. Try again, or use the regular form.", 500);
  }
}
