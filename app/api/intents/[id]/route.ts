import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { fail, sessionAccount } from "@/lib/api";

export const dynamic = "force-dynamic";

// Seller removes their own intent (e.g. sold out). Deletes both halves and closes any open rooms.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = sessionAccount(req);
  if (!me) return fail("Sign in with your wallet.", 401);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Unknown intent.", 404);
  try {
    const fs = db();
    const priv = await fs.collection("intent_private").doc(id).get();
    if (!priv.exists || priv.data()?.sellerAccount !== me) return fail("Intent not found.", 404);
    const pub = await fs.collection("intents").doc(id).get();
    if (pub.data()?.status === "pending") return fail("A deal on this intent is waiting for signatures. Finish or wait for it to expire first.", 409);
    const rooms = await fs.collection("rooms").where("intentId", "==", id).get();
    const batch = fs.batch();
    rooms.docs.filter((r) => r.data().status === "negotiating").forEach((r) => batch.update(r.ref, { status: "closed", busyUntil: 0 }));
    batch.delete(fs.collection("intents").doc(id));
    batch.delete(fs.collection("intent_private").doc(id));
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/intents/[id]", e);
    return fail("Could not delete the intent.", 500);
  }
}
