import { NextResponse } from "next/server";
import { getCase } from "@/lib/store";
import { armWatch } from "@/lib/watch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = getCase(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (c.status !== "done") return NextResponse.json({ error: "case still running" }, { status: 409 });
  await armWatch(c);
  return NextResponse.json(c);
}
