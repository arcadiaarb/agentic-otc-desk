import { NextResponse } from "next/server";
import { fail, sessionAccount } from "@/lib/api";
import { overview } from "@/lib/verifier";

export const dynamic = "force-dynamic";

// Balances inside the verifier and in the wallet for every supported token.
export async function GET(req: Request) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  try {
    return NextResponse.json(await overview(me));
  } catch (e) {
    console.error("verifier/balances", e instanceof Error ? e.message : e);
    return fail("Couldn't read your balances right now.", 503);
  }
}
