// lib/network.ts
// One setting switches everything: NEXT_PUBLIC_NEAR_NETWORK=testnet (default) or mainnet.
// Safe on client and server.
//
// NOTE: NEAR Intents mainnet tokens are dynamic and should ideally come from the
// live 1-Click registry at https://1click.chaindefuser.com/v0/tokens.
// The values below are a reasonable static fallback for common NEAR assets.
// Always prefer the live catalog when possible.
export type Asset = {
  id: string;
  contract: string;
  decimals: number;
  symbol: string;
  walletTransfers?: boolean; // false = bridged token that can't be moved by a NEAR wallet (balance only)
  native?: boolean;          // native NEAR: wrapped into wNEAR (1:1) before it enters the verifier
  wrapContract?: string;     // the contract whose near_deposit wraps native NEAR
};

export const NETWORK: "testnet" | "mainnet" =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

// Common helper
const T = (symbol: string, contract: string, decimals: number): Asset => ({
  id: `nep141:${contract}`,
  contract,
  decimals,
  symbol,
});

const TESTNET = {
  verifier: "verifier.tidepool-sandbox.testnet",
  explorer: "https://testnet.nearblocks.io",
  rpcs: ["https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"],
  tokens: {
    wNEAR: T("wNEAR", "wnear.tidepool-sandbox.testnet", 24),
    NEAR: T("wNEAR", "wnear.tidepool-sandbox.testnet", 24), // legacy pair name
    ETH: T("ETH", "eth.tidepool-sandbox.testnet", 18),
    wBTC: T("wBTC", "wbtc.tidepool-sandbox.testnet", 8),
    SOL: { ...T("SOL", "sol.tp-omft.testnet", 9), walletTransfers: false },
    USDC: T("USDC", "usdc.tidepool-sandbox.testnet", 6),
    USDT: T("USDT", "usdt.tidepool-sandbox.testnet", 6),
  } as Record<string, Asset>,
};

// Mainnet: the canonical verifier is intents.near.
// The asset registry is dynamic; the values below are a curated set commonly used
// in NEAR Intents + 1Click flows. Prefer /v0/tokens when you need the live list.
const MAINNET = {
  verifier: "intents.near",
  explorer: "https://nearblocks.io",
  rpcs: ["https://rpc.mainnet.near.org"],
  tokens: {
    NEAR: T("NEAR", "wrap.near", 24),
    wNEAR: T("wNEAR", "wrap.near", 24),
    USDC: T("USDC", "usdc.near", 6),
    USDT: T("USDT", "usdt.tether-token.near", 6),
    ETH: T("ETH", "eth.bridge.near", 18),
    wBTC: T("wBTC", "btc.omft.near", 8),
    BTC: T("BTC", "btc.omft.near", 8),
    SOL: T("SOL", "sol.omft.near", 9),
  } as Record<string, Asset>,
};

export const NET = NETWORK === "mainnet" ? MAINNET : TESTNET;
export const assetFor = (symbol: string): Asset | null => NET.tokens[symbol] ?? null;
export const txUrl = (hash: string) => `${NET.explorer}/txns/${hash}`;