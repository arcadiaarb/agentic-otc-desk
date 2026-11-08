import { NextResponse } from "next/server";
import { cookieHeader } from "@/lib/session";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", cookieHeader("", 0));
  return res;
}
