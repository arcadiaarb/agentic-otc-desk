"use client";

import { usePathname } from "next/navigation";
import { useSpot } from "./spot-provider";
import { fmtPrice, spotLabel } from "@/lib/spot";

// Scrolling price strip for the home and intents pages. Informational only.
export function SpotStrip() {
  const path = usePathname();
  const { prices } = useSpot();
  const items = Object.entries(prices);
  if ((path !== "/" && path !== "/intents") || !items.length) return null;
  const half = [...items, ...items, ...items];
  const row = (hidden?: boolean) => (
    <div className={`flex shrink-0 ${hidden ? "marquee-dup" : ""}`} aria-hidden={hidden}>
      {half.map(([pair, price], i) => (
        <span key={i} className="mx-5 inline-flex items-baseline gap-2 whitespace-nowrap text-sm">
          <span className="text-muted">{pair}</span>
          <span className="font-medium">{fmtPrice(price)}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="border-y border-line" role="region" aria-label="Indicative spot prices">
      <div className="mx-auto flex max-w-5xl items-stretch">
        <span className="z-10 shrink-0 border-r border-line bg-bg py-2 pl-5 pr-4 text-xs text-muted">
          <span className="hidden sm:inline">Indicative </span>spot · {spotLabel()}
        </span>
        <div className="marquee min-w-0 flex-1 py-2"><div className="marquee-track">{row()}{row(true)}</div></div>
      </div>
    </div>
  );
}
