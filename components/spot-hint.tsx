"use client";

import { useSpot } from "./spot-provider";
import { deviation, fmtPrice, spotLabel } from "@/lib/spot";

// Display only: shows spot under a price field, and says so when the price is far from it.
export function SpotHint({ pair, price }: { pair: string; price: string }) {
  const { prices } = useSpot();
  const spot = prices[pair];
  if (!spot) return null;
  const dev = deviation(Number(price), spot);
  return (
    <p className="text-xs text-muted">
      Spot is about {fmtPrice(spot)} {pair.split(" / ")[1]} ({spotLabel()}).
      {dev && <span className="ml-1 text-orange">This is approx {dev.pct}% {dev.dir} spot.</span>}
    </p>
  );
}
