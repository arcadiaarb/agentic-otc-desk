import { NextResponse } from "next/server";
import { fail, sessionAccount } from "@/lib/api";
import { loadRoom, roomView, stepRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Advances the negotiation by one agent turn (if it's free), then returns the room.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  const { id } = await params;
  try {
    if (!(await loadRoom(id, me))) return fail("Room not found.", 404);
    await stepRoom(id);
    const found = await loadRoom(id, me);
    if (!found) return fail("Room not found.", 404);
    return NextResponse.json(await roomView(id, found.room, found.role));
  } catch (e) {
    console.error("POST /api/rooms/[id]/step", e);
    return fail("Could not advance the negotiation.", 500);
  }
}
