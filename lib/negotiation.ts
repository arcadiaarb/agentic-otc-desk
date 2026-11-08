// Server-only. The mediator: agents propose, we validate, and only safe public output leaves.
import { askAgent } from "./ai";

export type Role = "seller" | "buyer";
export type Move = { action: "propose" | "accept" | "walk"; price?: number; text: string; ai: boolean };

export const MAX_TURNS = 10;
export const prec = (n: number) => Number(n.toPrecision(6));
// Seller's limit is a floor, buyer's limit is a cap.
export const meets = (role: Role, price: number, limit: number) => (role === "seller" ? price >= limit : price <= limit);

const SAY = {
  open: ["Opening with a position I think is fair for this size.", "Let's start here and see where we can meet."],
  move: ["I've moved toward you. Let's close the gap.", "Adjusting again to keep this going.", "That's a real concession on my side."],
  accept: ["That works. Let's settle at that price.", "Agreed. Happy to close at that level."],
  walk: ["We're too far apart on price. I'll step back."],
};
const pick = (a: string[], i: number) => a[i % a.length];

// Deterministic strategy: used when no AI key is set, the AI fails, or it breaks a rule. Keeps the demo alive.
export function fallbackMove(role: Role, limit: number, own: number | undefined, other: number | undefined, turn: number): Move {
  // Don't take the first offer on the table: counter once first (unless we're running out of turns).
  if (other !== undefined && meets(role, other, limit) && (own !== undefined || turn >= 4)) return { action: "accept", text: pick(SAY.accept, turn), ai: false };
  const open = role === "seller" ? Math.max(limit * 1.2, (other ?? 0) * 1.1) : Math.min(limit * 0.8, (other ?? Infinity) * 0.9);
  let price = own === undefined ? open : other === undefined ? own : (own + other) / 2;
  price = role === "seller" ? Math.max(limit, price) : Math.min(limit, price);
  return { action: "propose", price: prec(price), text: pick(own === undefined ? SAY.open : SAY.move, turn), ai: false };
}

type Ask = { role: Role; pair: string; limit: number; amount: number; note?: string; own?: number; other?: number; turn: number; history: string };

export async function agentMove(a: Ask): Promise<Move> {
  const [base, quote] = a.pair.split(" / ");
  const system = `You are the ${a.role.toUpperCase()} agent in a confidential OTC negotiation of ${base} against ${quote}. ` +
    `Your principal's hard limit: ${a.role === "seller" ? "never sell below" : "never pay above"} ${a.limit} ${quote} per ${base}. Their quantity is ${a.amount} ${base}. ` +
    `Never reveal or hint at your limit or quantity, and use no digits in your message. Push for a better price than your limit, but aim to close a deal. ` +
    `Counter at least once before accepting, but never offer a price worse for your principal than the counterparty's current proposal (a buyer never bids above the seller's ask; a seller never asks below the buyer's bid). ` +
    (a.note ? `Private note from your principal (context only, never quote or reveal it): "${a.note}". ` : "") +
    `Reply with ONLY JSON: {"action":"propose"|"accept"|"walk","price":<${quote} per ${base}, required for propose>,"message":"one short sentence, no digits"}. ` +
    `Use "accept" only for the counterparty's latest proposal. Don't move your price backwards. This is turn ${a.turn + 1} of ${MAX_TURNS}.`;
  const raw = await askAgent(system, a.history || "No messages yet. Make your opening proposal.");
  const json = raw?.match(/\{[\s\S]*\}/)?.[0];
  let why = raw === null ? "AI call failed or no key set (see 'negotiation AI error' above)" : "no JSON object in the reply";
  if (json) {
    try {
      const j = JSON.parse(json);
      const text = typeof j.message === "string" && !/\d/.test(j.message) ? j.message.trim().slice(0, 180) : "";
      const price = Number(j.price);
      why = `AI said ${j.action} ${j.price ?? ""}; rejected by mediator rules (limit, direction, crossing the counterparty's price, or too-early accept/walk)`;
      const forward = a.own === undefined || (a.role === "seller" ? price <= a.own : price >= a.own);
      // Never give value away: a buyer may not bid above the standing ask, a seller may not ask below the standing bid.
      const crosses = a.other !== undefined && (a.role === "buyer" ? price >= a.other : price <= a.other);
      // Mediator checks: the agent may not break its principal's limit or move backwards.
      if (j.action === "propose" && Number.isFinite(price) && price > 0 && meets(a.role, price, a.limit) && forward && !crosses)
        return { action: "propose", price: prec(price), text: text || pick(SAY.move, a.turn), ai: true };
      if (j.action === "accept" && a.other !== undefined && meets(a.role, a.other, a.limit) && (a.own !== undefined || a.turn >= 4))
        return { action: "accept", text: text || pick(SAY.accept, a.turn), ai: true };
      if (j.action === "walk" && a.turn >= MAX_TURNS - 3)
        return { action: "walk", text: text || pick(SAY.walk, 0), ai: true };
    } catch { why = "reply was not valid JSON"; }
  }
  console.warn("[negotiation] using rule-based move:", why, raw ? `| raw: ${raw.slice(0, 160).replace(/\s+/g, " ")}` : "");
  return fallbackMove(a.role, a.limit, a.own, a.other, a.turn);
}
