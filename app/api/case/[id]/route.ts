import { NextResponse } from "next/server";
import { getCase } from "@/lib/store";
import { touchWatch } from "@/lib/watch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = getCase(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  touchWatch(c);
  return NextResponse.json(c);
}
