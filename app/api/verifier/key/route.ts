import { NextResponse } from "next/server";
import { fail, sessionAccount } from "@/lib/api";
import { isImplicit, keyStatus } from "@/lib/chain";
import { NET } from "@/lib/network";

export const dynamic = "force-dynamic";

// Is this exact wallet key registered with the verifier for the signed-in account?
export async function GET(req: Request) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  const pk = new URL(req.url).searchParams.get("pk") ?? "";
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,60}$/.test(pk)) return fail("Invalid key.");
  try {
    const s = await keyStatus(me, pk);
    return NextResponse.json({ registered: s.registered, via: s.via, implicit: isImplicit(me), account: me, verifier: NET.verifier });
  } catch (e) {
    console.error("verifier/key", e instanceof Error ? e.message : e);
    return fail("Couldn't check your key right now.", 503);
  }
}
