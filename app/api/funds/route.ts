import { NextResponse } from "next/server";
import { fail, num, sessionAccount } from "@/lib/api";
import { PAIRS } from "@/lib/intents";
import { sellerFunds } from "@/lib/funds";
import { SettleError } from "@/lib/settlement";

export const dynamic = "force-dynamic";

// "Are my tokens inside the verifier for this listing?" Reads the chain for the signed-in account only.
export async function GET(req: Request) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  const u = new URL(req.url), pair = u.searchParams.get("pair") ?? "", amount = num(u.searchParams.get("amount") ?? "");
  if (!PAIRS.includes(pair) || !amount) return fail("Enter a pair and an amount first.");
  try {
    return NextResponse.json(await sellerFunds(me, pair, amount));
  } catch (e) {
    if (e instanceof SettleError) return fail(e.message, e.status);
    console.error("funds", e instanceof Error ? e.message : e);
    return fail(`Couldn't check your funds right now: ${(e instanceof Error ? e.message : "unknown error").replace(/\s+/g, " ").slice(0, 140)}`, 503);
  }
}
