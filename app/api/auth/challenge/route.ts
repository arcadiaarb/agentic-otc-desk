import { NextResponse } from "next/server";
import { AUTH_MESSAGE, AUTH_RECIPIENT, makeNonce } from "@/lib/session";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.json({ nonce: makeNonce(), message: AUTH_MESSAGE, recipient: AUTH_RECIPIENT });
  } catch (e) {
    console.error("challenge", e);
    return NextResponse.json({ error: "Sign-in isn't configured on the server." }, { status: 500 });
  }
}
