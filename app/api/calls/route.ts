import { NextResponse } from "next/server";
import { listCalls } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const caseId = new URL(req.url).searchParams.get("caseId");
  return NextResponse.json(listCalls(caseId).slice(0, 200));
}
