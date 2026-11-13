// One setting switches everything: NEXT_PUBLIC_NEAR_NETWORK=testnet (default) or mainnet. Safe on client and server.
export type Asset = {
  id: string; contract: string; decimals: number; symbol: string;
  walletTransfers?: boolean; // false = bridged token that can't be moved by a NEAR wallet (balance only)
  native?: boolean;          // native NEAR: wrapped into wNEAR (1:1) before it enters the verifier
  wrapContract?: string;     // the contract whose near_deposit wraps native NEAR
};

export const NETWORK: "testnet" | "mainnet" = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

// Testnet: Tidepool's sandbox copy of the NEAR Intents verifier (token ids from its /v0/tokens).
const T = (symbol: string, contract: string, decimals: number): Asset => ({ id: `nep141:${contract}`, contract, decimals, symbol });
const TESTNET = {
  verifier: "verifier.tidepool-sandbox.testnet",
  explorer: "https://testnet.nearblocks.io",
  rpcs: ["https://rpc.testnet.near.org", "https://rpc.testnet.fastnear.com"],
  tokens: {
    wNEAR: T("wNEAR", "wnear.tidepool-sandbox.testnet", 24),
    // Legacy pair name "NEAR / ..." from earlier listings: same asset as wNEAR. (Wrapping native NEAR isn't supported by the testnet sandbox.)
    NEAR: T("wNEAR", "wnear.tidepool-sandbox.testnet", 24),
    ETH: T("ETH", "eth.tidepool-sandbox.testnet", 18),
    wBTC: T("wBTC", "wbtc.tidepool-sandbox.testnet", 8),
    SOL: { ...T("SOL", "sol.tp-omft.testnet", 9), walletTransfers: false },
    USDC: T("USDC", "usdc.tidepool-sandbox.testnet", 6),
    USDT: T("USDT", "usdt.tidepool-sandbox.testnet", 6),
  } as Record<string, Asset>,
};
// Mainnet token ids are deliberately NOT filled in until each one is verified against NEAR's docs.
const MAINNET = {
  verifier: "intents.near",
  explorer: "https://nearblocks.io",
  rpcs: ["https://rpc.mainnet.near.org"],
  tokens: {} as Record<string, Asset>,
};

export const NET = NETWORK === "mainnet" ? MAINNET : TESTNET;
export const assetFor = (symbol: string): Asset | null => NET.tokens[symbol] ?? null;
export const txUrl = (hash: string) => `${NET.explorer}/txns/${hash}`;
