/**
 * Tacet settlement proof. TESTNET ONLY, no UI.
 * Two throwaway accounts trade peer to peer through Tidepool's testnet copy of the NEAR Intents verifier:
 * each signs one mirror `token_diff` intent, one `execute_intents` call settles both atomically.
 *
 *   npx tsx scripts/p2p-proof.ts setup      make 2 throwaway keys, show addresses to fund
 *   npx tsx scripts/p2p-proof.ts faucet     get free test tokens inside the verifier (accounts must be 24h+ old)
 *   npx tsx scripts/p2p-proof.ts deposit    move tokens a wallet holds (e.g. from a Tidepool swap) into the verifier
 *   npx tsx scripts/p2p-proof.ts balances   show both accounts' balances
 *   npx tsx scripts/p2p-proof.ts simulate   build + sign the trade and ask the verifier to simulate it (no changes)
 *   npx tsx scripts/p2p-proof.ts trade      do it for real, then check the balances moved exactly as expected
 *   npx tsx scripts/p2p-proof.ts selftest   offline check that signing works (no network)
 *   npx tsx scripts/p2p-proof.ts relayer    print a fresh gas-payer account for RELAYER_ACCOUNT_ID / RELAYER_PRIVATE_KEY (saves nothing)
 * Options: --amount 1 (wNEAR)  --price 3 (USDC per wNEAR)  --dry (trade: stop before submitting)
 * Keys live in .proof/keys.json (git-ignored). NEVER put a mainnet key here.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Account, KeyPair, KeyPairSigner, providers } from "near-api-js";
import { base58 } from "@scure/base";

const VERIFIER = "verifier.tidepool-sandbox.testnet";
const API = process.env.TIDEPOOL_URL ?? "https://www.usetidepool.tech";
const RPCS = process.env.NEAR_RPC_URL ? [process.env.NEAR_RPC_URL] : ["https://rpc.testnet.near.org", "https://rpc.testnet.fastnear.com"];
const WNEAR = { id: "nep141:wnear.tidepool-sandbox.testnet", contract: "wnear.tidepool-sandbox.testnet", decimals: 24, symbol: "wNEAR" };
const USDC = { id: "nep141:usdc.tidepool-sandbox.testnet", contract: "usdc.tidepool-sandbox.testnet", decimals: 6, symbol: "USDC" };
const KEYS = ".proof/keys.json";

type Acct = { accountId: string; secretKey: string };
type Keys = { seller: Acct; buyer: Acct };

const die = (m: string): never => { console.error(`\n✗ ${m}\n`); process.exit(1); };
const flag = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };

function parseUnits(s: string, decimals: number): bigint {
  const m = s.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m || (m[2] ?? "").length > decimals) return die(`"${s}" is not a valid amount (max ${decimals} decimals).`);
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt((m[2] ?? "").padEnd(decimals, "0") || "0");
}
function formatUnits(v: bigint, decimals: number): string {
  const neg = v < 0n, a = neg ? -v : v, base = 10n ** BigInt(decimals);
  const frac = (a % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / base}${frac ? "." + frac : ""}`;
}

async function rpc(method: string, params: unknown): Promise<any> {
  let last: unknown;
  for (const url of RPCS) {
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
  throw new Error(`RPC failed on all endpoints (${RPCS.join(", ")}): ${last instanceof Error ? last.message : last}. Set NEAR_RPC_URL to another testnet RPC.`);
}
async function view(contract: string, method: string, args: unknown): Promise<any> {
  const r = await rpc("query", { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
  if (r.error) throw new Error(r.error);
  return JSON.parse(Buffer.from(r.result).toString());
}
const nearBalance = async (id: string): Promise<bigint | null> => {
  try { return BigInt((await rpc("query", { request_type: "view_account", finality: "final", account_id: id })).amount); } catch { return null; }
};
// Inside the verifier's ledger: this is what trades use.
const tokenBalance = async (id: string, token: { id: string }) => BigInt(await view(VERIFIER, "mt_balance_of", { account_id: id, token_id: token.id }));
// Plain NEP-141 tokens held by the account itself (e.g. what a Tidepool swap or the faucet's "wallet" mode delivers). NOT usable for trades until deposited.
const walletBalance = async (id: string, token: { contract: string }) => BigInt(await view(token.contract, "ft_balance_of", { account_id: id }));

function loadKeys(): Keys {
  if (!existsSync(KEYS)) die("No keys yet. Run: npx tsx scripts/p2p-proof.ts setup");
  return JSON.parse(readFileSync(KEYS, "utf8"));
}
const signerOf = (a: Acct) => KeyPairSigner.fromSecretKey(a.secretKey as `ed25519:${string}`);
function newAcct(): Acct {
  const kp = KeyPair.fromRandom("ed25519");
  // Implicit account: the id IS the public key in hex, so the verifier already trusts that key.
  return { accountId: Buffer.from(kp.getPublicKey().data).toString("hex"), secretKey: kp.toString() };
}

// One NEP-413 signed intent in the shape the verifier's execute_intents expects.
async function signIntent(who: Acct, diff: Record<string, string>, salt: string, deadline: string) {
  const nonce = Buffer.concat([Buffer.from(salt, "hex"), randomBytes(28)]); // [4-byte contract salt][28 unique bytes]
  const message = JSON.stringify({ deadline, intents: [{ intent: "token_diff", diff }], signer_id: who.accountId });
  const s = await signerOf(who).signNep413Message(message, who.accountId, VERIFIER, nonce);
  return {
    standard: "nep413",
    payload: { recipient: VERIFIER, nonce: nonce.toString("base64"), message },
    public_key: s.publicKey.toString(),
    signature: "ed25519:" + base58.encode(s.signature),
  };
}

async function buildTrade(salt?: string) {
  const { seller, buyer } = loadKeys();
  const amount = parseUnits(flag("amount", "1"), WNEAR.decimals);
  const price = parseUnits(flag("price", "3"), USDC.decimals);
  const total = (amount * price) / 10n ** BigInt(WNEAR.decimals); // USDC base units
  if (total <= 0n) die("Amount x price rounds to zero. Use a bigger amount or price.");
  const s = salt ?? String(await view(VERIFIER, "current_salt", {}));
  if (!/^[0-9a-f]{8}$/.test(s)) die(`Unexpected salt from the verifier: ${s}`);
  const deadline = new Date(Date.now() + 10 * 60_000).toISOString();
  // Mirror intents: what the seller gives is exactly what the buyer gets. The batch must net to zero per token.
  const signed = [
    await signIntent(seller, { [WNEAR.id]: (-amount).toString(), [USDC.id]: total.toString() }, s, deadline),
    await signIntent(buyer, { [WNEAR.id]: amount.toString(), [USDC.id]: (-total).toString() }, s, deadline),
  ];
  return { seller, buyer, amount, total, signed };
}

async function snapshot(k: Keys) {
  return {
    sW: await tokenBalance(k.seller.accountId, WNEAR), sU: await tokenBalance(k.seller.accountId, USDC),
    bW: await tokenBalance(k.buyer.accountId, WNEAR), bU: await tokenBalance(k.buyer.accountId, USDC),
  };
}
const show = (s: Awaited<ReturnType<typeof snapshot>>) =>
  console.log(`  seller: ${formatUnits(s.sW, 24)} wNEAR, ${formatUnits(s.sU, 6)} USDC\n  buyer:  ${formatUnits(s.bW, 24)} wNEAR, ${formatUnits(s.bU, 6)} USDC`);

const cmds: Record<string, () => Promise<void>> = {
  async setup() {
    mkdirSync(".proof", { recursive: true });
    if (!existsSync(KEYS)) writeFileSync(KEYS, JSON.stringify({ seller: newAcct(), buyer: newAcct() }, null, 2));
    const k = loadKeys();
    console.log("\nThrowaway TESTNET accounts (keys saved in .proof/keys.json, never share or reuse them):");
    for (const [role, a] of Object.entries(k) as [string, Acct][]) {
      const bal = await nearBalance(a.accountId);
      console.log(`\n  ${role}: ${a.accountId}\n    on chain: ${bal === null ? "not yet (fund it)" : `yes, ${formatUnits(bal, 24)} NEAR`}`);
    }
    console.log("\nNext, for EACH address above:");
    console.log("  1. Get a little testnet NEAR (for gas) from the NEAR docs faucet: https://docs.near.org/getting-started/faucet (it accepts these long addresses).");
    console.log("  2. Get test tokens: either wait 24h and run `faucet`, or swap on https://app.usetidepool.tech with the address as the NEAR recipient");
    console.log("     (seller needs wNEAR, buyer needs USDC).");
    console.log("  3. Run `deposit` to move those tokens into the verifier, then `balances`.\n");
  },
  async faucet() {
    const k = loadKeys();
    for (const [role, a] of Object.entries(k) as [string, Acct][]) {
      const res = await fetch(`${API}/v0/faucet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: a.accountId, mode: "intents" }) });
      console.log(`\n${role}: HTTP ${res.status}\n${(await res.text()).slice(0, 600)}`);
    }
    console.log("\n403 account_too_new = wait longer. 429 = faucet limit (one claim per account per 7 days). A captcha error = use the faucet form on the Tidepool site instead.\n");
  },
  async balances() {
    const k = loadKeys();
    console.log("\nIn each account's wallet (plain tokens, NOT usable for trades until deposited):");
    for (const [role, a] of Object.entries(k) as [string, Acct][]) {
      const gas = await nearBalance(a.accountId);
      console.log(`  ${role}: ${formatUnits(await walletBalance(a.accountId, WNEAR), 24)} wNEAR, ${formatUnits(await walletBalance(a.accountId, USDC), 6)} USDC, ${gas === null ? "no NEAR (account not created yet)" : formatUnits(gas, 24) + " NEAR for gas"}`);
    }
    console.log("\nInside the verifier (what trades use):");
    show(await snapshot(k));
    console.log();
  },
  async deposit() {
    const k = loadKeys();
    for (const [role, a] of Object.entries(k) as [string, Acct][]) {
      const gas = await nearBalance(a.accountId);
      for (const t of [WNEAR, USDC]) {
        const bal = await walletBalance(a.accountId, t);
        if (bal === 0n) continue;
        if (gas === null || gas < 20_000_000_000_000_000_000_000n) { // 0.02 NEAR
          console.log(`\n${role}: holds ${formatUnits(bal, t.decimals)} ${t.symbol} but has no NEAR to pay gas. Get testnet NEAR for ${a.accountId} first, then run deposit again.`);
          continue;
        }
        console.log(`\n${role}: depositing ${formatUnits(bal, t.decimals)} ${t.symbol} into the verifier...`);
        const acct = new Account(a.accountId, new providers.JsonRpcProvider({ url: RPCS[0] }), signerOf(a));
        // NEP-141 deposit: ft_transfer_call to the verifier with an empty msg credits the sender. Needs exactly 1 yoctoNEAR.
        const out = await acct.callFunctionRaw({ contractId: t.contract, methodName: "ft_transfer_call", args: { receiver_id: VERIFIER, amount: bal.toString(), msg: "" }, gas: 100n * 10n ** 12n, deposit: 1n });
        console.log(`  tx: https://testnet.nearblocks.io/txns/${(out as any).transaction?.hash}`);
      }
    }
    console.log("\nDone. Run `balances` to confirm the funds now show inside the verifier.\n");
  },
  async simulate() {
    const t = await buildTrade();
    console.log("\nSigned intents built. Asking the verifier to simulate (nothing changes on chain)...");
    console.log(JSON.stringify(await view(VERIFIER, "simulate_intents", { signed: t.signed }), null, 2));
  },
  async trade() {
    const k = loadKeys(), t = await buildTrade();
    const before = await snapshot(k);
    console.log(`\nPlan: seller gives ${formatUnits(t.amount, 24)} wNEAR, buyer pays ${formatUnits(t.total, 6)} USDC (${flag("price", "3")} per wNEAR)\nBefore:`);
    show(before);
    if (before.sW < t.amount) die(`Seller only has ${formatUnits(before.sW, 24)} wNEAR. Lower --amount or run faucet.`);
    if (before.bU < t.total) die(`Buyer only has ${formatUnits(before.bU, 6)} USDC. Lower --amount/--price or run faucet.`);
    if (process.argv.includes("--dry")) return console.log("\n--dry: stopping before submit.\n");

    const submitter = flag("submitter", "seller") === "buyer" ? k.buyer : k.seller; // pays the (tiny) gas
    const acct = new Account(submitter.accountId, new providers.JsonRpcProvider({ url: RPCS[0] }), signerOf(submitter));
    console.log("\nSubmitting execute_intents with both signatures in ONE transaction...");
    const out = await acct.callFunctionRaw({ contractId: VERIFIER, methodName: "execute_intents", args: { signed: t.signed }, gas: 300n * 10n ** 12n, deposit: 0n });
    const hash = (out as any).transaction?.hash;
    console.log(`  tx: https://testnet.nearblocks.io/txns/${hash}\n  status: ${JSON.stringify((out as any).status).slice(0, 300)}`);

    await new Promise((r) => setTimeout(r, 5000));
    const after = await snapshot(k);
    console.log("\nAfter:"); show(after);
    const ok = after.sW === before.sW - t.amount && after.sU === before.sU + t.total && after.bW === before.bW + t.amount && after.bU === before.bU - t.total;
    console.log(ok ? "\n✓ PASS: both sides moved by exactly the agreed amounts, in one atomic transaction.\n" : "\n✗ Balances did not move exactly as planned. Check the tx link above (a fee or a failed receipt?).\n");
    if (!ok) process.exit(1);
  },
  async relayer() {
    const a = newAcct();
    console.log(`\nPut these in .env.local (the key is shown once and not saved anywhere):\n\nRELAYER_ACCOUNT_ID=${a.accountId}\nRELAYER_PRIVATE_KEY=${a.secretKey}\n`);
    console.log("Then send a little NEAR to that account ID so it exists and can pay gas (testnet: the docs faucet; mainnet: about 1 to 2 NEAR).");
    console.log("It only pays gas to submit trades. It can't move anyone's funds. Never put tokens in it.\n");
  },
  async selftest() {
    mkdirSync(".proof", { recursive: true });
    const a = newAcct(), b = newAcct();
    const s = await signIntent(a, { [WNEAR.id]: "-1", [USDC.id]: "3" }, "252812b3", new Date(Date.now() + 60_000).toISOString());
    const sig = base58.decode(s.signature.slice(8));
    const ok = sig.length === 64 && s.public_key.startsWith("ed25519:") && Buffer.from(s.payload.nonce, "base64").length === 32 && a.accountId.length === 64 && b.accountId !== a.accountId;
    console.log(JSON.stringify(s, null, 2));
    console.log(ok ? "\n✓ selftest OK: key creation and NEP-413 signing work (64-byte signature, 32-byte nonce).\n" : "\n✗ selftest failed\n");
    if (!ok) process.exit(1);
  },
};

const cmd = process.argv[2];
if (!cmd || !cmds[cmd]) die(`Usage: npx tsx scripts/p2p-proof.ts <${Object.keys(cmds).join("|")}> [--dry] [--amount 1] [--price 3]`);
cmds[cmd]().catch((e) => die(e instanceof Error ? e.message : String(e)));
