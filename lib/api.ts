import { NextResponse } from "next/server";
import { readSession } from "./session";

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// The wallet account proven by the signed-in session cookie, or null.
export function sessionAccount(req: Request): string | null {
  try { return readSession(req); } catch (e) { console.error(e); return null; }
}

// Positive decimal string, or null.
export const num = (v: unknown) =>
  typeof v === "string" && v.length <= 32 && Number(v) > 0 && Number.isFinite(Number(v)) ? v.trim() : null;
