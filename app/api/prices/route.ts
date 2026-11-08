import { NextResponse } from "next/server";
import { getPrices } from "@/lib/prices";

export const dynamic = "force-dynamic";

export async function GET() {
  const { prices, at } = await getPrices();
  return NextResponse.json({ prices, updatedAt: at ? new Date(at).toISOString() : null });
}
