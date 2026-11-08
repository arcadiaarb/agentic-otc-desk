import cfg from "./pairs.json";

// Pairs come from lib/pairs.json (one place to edit pairs and price sources).
export const PAIRS: string[] = cfg.pairs.map((p) => p.pair);
export const SIZES = ["Under $1k", "$1k – $10k", "$10k – $100k", "$100k – $1M", "Over $1M"];
export const EXPIRY_MS: Record<string, number> = { "1 hour": 3_600_000, "24 hours": 86_400_000, "7 days": 604_800_000 };
export const EXPIRIES = Object.keys(EXPIRY_MS);

// Size bucket -> [min, max) in quote-asset terms (USDC/USDT, so roughly USD). Total = exact amount x price.
export const SIZE_RANGE: Record<string, [number, number]> = {
  "Under $1k": [0, 1e3], "$1k – $10k": [1e3, 1e4], "$10k – $100k": [1e4, 1e5], "$100k – $1M": [1e5, 1e6], "Over $1M": [1e6, Infinity],
};
export const fitsSize = (size: string, total: number) => {
  const r = SIZE_RANGE[size];
  return !r || (total >= r[0] && total < r[1]);
};

// Public metadata only. Exact amount, price, note and salt never leave the server.
export type PublicIntent = { id: string; pair: string; size: string; commitment: string; expiresAt: string };

export function timeLeft(iso: string) {
  const mins = Math.floor((new Date(iso).getTime() - Date.now()) / 60_000);
  if (mins <= 0) return "Expired";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return hrs < 48 ? `${hrs} hr` : `${Math.floor(hrs / 24)} days`;
}

// The size range a total (amount x price) falls in.
export const sizeForTotal = (total: number) => Object.keys(SIZE_RANGE).find((k) => fitsSize(k, total)) ?? "";
