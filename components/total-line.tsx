// Live total so nobody mistypes an amount or price: amount x price, in the quote asset.
export function TotalLine({ amount, price, quote, verb }: { amount: string; price: string; quote: string; verb: string }) {
  const total = Number(amount) * Number(price);
  const ok = Number(amount) > 0 && Number(price) > 0 && Number.isFinite(total);
  return (
    <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm" aria-live="polite">
      {ok ? (
        <>{verb} <strong className="font-semibold">{new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(total)} {quote}</strong></>
      ) : (
        <span className="text-muted">Enter an amount and price to see your total.</span>
      )}
    </p>
  );
}
