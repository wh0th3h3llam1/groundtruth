import fs from "node:fs";
import path from "node:path";
import type { ApiCall, CaseFile, LogLine } from "./types";
import { scoreClaim } from "./credibility";

type Store = { cases: Map<string, CaseFile>; calls: ApiCall[]; loaded: boolean };
const g = globalThis as unknown as { __tripwire?: Store };
const store: Store = g.__tripwire ?? (g.__tripwire = { cases: new Map(), calls: [], loaded: false });

const DATA_DIR = path.join(process.cwd(), "data");
const CASES_FILE = path.join(DATA_DIR, "cases.json");

function load() {
  if (store.loaded) return;
  store.loaded = true;
  try {
    const arr = JSON.parse(fs.readFileSync(CASES_FILE, "utf8")) as CaseFile[];
    for (const c of arr) { rescore(c); store.cases.set(c.id, { ...c, seeded: true }); }
  } catch { /* no cache yet */ }
}

/** Re-apply the current label rules to cached evidence so replays never show a stale label. */
function rescore(c: CaseFile) {
  for (const cl of c.claims) {
    const prev = c.scores[cl.id];
    if (!prev || prev.label === "Pending") continue;
    const next = scoreClaim(cl.id, c.evidence.filter((e) => e.claimId === cl.id), c.origins.filter((o) => o.claimId === cl.id));
    c.scores[cl.id] = next;
    for (const h of c.history?.[cl.id] ?? []) if (h.label === prev.label && h.confidence === prev.confidence) h.label = next.label;
  }
}

export function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const done = [...store.cases.values()].filter((c) => c.status === "done");
    fs.writeFileSync(CASES_FILE, JSON.stringify(done.map((c) => ({ ...c, seeded: false })), null, 1));
  } catch (e) { console.error("persist failed", e); }
}

export function getCase(id: string) { load(); return store.cases.get(id); }
export function putCase(c: CaseFile) { load(); store.cases.set(c.id, c); }
export function allCases() { load(); return [...store.cases.values()]; }
export function listCases() {
  load();
  return [...store.cases.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((c) => ({ id: c.id, company: c.company, status: c.status, seeded: c.seeded, createdAt: c.createdAt }));
}

export function log(c: CaseFile, kind: LogLine["kind"], text: string) {
  c.log.push({ ts: Date.now(), kind, text });
  if (c.log.length > 200) c.log.splice(0, c.log.length - 200);
}

export function recordCall(call: Omit<ApiCall, "id" | "ts">): ApiCall {
  const full: ApiCall = { ...call, id: Math.random().toString(36).slice(2, 10), ts: Date.now() };
  store.calls.unshift(full);
  if (store.calls.length > 500) store.calls.length = 500;
  return full;
}

export function listCalls(caseId?: string | null) {
  return caseId ? store.calls.filter((c) => c.caseId === caseId) : store.calls;
}

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 9);
