import { NextResponse } from "next/server";
import { fail, sessionAccount } from "./api";
import { loadRoom } from "./rooms";
import { SettleError, type Role } from "./settlement";
import type { RoomDoc } from "./rooms";

type Ctx = { roomId: string; room: RoomDoc; role: Role; me: string; req: Request };

// Shared guard for the settlement routes: signed in, and a participant of this room.
export async function withSettlement(req: Request, params: Promise<{ roomId: string }>, fn: (c: Ctx) => Promise<unknown>) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  const { roomId } = await params;
  try {
    const found = await loadRoom(roomId, me);
    if (!found) return fail("Room not found.", 404);
    return NextResponse.json(await fn({ roomId, room: found.room, role: found.role, me, req }));
  } catch (e) {
    if (e instanceof SettleError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
    console.error("settlement", e instanceof Error ? e.message : e);
    return fail("Settlement hit a problem. Try again.", 500);
  }
}
