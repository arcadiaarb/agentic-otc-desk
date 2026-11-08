import { NextResponse } from "next/server";
import { fail, sessionAccount } from "@/lib/api";
import { loadRoom, roomView } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  const { id } = await params;
  try {
    const found = await loadRoom(id, me);
    if (!found) return fail("Room not found.", 404);
    return NextResponse.json(await roomView(id, found.room, found.role));
  } catch (e) {
    console.error("GET /api/rooms/[id]", e);
    return fail("Could not load the room.", 500);
  }
}
