import { NextResponse } from "next/server";
import { getCase, log, persist } from "@/lib/store";
import { compareRouting, putCompare } from "@/lib/routing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Measure Telem auto-routing vs Groundtruth routing for every claim of a finished case (live Telem calls). */
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = getCase(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (c.status !== "done") return NextResponse.json({ error: "case still running" }, { status: 409 });
  const results = await Promise.all(c.claims.map((cl) => compareRouting(c, cl)));
  results.forEach((r) => putCompare(c, r));
  log(c, "search", `Routing measured on ${results.length} claims: auto vs routed`);
  persist();
  return NextResponse.json(c.routingCompare);
}
