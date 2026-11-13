// Server-only. NEAR RPC reads, NEP-413 signature checks and the relayer that submits settlements.
import { createHash, randomBytes } from "node:crypto";
import { Account, KeyPairSigner, providers } from "near-api-js";
import { PublicKey } from "@near-js/crypto";
import { base58, base64 } from "@scure/base";
import { NET } from "./network";

export async function rpc(method: string, params: unknown): Promise<any> {
  let last: unknown;
  for (const url of NET.rpcs) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctrl.signal });
      clearTimeout(t);
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j.result;
    } catch (e) { last = e; }
  }
  throw new Error(`NEAR RPC unreachable: ${last instanceof Error ? last.message : last}`);
}
export async function view(contract: string, method: string, args: unknown): Promise<any> {
  const r = await rpc("query", { request_type: "call_function", finality: "optimistic", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
  if (r.error) throw new Error(String(r.error));
  return JSON.parse(Buffer.from(r.result).toString());
}

export const verifierBalance = async (account: string, assetId: string) => BigInt(await view(NET.verifier, "mt_balance_of", { account_id: account, token_id: assetId }));
export const walletBalance = async (account: string, contract: string) => BigInt(await view(contract, "ft_balance_of", { account_id: account }));
// Bridged tokens may have no NEP-141 contract to ask: that must never break a funds check, it just means "0 in the wallet".
export const walletBalanceSafe = (account: string, contract: string) => walletBalance(account, contract).catch(() => 0n);
// NEP-145: has this account ever registered with the token contract? A token contract refuses to send to an unregistered account.
export async function storageRegistered(account: string, contract: string): Promise<boolean | null> {
  try { return (await view(contract, "storage_balance_of", { account_id: account })) !== null; } catch { return null; }
}
export async function nativeBalance(account: string): Promise<bigint> {
  try { return BigInt((await rpc("query", { request_type: "view_account", finality: "optimistic", account_id: account })).amount); } catch { return 0n; }
}
export const isImplicit = (id: string) => /^[0-9a-f]{64}$/.test(id);

// Keys the verifier knows for an account. null = couldn't tell (method name differs between verifier versions).
export async function accountKeys(account: string): Promise<string[] | null> {
  for (const method of ["public_keys_of", "get_account_public_keys"]) {
    try { const r = await view(NET.verifier, method, { account_id: account }); if (Array.isArray(r)) return r.map(String); } catch { /* try the next name */ }
  }
  return null;
}
// Is THIS exact key registered for the account? registered=null means the verifier couldn't answer.
export async function keyStatus(account: string, publicKey: string): Promise<{ registered: boolean | null; via: string }> {
  if (isImplicit(account) && Buffer.from(PublicKey.fromString(publicKey).data).toString("hex") === account) return { registered: true, via: "implicit" }; // trusted by default
  try {
    const r = await view(NET.verifier, "has_public_key", { account_id: account, public_key: publicKey });
    if (typeof r === "boolean") return { registered: r, via: "has_public_key" };
  } catch (e) { console.warn("[verifier] has_public_key failed:", e instanceof Error ? e.message.slice(0, 160) : e); }
  const keys = await accountKeys(account);
  if (keys === null) console.warn("[verifier] could not look up keys for", account);
  return keys === null ? { registered: null, via: "none" } : { registered: keys.includes(publicKey), via: "public_keys_of" };
}
export const keyRegistered = async (account: string, publicKey: string) => (await keyStatus(account, publicKey)).registered;

// NEP-413: sha256( u32(2^31+413) | borsh{ message, nonce[32], recipient, callbackUrl: None } )
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const str = (s: string) => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32(b.length), b]); };
export const nep413Hash = (message: string, nonce: Buffer, recipient: string) =>
  createHash("sha256").update(Buffer.concat([u32(2147484061), str(message), nonce, str(recipient), Buffer.from([0])])).digest();

export function sigBytes(signature: string): Buffer {
  return signature.startsWith("ed25519:") ? Buffer.from(base58.decode(signature.slice(8))) : Buffer.from(base64.decode(signature));
}
export function verifySignature(message: string, nonceB64: string, recipient: string, publicKey: string, signature: string): boolean {
  try {
    const nonce = Buffer.from(nonceB64, "base64"), sig = sigBytes(signature);
    if (nonce.length !== 32 || sig.length !== 64 || !publicKey.startsWith("ed25519:")) return false;
    return PublicKey.fromString(publicKey).verify(nep413Hash(message, nonce, recipient), sig);
  } catch { return false; }
}

// Verifier nonce = [4-byte contract salt][28 random bytes].
export async function newNonce(): Promise<Buffer> {
  const salt = String(await view(NET.verifier, "current_salt", {}));
  if (!/^[0-9a-f]{8}$/.test(salt)) throw new Error(`Unexpected salt from the verifier: ${salt}`);
  return Buffer.concat([Buffer.from(salt, "hex"), randomBytes(28)]);
}

export const simulate = (signed: unknown[]) => view(NET.verifier, "simulate_intents", { signed });

export class RelayerMissing extends Error {}
export async function execute(signed: unknown[]): Promise<string> {
  const id = process.env.RELAYER_ACCOUNT_ID, key = process.env.RELAYER_PRIVATE_KEY;
  if (!id || !key) throw new RelayerMissing("The settlement relayer isn't configured on the server.");
  const acct = new Account(id, new providers.JsonRpcProvider({ url: NET.rpcs[0] }), KeyPairSigner.fromSecretKey(key as `ed25519:${string}`));
  const out: any = await acct.callFunctionRaw({ contractId: NET.verifier, methodName: "execute_intents", args: { signed }, gas: 300n * 10n ** 12n, deposit: 0n });
  if (out.status?.Failure) throw new Error(JSON.stringify(out.status.Failure).slice(0, 300));
  return out.transaction?.hash as string;
}
