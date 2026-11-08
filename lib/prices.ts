// Server-only. Spot prices from the providers listed in lib/pairs.json, cached for refreshMinutes.
import cfg from "./pairs.json";

type Source = { provider: string; symbol: string };
let cache: { at: number; prices: Record<string, number> } | null = null;
let inflight: Promise<void> | null = null;

const dig = (o: unknown, path: string) =>
  path.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), o);

async function fetchOne(src: Source): Promise<number | null> {
  const p = (cfg.providers as Record<string, { url: string; path: string }>)[src.provider];
  if (!p) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(p.url.replace("{symbol}", encodeURIComponent(src.symbol)), { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const v = Number(dig(await res.json(), p.path));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null; // blocked region, timeout, bad JSON: try the next source
  } finally {
    clearTimeout(timer);
  }
}

async function refresh() {
  const memo = new Map<string, Promise<number | null>>(); // pairs sharing a symbol fetch it once
  const get = (s: Source) => { const k = `${s.provider}:${s.symbol}`; if (!memo.has(k)) memo.set(k, fetchOne(s)); return memo.get(k)!; };
  const next: Record<string, number> = {};
  await Promise.all(cfg.pairs.map(async (p) => {
    for (const s of p.sources) { const v = await get(s); if (v !== null) { next[p.pair] = v; return; } }
  }));
  const ttl = cfg.refreshMinutes * 60_000;
  const got = Object.keys(next).length > 0;
  // Keep older prices for pairs that failed; if everything failed, retry in a minute.
  cache = { at: got ? Date.now() : Date.now() - ttl + 60_000, prices: { ...(cache?.prices ?? {}), ...next } };
}

export async function getPrices() {
  if (!cache || Date.now() - cache.at > cfg.refreshMinutes * 60_000) {
    inflight ??= refresh().finally(() => { inflight = null; });
    await inflight;
  }
  return cache ?? { at: 0, prices: {} as Record<string, number> };
}
