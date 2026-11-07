import type { ReactNode } from "react";

export type CardIntent = { id: string; pair: string; size: string; commitment: string; expiresLabel: string };

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function IntentCard({ intent, action }: { intent: CardIntent; action?: ReactNode }) {
  const sealed = <span className="block h-2.5 w-28 rounded-full bg-orange/35" aria-label="Sealed" />;
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-medium">{intent.pair}</h3>
        <span className="text-sm text-green-ink">Seller {intent.id.slice(0, 4)}</span>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <Row k="Size">{intent.size}</Row>
        <Row k="Expires in">{intent.expiresLabel}</Row>
      </dl>
      <dl className="mt-4 space-y-2.5 border-t border-dashed border-line pt-4 text-sm">
        <Row k="Exact amount">{sealed}</Row>
        <Row k="Exact price">{sealed}</Row>
        <Row k="Commitment"><span className="font-mono text-xs text-muted" title={intent.commitment}>{intent.commitment.slice(0, 10)}…</span></Row>
      </dl>
      {action && <div className="mt-5">{action}</div>}
    </article>
  );
}
