import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { fail } from "@/lib/api";
import { cleanupExpired } from "@/lib/cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual or scheduled cleanup. Protected by CRON_SECRET (Authorization: Bearer <secret>), since it deletes data.
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail("Cleanup isn't configured. Set CRON_SECRET.", 503);
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return fail("Not allowed.", 401);
  try {
    return NextResponse.json(await cleanupExpired());
  } catch (e) {
    console.error("cleanup-expired", e instanceof Error ? e.message : e);
    return fail("Cleanup failed.", 500);
  }
}
export const GET = run;
export const POST = run;
