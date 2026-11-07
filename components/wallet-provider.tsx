"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WalletSelector, WalletSelectorState } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";

type WalletCtx = { accountId: string | null; ready: boolean; connect: () => void; disconnect: () => Promise<void> };
const Ctx = createContext<WalletCtx>({ accountId: null, ready: false, connect: () => {}, disconnect: async () => {} });
export const useWallet = () => useContext(Ctx);

export function WalletProvider({ children }: { children: ReactNode }) {
  const selector = useRef<WalletSelector | null>(null);
  const modal = useRef<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
      // Mainnet: NEAR Intents has no testnet. Sign-in only, no transactions in Phase 1.
      const s = await setupWalletSelector({
        network: "mainnet",
        modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()],
      });
      if (cancelled) return;
      selector.current = s;
      modal.current = setupModal(s, { contractId: "", theme: "dark" });
      const sync = (state: WalletSelectorState) =>
        setAccountId(state.accounts.find((a) => a.active)?.accountId ?? null);
      sync(s.store.getState());
      const sub = s.store.observable.subscribe(sync);
      unsub = () => sub.unsubscribe();
      setReady(true);
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const connect = useCallback(() => modal.current?.show(), []);
  const disconnect = useCallback(async () => {
    if (!selector.current) return;
    const wallet = await selector.current.wallet();
    await wallet.signOut();
  }, []);

  const value = useMemo(() => ({ accountId, ready, connect, disconnect }), [accountId, ready, connect, disconnect]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
