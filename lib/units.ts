// Exact token-unit math with BigInt. Safe on client and server.
export function parseUnits(s: string, decimals: number): bigint {
  const m = s.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`"${s}" is not a valid amount.`);
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0"); // extra digits are truncated
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}
export function formatUnits(v: bigint, decimals: number): string {
  const neg = v < 0n, a = neg ? -v : v, base = 10n ** BigInt(decimals);
  const frac = (a % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / base}${frac ? "." + frac : ""}`;
}
