// Server-only helpers. Only import from app/api routes.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type PrivateDetails = { amount: string; price: string; note: string; salt: string };

function key(): Buffer {
  const k = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export const newSalt = () => randomBytes(16).toString("hex");

// "v1:" prefix leaves room for key rotation later.
export function encryptPrivate(d: PrivateDetails): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(d), "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptPrivate(blob: string): PrivateDetails {
  if (!blob.startsWith("v1:")) throw new Error("Unknown payload version");
  const raw = Buffer.from(blob.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
}

// sha256 over a JSON array so field boundaries can't be confused. The salt stays private.
export function commit(intentId: string, pair: string, d: PrivateDetails): string {
  return createHash("sha256").update(JSON.stringify([d.salt, intentId, pair, d.amount, d.price, d.note])).digest("hex");
}
