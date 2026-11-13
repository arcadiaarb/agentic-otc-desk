// Server-only. Listing Agent: deterministic rules first, AI only when the rules understand nothing.
// The AI never writes replies, it only extracts fields. Everything it returns is validated here.
import cfg from "./pairs.json";
import { askAgent } from "./ai";
import { EXPIRIES, PAIRS } from "./intents";
import { deviation, fmtPrice, spotLabel } from "./spot";

export type Fields = { pair?: string; amount?: string; price?: string; expiry?: string; note?: string; noteDone?: boolean };
export const BASES = Array.from(new Set(cfg.pairs.map((p) => p.pair.split(" / ")[0])));

const ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries({ ...Object.fromEntries(BASES.map((b) => [b.toLowerCase(), b])), ethereum: "ETH", bitcoin: "wBTC", btc: "wBTC", solana: "SOL", near: "wNEAR" })
    .filter(([, v]) => BASES.includes(v)),
);
const ALIAS_RE = Object.keys(ALIAS).join("|");
const fmtN = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 8 }).format(n);

type Stage = "pair" | "amount" | "price" | "expiry" | "note" | "done";
export const stage = (f: Fields): Stage =>
  !f.pair ? "pair" : !f.amount ? "amount" : !f.price ? "price" : !f.expiry ? "expiry" : !f.noteDone ? "note" : "done";

function val(raw: string, suffix?: string): number | null {
  let n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const s = (suffix ?? "").toLowerCase();
  if (s === "k" || s === "thousand") n *= 1e3;
  if (s === "m" || s === "million") n *= 1e6;
  return n > 0 ? n : null;
}

function extract(msg: string, f: Fields): { next: Fields; changed: Set<string> } {
  const text = msg.toLowerCase();
  const next: Fields = { ...f };
  const changed = new Set<string>();
  const set = <K extends keyof Fields>(k: K, v: Fields[K], label: string) => { if (v !== undefined && next[k] !== v) { next[k] = v; changed.add(label); } };

  // token (+ quote asset)
  const base = Object.keys(ALIAS).find((a) => new RegExp(`\\b${a}\\b`).test(text));
  if (base) {
    const b = ALIAS[base];
    const q = /\busdt\b/.test(text) ? "USDT" : /\busdc\b/.test(text) ? "USDC" : f.pair?.split(" / ")[1] ?? "USDC";
    const cand = `${b} / ${q}`;
    set("pair", PAIRS.includes(cand) ? cand : PAIRS.find((p) => p.startsWith(`${b} /`)), "pair");
  }

  // duration
  const exp = /\b(1|one|an?)\s*(hour|hr)\b|\b1h\b/.test(text) ? "1 hour"
    : /\b(7|seven)\s*days?\b|\b(a|one|1)\s*week\b|\b7d\b/.test(text) ? "7 days"
    : /\b(24|twenty[- ]?four)\s*(hours?|hrs?)\b|\b(a|one|1)\s*day\b|\b24h\b|\b1d\b/.test(text) ? "24 hours" : undefined;
  if (exp && EXPIRIES.includes(exp)) set("expiry", exp, "expiry");

  // numbers: classify by the words around them
  const re = /(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(k|m|thousand|million)?\b/gi;
  let amt: number | undefined, prc: number | undefined, loose: number | undefined;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const v = val(m[1], m[2]);
    if (v === null) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const before = text.slice(Math.max(0, m.index - 14), m.index);
    if (/^\s*(hours?|hrs?|h\b|days?|d\b|weeks?|minutes?|min\b)/.test(after)) continue;
    if (new RegExp(`^\\s*(${ALIAS_RE})\\b`).test(after)) amt ??= v;
    else if (/\b(?:amount|quantity|size|sell|selling)(?:\s+(?:to|of|is))?\s*$/.test(before)) amt ??= v;
    else if (/(?:\b(?:at|for|price|ask|asking|min|minimum|floor|per)(?:\s+(?:to|of|is))?|@|\$)\s*\$?\s*$/.test(before) || /^\s*(?:usdc|usdt|usd|dollars?)\b/.test(after)) prc ??= v;
    else loose ??= v;
  }
  if (amt !== undefined) set("amount", String(amt), "amount");
  if (prc !== undefined) set("price", String(prc), "price");
  if (loose !== undefined && amt === undefined && prc === undefined) {
    const st = stage(next); // a bare number answers whatever we just asked
    if (st === "amount") set("amount", String(loose), "amount");
    else if (st === "price") set("price", String(loose), "price");
  }

  // note
  const nm = msg.match(/\bnote\s*[:\-]\s*([\s\S]+)/i);
  if (nm) { next.note = nm[1].trim().slice(0, 500); next.noteDone = true; changed.add("note"); }
  else if (!changed.size && stage(f) === "note" && !/^(change|set|make|update|edit)\b/i.test(msg.trim())) {
    const skip = /^(no|none|nothing|skip|nope|n\/a|-)[.!]?$/i.test(msg.trim());
    next.note = skip ? "" : msg.trim().slice(0, 500); next.noteDone = true; changed.add("note");
  }
  // A different token makes the old amount and price meaningless: clear them unless re-entered now.
  if (changed.has("pair") && f.pair && f.pair.split(" / ")[0] !== next.pair!.split(" / ")[0]) {
    let cleared = false;
    if (!changed.has("amount") && next.amount) { next.amount = undefined; cleared = true; }
    if (!changed.has("price") && next.price) { next.price = undefined; cleared = true; }
    if (cleared) changed.add("reset");
  }
  return { next, changed };
}

