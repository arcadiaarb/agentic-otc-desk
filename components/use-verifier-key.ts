"use client";

import { useCallback, useEffect, useState } from "react";
import { actionCreators } from "@near-js/transactions";
import { useWallet } from "./wallet-provider";
import { NET, txUrl } from "@/lib/network";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const storeKey = (account: string) => `tacet-signkey:${NET.verifier}:${account}`;

// Which key must be registered? NOT the one the wallet lists for the account: wallets can sign messages with a different key.
// So we learn the real signing key from an actual signature (one free popup), remember it, and register exactly that one.
export function useVerifierKey() {
  const { accountId, getWallet, signedIn } = useWallet();
  const [signKey, setSignKey] = useState("");
  const [registered, setRegistered] = useState<boolean | null | undefined>(undefined); // undefined = unknown yet, null = verifier couldn't answer
  const [busy, setBusy] = useState<"" | "check" | "register">("");
  const [error, setError] = useState("");
  const [tx, setTx] = useState("");

  useEffect(() => {
    if (!accountId) return;
    try { setSignKey(localStorage.getItem(storeKey(accountId)) ?? ""); } catch { /* storage blocked */ }
  }, [accountId]);

  const remember = useCallback((pk: string) => {
    setSignKey(pk);
    try { if (accountId) localStorage.setItem(storeKey(accountId), pk); } catch { /* storage blocked */ }
  }, [accountId]);

  const checkWith = useCallback(async (pk: string): Promise<boolean | null> => {
    const res = await fetch(`/api/verifier/key?pk=${encodeURIComponent(pk)}`, { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? "Couldn't check your key.");
    setRegistered(d.registered);
    return d.registered;
  }, []);

  const check = useCallback(async (pkOverride?: string): Promise<boolean | null> => {
    const pk = pkOverride ?? signKey;
    if (!pk) return null;
    setBusy("check"); setError("");
    try { return await checkWith(pk); }
    catch (e) { setRegistered(null); setError(e instanceof Error ? e.message : "Couldn't check your key."); return null; }
    finally { setBusy(""); }
  }, [signKey, checkWith]);

  useEffect(() => { if (signedIn && signKey) void check(); }, [signedIn, signKey, check]);

  const identify = useCallback(async (): Promise<string> => {
    const w = await getWallet();
    if (!w?.signMessage) throw new Error("This wallet can't sign messages. Try MyNearWallet or Meteor.");
    const { Buffer: Shim } = await import("buffer"); // wallets expect a real Buffer for the nonce
    const g = globalThis as unknown as { Buffer?: typeof Shim };
    g.Buffer ??= Shim;
    const r = await w.signMessage({
      message: "Tacet: identify which key this wallet signs with. No funds are involved.",
      recipient: "tacet.app", nonce: g.Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
    });
    if (!r?.publicKey) throw new Error("Your wallet didn't return a key. Try again.");
    remember(r.publicKey);
    return r.publicKey;
  }, [getWallet, remember]);

  // Identify (if needed), skip everything if the key is already registered, otherwise register it and wait for the verifier to show it.
  const register = useCallback(async (pkOverride?: string) => {
    setBusy("register"); setError(""); setTx("");
    try {
      const key = pkOverride ?? signKey ?? "";
      const pk = key || (await identify());
      if ((await checkWith(pk)) === true) return;
      const w = await getWallet();
      if (!w) throw new Error("Connect your wallet first.");
      let already = false;
      try {
        const out = (await w.signAndSendTransaction({
          signerId: accountId ?? undefined, receiverId: NET.verifier,
          actions: [actionCreators.functionCall("add_public_key", { public_key: pk }, 100n * 10n ** 12n, 1n)],
        })) as { transaction?: { hash?: string }; status?: { Failure?: unknown } } | void;
        if (out?.transaction?.hash) setTx(txUrl(out.transaction.hash));
        if (out?.status?.Failure) {
          const msg = JSON.stringify(out.status.Failure);
          if (/already/i.test(msg)) already = true; else throw new Error(`The verifier rejected the registration: ${msg.slice(0, 160)}`);
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (/already/i.test(m)) already = true; else throw e; // "already exists" means an earlier attempt worked
      }
      for (let i = 0; i < 10; i++) { if ((await checkWith(pk)) === true) return; await wait(2000); }
      if (!already) setError("The registration was sent, but the verifier doesn't show your key yet. Press Check again in a few seconds.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy("");
    }
  }, [signKey, identify, checkWith, getWallet, accountId]);

  return { registered, signKey, needsProbe: signedIn && !signKey, busy, error, tx, check, register, remember };
}
