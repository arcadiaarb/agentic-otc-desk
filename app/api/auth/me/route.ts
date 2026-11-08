import { NextResponse } from "next/server";
import { sessionAccount } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return NextResponse.json({ accountId: sessionAccount(req) });
}
