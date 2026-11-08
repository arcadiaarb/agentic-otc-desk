"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const Ctx = createContext<{ prices: Record<string, number> }>({ prices: {} });
export const useSpot = () => useContext(Ctx);

// The server caches prices for the interval in lib/pairs.json, so polling here is cheap.
export function SpotProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/prices", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (!stop && d.prices) setPrices(d.prices); }).catch(() => {});
    load();
    const t = setInterval(load, 600_000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return <Ctx.Provider value={{ prices }}>{children}</Ctx.Provider>;
}
