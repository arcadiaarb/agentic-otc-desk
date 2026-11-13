// Server-only "control room" for the verifier: everything about an account's balances in one place.
// Pages and routes read from here instead of each talking to the chain on their own.
import { NET, NETWORK } from "./network";
import { formatUnits } from "./units";
import { storageRegistered, verifierBalance, walletBalanceSafe } from "./chain";

export async function overview(account: string) {
  const unique = [...new Map(Object.values(NET.tokens).map((a) => [a.id, a])).values()]; // aliases share one asset
  const tokens = await Promise.all(unique.map(async (a) => {
    const transfers = a.walletTransfers !== false;
    const [inV, inW, registered] = await Promise.all([
      verifierBalance(account, a.id).catch(() => 0n),
      transfers ? walletBalanceSafe(account, a.contract) : Promise.resolve(0n),
      transfers ? storageRegistered(account, a.contract) : Promise.resolve(null),
    ]);
    return {
      symbol: a.symbol, id: a.id, contract: a.contract, decimals: a.decimals, walletTransfers: transfers, registered,
      inVerifier: formatUnits(inV, a.decimals), inVerifierUnits: inV.toString(), inWallet: formatUnits(inW, a.decimals), inWalletUnits: inW.toString(),
    };
  }));
  return { network: NETWORK, verifier: NET.verifier, tokens };
}
