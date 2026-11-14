import type { MonitorView } from "./types";
import { monitorChanges, monitorCreate, monitorGet, monitorPoll } from "./telem";
import { SEED_MONITORS } from "./seeds";

const extra: { id: string; label: string }[] = [];
const g = globalThis as unknown as { __twPoll?: Map<string, { warnings: string[]; results: { url: string; title: string }[] }> };
const pollCache = (g.__twPoll ??= new Map());

export function allMonitors() { return [...SEED_MONITORS, ...extra]; }

export async function view(id: string, label: string, withPoll = false): Promise<MonitorView> {
  const [m, ch] = await Promise.all([monitorGet(id), monitorChanges(id)]);
  if (withPoll) {
    const r = await monitorPoll(id);
    const results = (r.json?.preprocessor_runs || []).flatMap((x: any) => (x.output_payload?.results || []).map((h: any) => ({ url: h.url, title: h.title || h.url })));
    const warnings = [...(r.json?.warnings || [])].map((w: any) => (typeof w === "string" ? w : w.code || JSON.stringify(w)));
    if (!r.ok) warnings.push(r.json?.error?.code || `HTTP ${r.status}`);
    const prev = pollCache.get(id);
    pollCache.set(id, { warnings, results: [...results, ...(prev?.results || [])].slice(0, 30) });
  }
  const pc = pollCache.get(id);
  return {
    id, label, query: m?.query || "", status: m?.status || "unknown",
    agentStatus: m?.agent_state?.status ?? null, nextRunAt: m?.agent_state?.next_run_at ?? null,
    createdAt: m?.created_at || "", watermark: ch?.watermark ?? m?.agent_state?.watermark ?? 0,
    changes: (ch?.changes || []).map((x: any) => ({ seq: x.seq, kind: x.kind, at: x.at, subject: x.subject?.name || x.subject?.entity_id || "", before: x.before, after: x.after })).reverse(),
    pollWarnings: pc?.warnings || [], pollResults: pc?.results || [],
  };
}

export async function create(query: string, label: string) {
  const m = await monitorCreate(query, label);
  if (!m?.id) throw new Error("monitor create failed");
  extra.push({ id: m.id, label });
  return view(m.id, label);
}
