import { NextResponse } from "next/server";
import { allMonitors, create, view } from "@/lib/monitors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const views = await Promise.all(allMonitors().map((m) => view(m.id, m.label).catch((e) => ({ id: m.id, label: m.label, error: String(e) }))));
  return NextResponse.json(views);
}
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!b.query) return NextResponse.json({ error: "query required" }, { status: 400 });
  try { return NextResponse.json(await create(String(b.query), String(b.label || b.query).slice(0, 60))); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 502 }); }
}
