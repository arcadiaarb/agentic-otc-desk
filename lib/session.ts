// Server-only. Stateless wallet-login: signed challenge nonce in, signed session cookie out.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tacet_session";
export const AUTH_MESSAGE = "Sign in to Tacet";
export const AUTH_RECIPIENT = "tacet.app";
const SESSION_S = 7 * 24 * 3600;
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;

function secret(): Buffer {
  const s = Buffer.from(process.env.SESSION_SECRET ?? "", "base64");
  if (s.length < 32) throw new Error("SESSION_SECRET must be 32+ bytes, base64-encoded");
  return s;
}
const mac = (data: string) => createHmac("sha256", secret()).update(data).digest();

// 32-byte nonce = 8-byte timestamp + 24 bytes of HMAC(timestamp). No storage needed.
export function makeNonce(): string {
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Date.now()));
  return Buffer.concat([ts, mac("nonce:" + ts.toString("hex")).subarray(0, 24)]).toString("hex");
}
export function checkNonce(n: Uint8Array): boolean {
  if (n.length !== 32) return false;
  const b = Buffer.from(n);
  const want = mac("nonce:" + b.subarray(0, 8).toString("hex")).subarray(0, 24);
  if (!timingSafeEqual(want, b.subarray(8))) return false;
  const age = Date.now() - Number(b.readBigUInt64BE(0));
  return age >= 0 && age <= NONCE_MAX_AGE_MS;
}

export function makeSession(account: string): string {
  const body = Buffer.from(`${account}|${Date.now() + SESSION_S * 1000}`).toString("base64url");
  return `${body}.${mac("session:" + body).toString("base64url")}`;
}
export function readSession(req: Request): string | null {
  const raw = req.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  const [body, sig] = raw?.split(".") ?? [];
  if (!body || !sig) return null;
  const want = mac("session:" + body), got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const [account, exp] = Buffer.from(body, "base64url").toString().split("|");
  return Number(exp) > Date.now() ? account : null;
}
export const cookieHeader = (value: string, maxAge = SESSION_S) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
