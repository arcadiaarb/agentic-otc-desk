// Client-safe spot helpers. All numbers come from lib/pairs.json.
import cfg from "./pairs.json";

export const spotLabel = () => {
  const m = cfg.refreshMinutes;
  return `as of ${m % 60 === 0 ? `${m / 60}hr` : `${m}min`}`;
};
export const fmtPrice = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: n >= 100 ? 2 : 4 }).format(n);

// Only returns something when the price is far enough from spot to be worth mentioning.
export function deviation(price: number, spot: number | undefined) {
  if (!spot || !(price > 0)) return null;
  const pct = Math.round((Math.abs(price - spot) / spot) * 100);
  return pct < cfg.warnPercent ? null : ({ pct, dir: price > spot ? "above" : "below" } as const);
}
