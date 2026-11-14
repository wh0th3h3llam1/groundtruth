import { NextResponse } from "next/server";
import { startCase } from "@/lib/pipeline";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "thesis" ? "thesis" : "url";
  const value = String(body.value || "").trim();
  if (!value) return NextResponse.json({ error: "value required" }, { status: 400 });
  const c = startCase({ kind, value });
  return NextResponse.json({ id: c.id });
}
