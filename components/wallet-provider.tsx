"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WalletSelector, WalletSelectorState } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";

type Challenge = { nonce: string; message: string; recipient: string; at: number };
type WalletCtx = {
  accountId: string | null;      // wallet connected (not yet proven)
  signedIn: boolean;             // wallet connected AND signature verified by the server
  checking: boolean;             // wallet / session still loading
  ready: boolean;
  signingIn: boolean;
  authError: string;
  connect: () => void;
  disconnect: () => Promise<void>;
  signIn: () => Promise<boolean>;
};
const Ctx = createContext<WalletCtx>({
  accountId: null, signedIn: false, checking: true, ready: false, signingIn: false, authError: "",
  connect: () => {}, disconnect: async () => {}, signIn: async () => false,
});
export const useWallet = () => useContext(Ctx);

export function WalletProvider({ children }: { children: ReactNode }) {
  const selector = useRef<WalletSelector | null>(null);
  const modal = useRef<WalletSelectorModal | null>(null);
  const challenge = useRef<Challenge | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [session, setSession] = useState<string | null | undefined>(undefined); // undefined = not checked yet
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      const [{ setupWalletSelector }, { setupModal }, { setupMyNearWallet }, { setupMeteorWallet }, { setupHereWallet }] =
        await Promise.all([
          import("@near-wallet-selector/core"),
          import("@near-wallet-selector/modal-ui"),
          import("@near-wallet-selector/my-near-wallet"),
          import("@near-wallet-selector/meteor-wallet"),
          import("@near-wallet-selector/here-wallet"),
        ]);
      // Mainnet: NEAR Intents has no testnet.
      const s = await setupWalletSelector({ network: "mainnet", modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()] });
      if (cancelled) return;
      selector.current = s;
      modal.current = setupModal(s, { contractId: "", theme: "dark" });
      const sync = (state: WalletSelectorState) => setAccountId(state.accounts.find((a) => a.active)?.accountId ?? null);
      sync(s.store.getState());
      const sub = s.store.observable.subscribe(sync);
      unsub = () => sub.unsubscribe();
      setReady(true);
    })();
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((d) => setSession(d.accountId ?? null)).catch(() => setSession(null));
    return () => { cancelled = true; unsub?.(); };
  }, []);

  // Fetch the sign-in challenge ahead of time so the wallet popup opens straight from the click.
  const fetchChallenge = useCallback(async (): Promise<Challenge> => {
    if (challenge.current && Date.now() - challenge.current.at < 240_000) return challenge.current;
    const r = await fetch("/api/auth/challenge", { cache: "no-store" });
    if (!r.ok) throw new Error("Sign-in isn't available right now.");
    return (challenge.current = { ...(await r.json()), at: Date.now() });
  }, []);
  useEffect(() => { if (accountId && session !== accountId) fetchChallenge().catch(() => {}); }, [accountId, session, fetchChallenge]);

  const signIn = useCallback(async () => {
    if (!selector.current) return false;
    setSigningIn(true); setAuthError("");
    try {
      const c = await fetchChallenge();
      challenge.current = null; // single use
      const wallet = await selector.current.wallet();
      if (!wallet.signMessage) throw new Error("This wallet can't sign messages. Try MyNearWallet or Meteor.");
      // wallet-selector checks the nonce with the global Buffer.isBuffer, so it must be a real Buffer.
      const { Buffer: BufferShim } = await import("buffer");
      const g = globalThis as unknown as { Buffer?: typeof BufferShim };
      g.Buffer ??= BufferShim;
      const nonce = g.Buffer.from(c.nonce, "hex");
      const { sign } = await import("near-sign-verify");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authToken = await sign(c.message, { signer: wallet as any, recipient: c.recipient, nonce });
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authToken }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed. Try again.");
      setSession(data.accountId);
      return true;
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Sign-in failed. Try again.");
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [fetchChallenge]);

  const connect = useCallback(() => modal.current?.show(), []);
  const disconnect = useCallback(async () => {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSession(null);
    if (!selector.current) return;
    const wallet = await selector.current.wallet();
    await wallet.signOut();
  }, []);

  const value = useMemo<WalletCtx>(() => ({
    accountId, signedIn: !!accountId && session === accountId, checking: !ready || session === undefined,
    ready, signingIn, authError, connect, disconnect, signIn,
  }), [accountId, session, ready, signingIn, authError, connect, disconnect, signIn]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
