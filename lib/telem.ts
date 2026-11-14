import { recordCall } from "./store";

const BASE = process.env.TELEM_BASE_URL || "https://hack.telem.ai/api";
const KEY = () => process.env.TELEM_API_KEY || "";

export const ALL_ENGINES = ["exa", "brave", "linkup", "tavily", "perplexity", "parallel"];

export interface SearchHit { url: string; title: string; summary: string; rank: number; engine: string }
export interface SearchResult { hits: SearchHit[]; engines: { name: string; status: string; count: number; ms: number | null }[]; traceId?: string; routing?: unknown }

async function telemFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 45000);
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* non-json */ }
    return { status: res.status, ok: res.ok, json, text };
  } finally { clearTimeout(t); }
}

export async function telemSearch(
  query: string,
  opts: { engines?: string[]; numResults?: number; autoRouting?: boolean; caseId?: string | null; label?: string } = {},
): Promise<SearchResult> {
  const t0 = Date.now();
  const search: any = { num_results: opts.numResults ?? 4 };
  if (opts.autoRouting) search.auto_routing = "accuracy";
  else search.providers = { include: opts.engines ?? ALL_ENGINES };
  try {
    const r = await telemFetch("/v1/search", { method: "POST", body: JSON.stringify({ user_input: { query }, search }) });
    if (!r.ok) throw Object.assign(new Error(r.json?.detail || r.json?.error?.message || r.text.slice(0, 200)), { http: r.status });
    const hits: SearchHit[] = [];
    const engines: SearchResult["engines"] = [];
    for (const run of r.json.preprocessor_runs || []) {
      const out = run.output_payload || {};
      const results = out.results || [];
      engines.push({ name: run.preprocessor_name, status: run.status, count: results.length, ms: out.latency_ms ?? null });
      for (const x of results) hits.push({ url: x.url, title: x.title || "", summary: x.summary || "", rank: x.rank ?? 99, engine: run.preprocessor_name });
    }
    recordCall({
      caseId: opts.caseId ?? null, service: "telem.search", status: "ok", ms: Date.now() - t0, httpStatus: r.status,
      summary: `${opts.autoRouting ? "[auto-routing] " : ""}${opts.label ? opts.label + ": " : ""}${query}`,
      traceId: r.json.trajectory_id || r.json.session_id, engines,
      detail: r.json.routing ? JSON.stringify(r.json.routing).slice(0, 300) : undefined,
    });
    return { hits, engines, traceId: r.json.trajectory_id, routing: r.json.routing };
  } catch (e: any) {
    recordCall({ caseId: opts.caseId ?? null, service: "telem.search", status: "error", ms: Date.now() - t0, httpStatus: e.http, summary: query, detail: String(e.message || e) });
    return { hits: [], engines: [] };
  }
}

export interface FetchedPage { url: string; ok: boolean; title: string; content: string; provider: string; error?: string }

type FetchOpts = { caseId?: string | null; providers?: string[]; label?: string; objective?: string };

// Telem fetch accepts at most 5 URLs per call — batch in parallel.
export async function telemFetchPages(urls: string[], opts: FetchOpts = {}): Promise<FetchedPage[]> {
  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += 5) batches.push(urls.slice(i, i + 5));
  const out = await Promise.all(batches.map((b) => fetchBatch(b, opts)));
  return out.flat();
}

async function fetchBatch(urls: string[], opts: FetchOpts): Promise<FetchedPage[]> {
  if (!urls.length) return [];
  const t0 = Date.now();
  const body: any = { urls };
  const options: any = {};
  if (opts.providers) options.providers = opts.providers;
  if (Object.keys(options).length) body.options = options;
  if (opts.objective) body.objective = opts.objective;
  try {
    const r = await telemFetch("/v1/fetch", { method: "POST", body: JSON.stringify(body), timeoutMs: 60000 });
    if (!r.ok) throw Object.assign(new Error(r.json?.error?.message || r.json?.detail || r.text.slice(0, 200)), { http: r.status });
    const pages: FetchedPage[] = [];
    for (const run of r.json.preprocessor_runs || []) {
      for (const f of run.output_payload?.fetched_results || []) {
        pages.push({
          url: f.url, ok: f.status === "succeeded", title: f.title || "", content: String(f.content || ""),
          provider: f.provider || "?", error: f.error ? String(f.error?.message || f.error) : undefined,
        });
      }
    }
    const okN = pages.filter((p) => p.ok).length;
    const providers = [...new Set(pages.filter((p) => p.ok).map((p) => p.provider))];
    recordCall({
      caseId: opts.caseId ?? null, service: "telem.fetch", status: okN ? "ok" : "error", ms: Date.now() - t0, httpStatus: r.status,
      summary: `${opts.label ? opts.label + ": " : ""}${okN}/${urls.length} pages via ${providers.join(", ") || "none"}`,
      traceId: r.json.trajectory_id || r.json.session_id,
      engines: providers.map((p) => ({ name: p, status: "succeeded", count: pages.filter((x) => x.provider === p && x.ok).length, ms: null })),
    });
    return pages;
  } catch (e: any) {
    recordCall({ caseId: opts.caseId ?? null, service: "telem.fetch", status: "error", ms: Date.now() - t0, httpStatus: e.http, summary: `${urls.length} urls`, detail: String(e.message || e) });
    return urls.map((u) => ({ url: u, ok: false, title: "", content: "", provider: "none", error: String(e.message || e) }));
  }
}

// ---- Monitors ----
export async function monitorsList() {
  const r = await telemFetch("/v1/monitors?limit=50");
  return r.json?.monitors || [];
}
export async function monitorGet(id: string) {
  const r = await telemFetch(`/v1/monitors/${id}`);
  return r.ok ? r.json : null;
}
export async function monitorCreate(query: string, label: string) {
  const t0 = Date.now();
  const r = await telemFetch("/v1/monitors", {
    method: "POST",
    body: JSON.stringify({ query, options: { frequency: "1h" }, ttl: "3d", metadata: { app: "tripwire", label } }),
  });
  recordCall({ caseId: null, service: "telem.monitors", status: r.ok ? "ok" : "error", ms: Date.now() - t0, httpStatus: r.status, summary: `create monitor: ${label}`, detail: r.ok ? r.json?.id : r.text.slice(0, 200) });
  return r.ok ? r.json : null;
}
export async function monitorChanges(id: string) {
  const t0 = Date.now();
  const r = await telemFetch(`/v1/monitors/${id}/agent/changes?limit=100`);
  recordCall({ caseId: null, service: "telem.monitors", status: r.ok ? "ok" : "error", ms: Date.now() - t0, httpStatus: r.status, summary: `agent changes ${id.slice(0, 8)}: ${r.json?.changes?.length ?? 0} changes`, detail: r.ok ? undefined : r.text.slice(0, 200) });
  return r.ok ? r.json : { changes: [], error: r.text.slice(0, 200) };
}
export async function monitorPoll(id: string) {
  const t0 = Date.now();
  const r = await telemFetch(`/v1/monitors/${id}/poll`, { method: "POST", body: "{}" });
  const n = (r.json?.preprocessor_runs || []).reduce((a: number, x: any) => a + (x.output_payload?.results?.length || 0), 0);
  recordCall({ caseId: null, service: "telem.monitors", status: r.ok ? "ok" : "error", ms: Date.now() - t0, httpStatus: r.status, summary: `poll ${id.slice(0, 8)}: ${n} new results`, detail: r.ok ? JSON.stringify(r.json?.warnings || r.json?.client_advisory || "").slice(0, 200) : r.text.slice(0, 200) });
  return r;
}