async function aiExtract(message: string, f: Fields): Promise<Fields | null> {
  const system = `You turn a seller's message into listing fields. Fields: pair (one of: ${PAIRS.join("; ")}), amount (how many base tokens, plain number), ` +
    `price (quote tokens per 1 base token, plain number), expiry (one of: ${EXPIRIES.join("; ")}), note (short free text). ` +
    `Include only fields the message states or clearly implies. Never give advice, never comment on prices, never argue. ` +
    `Answer immediately, without deliberating, with ONLY JSON like {"pair":"NEAR / USDC","amount":"20000","price":"3"}. Current fields: ${JSON.stringify({ pair: f.pair, amount: f.amount, price: f.price, expiry: f.expiry })}`;
  const raw = await askAgent(system, message, {
    maxTokens: Number(process.env.LISTING_AI_MAX_TOKENS) || 800,
    reasoningEffort: process.env.LISTING_AI_REASONING_EFFORT || undefined,
  });
  const json = raw?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const j = JSON.parse(json), out: Fields = {};
    if (typeof j.pair === "string" && PAIRS.includes(j.pair)) out.pair = j.pair;
    if (typeof j.expiry === "string" && EXPIRIES.includes(j.expiry)) out.expiry = j.expiry;
    const a = Number(j.amount), p = Number(j.price);
    if (a > 0 && Number.isFinite(a)) out.amount = String(a);
    if (p > 0 && Number.isFinite(p)) out.price = String(p);
    if (typeof j.note === "string" && j.note.trim()) { out.note = j.note.trim().slice(0, 500); out.noteDone = true; }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

const ASK: Record<Stage, (b: string, q: string) => string> = {
  pair: () => "Which token are you selling?",
  amount: (b) => `How much ${b} are you selling?`,
  price: (b, q) => `What price per ${b}, in ${q}? This is the lowest price your agent will accept.`,
  expiry: () => "How long should the listing stay open? 1 hour, 24 hours or 7 days.",
  note: () => "Optional: add a private note for your agent. It never appears on the board. Say “skip” to leave it out.",
  done: () => "Everything is filled in below. Please check it, then press Submit, or tell me what to change.",
};

export async function handle(message: string, f0: Fields, prices: Record<string, number>) {
  let { next, changed } = extract(message, f0);
  const chatter = /^(yes|y|no|ok|okay|thanks|thank you|hi|hello|hey|confirm|correct|right)\b[\s.!]*$/i.test(message.trim());
  if (!changed.size && !chatter) {
    const ai = await aiExtract(message, f0);
    if (ai) for (const [k, v] of Object.entries(ai)) if ((next as Record<string, unknown>)[k] !== v) { (next as Record<string, unknown>)[k] = v; changed.add(k === "noteDone" ? "note" : k); }
  }

  const [base = "", quote = ""] = (next.pair ?? "").split(" / ");
  const bits: string[] = [];
  if (changed.has("pair")) bits.push(`pair ${next.pair}`);
  if (changed.has("amount")) bits.push(`amount ${fmtN(Number(next.amount))} ${base}`);
  if (changed.has("price")) bits.push(`price ${fmtN(Number(next.price))} ${quote} per ${base}`);
  if (changed.has("expiry")) bits.push(`open for ${next.expiry}`);
  if (changed.has("note")) bits.push(next.note ? "private note saved" : "no note");
  if (changed.has("reset")) bits.push("cleared the old amount and price for the new token");

  const lines: string[] = [];
  if (bits.length) lines.push(`Got it: ${bits.join(", ")}.`);
  else if (chatter && stage(next) === "done") lines.push("Great. Press Submit below when you're ready, or tell me what to change.");
  else lines.push("I couldn't read that. Try something like “sell 20,000 NEAR at 3 USDC for 24 hours”.");

  // Always echo spot once a price is known (a sanity check for the user, never an argument).
  const spot = next.pair ? prices[next.pair] : undefined;
  if (next.price && spot && (changed.has("price") || changed.has("pair"))) {
    const dev = deviation(Number(next.price), spot);
    lines.push(`For reference, ${base} spot is about ${fmtPrice(spot)} ${quote} (${spotLabel()}).${dev ? ` This is approx ${dev.pct}% ${dev.dir} spot.` : ""}`);
  }

  const st = stage(next);
  if (!(chatter && st === "done" && !bits.length)) lines.push(ASK[st](base, quote));
  const chips = st === "pair" ? BASES : st === "expiry" ? EXPIRIES : st === "note" ? ["Skip"] : [];
  return { reply: lines.join("\n"), fields: next, ready: st === "done", chips };
}
