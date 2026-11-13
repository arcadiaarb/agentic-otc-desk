// Server-only. Does an account hold the pair's base token INSIDE the verifier (the only place trades can use)?
import { NET, NETWORK, assetFor } from "./network";
import { formatUnits, parseUnits } from "./units";
import { verifierBalance, walletBalanceSafe } from "./chain";
import { SettleError } from "./settlement";

export async function sellerFunds(account: string, pair: string, amount: string) {
  const symbol = pair.split(" / ")[0], asset = assetFor(symbol);
  if (!asset) throw new SettleError(`Settlement isn't set up for ${symbol} on ${NETWORK} yet.`, 501);
  const need = parseUnits(amount, asset.decimals);
  const [inV, inW] = await Promise.all([verifierBalance(account, asset.id), asset.walletTransfers === false ? Promise.resolve(0n) : walletBalanceSafe(account, asset.contract)]);
  const missing = need > inV ? need - inV : 0n;
  const f = (v: bigint) => formatUnits(v, asset.decimals);
  return {
    network: NETWORK, verifier: NET.verifier, symbol: asset.symbol, contract: asset.contract, walletTransfers: asset.walletTransfers !== false,
    need: f(need), inVerifier: f(inV), inWallet: f(inW), enough: missing === 0n,
    depositUnits: (missing > 0n ? (missing < inW ? missing : inW) : 0n).toString(), // what the wallet can top up right now
  };
}
