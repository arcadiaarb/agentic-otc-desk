import { withSettlement } from "@/lib/settlement-route";
import { SettleError, settlementView, signTrade } from "@/lib/settlement";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Receives the wallet's signature. If it was the seller (second) signature, the trade is submitted right away.
export const POST = (req: Request, { params }: { params: Promise<{ roomId: string }> }) =>
  withSettlement(req, params, async ({ roomId, room, role, me }) => {
    const b = (await req.json().catch(() => ({}))) as { publicKey?: unknown; signature?: unknown };
    if (typeof b.publicKey !== "string" || typeof b.signature !== "string" || b.signature.length > 400) throw new SettleError("Invalid signature data.");
    await signTrade(roomId, room, role, me, b.publicKey, b.signature);
    return settlementView(roomId, room, role, me);
  });
