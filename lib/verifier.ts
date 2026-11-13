// Server-only "control room" for the verifier: everything about an account's balances in one place.
// Pages and routes read from here instead of each talking to the chain on their own.
import { NET, NETWORK } from "./network";
import { formatUnits } from "./units";
import { nativeBalance, verifierBalance, walletBalanceSafe } from "./chain";

export async function overview(account: string) {
  const all = Object.values(NET.tokens);
  const real = all.filter((a) => !a.native); // native NEAR is the same verifier asset as wNEAR
  const tokens = await Promise.all(real.map(async (a) => {
    const [inV, inW] = await Promise.all([
      verifierBalance(account, a.id).catch(() => 0n),
      a.walletTransfers === false ? Promise.resolve(0n) : walletBalanceSafe(account, a.contract),
    ]);
    return {
      symbol: a.symbol, id: a.id, contract: a.contract, decimals: a.decimals, walletTransfers: a.walletTransfers !== false,
      inVerifier: formatUnits(inV, a.decimals), inVerifierUnits: inV.toString(), inWallet: formatUnits(inW, a.decimals), inWalletUnits: inW.toString(),
    };
  }));
  const nat = all.find((a) => a.native);
  const near = nat?.wrapContract ? await nativeBalance(account) : null;
  return {
    network: NETWORK, verifier: NET.verifier, tokens,
    native: nat && near !== null ? { symbol: "NEAR", wrapContract: nat.wrapContract!, decimals: nat.decimals, balance: formatUnits(near, nat.decimals), balanceUnits: near.toString() } : null,
  };
}
