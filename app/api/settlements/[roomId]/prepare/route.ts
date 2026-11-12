import { withSettlement } from "@/lib/settlement-route";
import { prepare } from "@/lib/settlement";

export const dynamic = "force-dynamic";

// Builds the exact message this person's wallet must sign.
export const POST = (req: Request, { params }: { params: Promise<{ roomId: string }> }) =>
  withSettlement(req, params, ({ roomId, room, role, me }) => prepare(roomId, room, role, me));
