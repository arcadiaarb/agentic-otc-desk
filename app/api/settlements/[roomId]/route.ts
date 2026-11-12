import { withSettlement } from "@/lib/settlement-route";
import { settlementView } from "@/lib/settlement";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = (req: Request, { params }: { params: Promise<{ roomId: string }> }) =>
  withSettlement(req, params, ({ roomId, room, role, me }) => settlementView(roomId, room, role, me));
