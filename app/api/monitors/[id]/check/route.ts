import { NextResponse } from "next/server";
import { allMonitors, view } from "@/lib/monitors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = allMonitors().find((x) => x.id === id);
  if (!m) return NextResponse.json({ error: "unknown monitor" }, { status: 404 });
  return NextResponse.json(await view(id, m.label, true));
}
