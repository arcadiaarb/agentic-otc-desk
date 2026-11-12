"use client";

import { useCallback, useEffect, useState } from "react";
import { actionCreators } from "@near-js/transactions";
import { useWallet } from "./wallet-provider";
import { NET, txUrl } from "@/lib/network";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Checks (and registers) the wallet's key with the verifier. Named accounts need this once before their signature counts.
export function useVerifierKey() {
  const { accountId, getWallet, signedIn } = useWallet();
  const [registered, setRegistered] = useState<boolean | null | undefined>(undefined); // undefined = not checked yet, null = couldn't tell
  const [pk, setPk] = useState("");
  const [busy, setBusy] = useState<"" | "check" | "register">("");
  const [error, setError] = useState("");
  const [tx, setTx] = useState("");

  const walletKey = useCallback(async () => {
    const w = await getWallet();
    const k = w ? (await w.getAccounts()).find((a) => a.accountId === accountId)?.publicKey : undefined;
    return { w, k };
  }, [getWallet, accountId]);

  const check = useCallback(async (keyOverride?: string): Promise<boolean | null> => {
    setBusy("check"); setError("");
    try {
      const key = keyOverride ?? (await walletKey()).k;
      if (!key) { setRegistered(null); setError("Your wallet didn't share its public key."); return null; }
      setPk(key);
      const res = await fetch(`/api/verifier/key?pk=${encodeURIComponent(key)}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't check your key.");
      setRegistered(d.registered);
      return d.registered;
    } catch (e) {
      setRegistered(null); setError(e instanceof Error ? e.message : "Couldn't check your key.");
      return null;
    } finally {
      setBusy("");
    }
  }, [walletKey]);

  useEffect(() => { if (signedIn) void check(); }, [signedIn, check]);

  const register = useCallback(async (keyOverride?: string) => {
    setBusy("register"); setError(""); setTx("");
    let key = keyOverride ?? "";
    try {
      const { w, k } = await walletKey();
      key = keyOverride ?? k ?? "";
      if (!w || !key) throw new Error("Connect your wallet first (and make sure it shares its public key).");
      let already = false;
      try {
        const out = (await w.signAndSendTransaction({
          signerId: accountId ?? undefined, receiverId: NET.verifier,
          actions: [actionCreators.functionCall("add_public_key", { public_key: key }, 100n * 10n ** 12n, 1n)],
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
      // Give the network a moment to show it, then confirm with the verifier.
      for (let i = 0; i < 10; i++) { if ((await check(key)) === true) return; await wait(2000); }
      if (!already) setError("The registration was sent, but the verifier doesn't show your key yet. Press Check again in a few seconds.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy("");
    }
  }, [walletKey, accountId, check]);

  return { registered, pk, busy, error, tx, check, register };
}
