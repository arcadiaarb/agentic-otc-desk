// Server-only. Removes intents that have passed their expiry (public + private halves) and closes their open rooms.
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./firebase";

export async function cleanupExpired(max = 200) {
  const fs = db();
  const snap = await fs.collection("intents").where("expiresAt", "<", Timestamp.now()).limit(max).get();
  let deleted = 0, roomsClosed = 0;
  for (const d of snap.docs) {
    const rooms = await fs.collection("rooms").where("intentId", "==", d.id).get();
    const batch = fs.batch();
    for (const r of rooms.docs) if (r.data().status === "negotiating") { batch.update(r.ref, { status: "closed", busyUntil: 0 }); roomsClosed++; }
    batch.delete(d.ref);
    batch.delete(fs.collection("intent_private").doc(d.id));
    await batch.commit();
    deleted++;
  }
  return { deleted, roomsClosed };
}

// Runs a cleanup in the background at most every CLEANUP_EVERY_MINUTES (default 30). No scheduler needed
// on a long-running server; the board being opened is what triggers it.
let last = 0, running = false;
export function cleanupIfDue() {
  const every = (Number(process.env.CLEANUP_EVERY_MINUTES) || 30) * 60_000;
  if (running || Date.now() - last < every) return;
  running = true;
  last = Date.now();
  cleanupExpired()
    .catch((e) => console.error("cleanup", e instanceof Error ? e.message : e))
    .finally(() => { running = false; });
}
