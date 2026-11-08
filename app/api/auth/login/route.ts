import { NextResponse } from "next/server";
import { verify } from "near-sign-verify";
import { AUTH_MESSAGE, AUTH_RECIPIENT, checkNonce, cookieHeader, makeSession } from "@/lib/session";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { authToken } = await req.json();
    if (typeof authToken !== "string" || authToken.length > 4000) return fail("Invalid request.");
    // Checks the NEP-413 signature, that the key belongs to the account, our nonce, and the exact message.
    const r = await verify(authToken, { expectedRecipient: AUTH_RECIPIENT, expectedMessage: AUTH_MESSAGE, validateNonce: checkNonce });
    const res = NextResponse.json({ accountId: r.accountId });
    res.headers.append("Set-Cookie", cookieHeader(makeSession(r.accountId)));
    return res;
  } catch (e) {
    console.error("login", e);
    return fail("Sign-in failed. Try again.", 401);
  }
}
