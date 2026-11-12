import { withSettlement } from "@/lib/settlement-route";
import { requestSubmit, settlementView } from "@/lib/settlement";

export const dynamic = "force-dynamic";

// Retry after a failed or stalled submission. Returns at once; the page follows `phase`.
export const POST = (req: Request, { params }: { params: Promise<{ roomId: string }> }) =>
  withSettlement(req, params, async ({ roomId, room, role, me }) => {
    await requestSubmit(roomId, room);
    return settlementView(roomId, room, role, me);
  });
