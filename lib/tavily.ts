import { recordCall } from "./store";

const KEY = () => process.env.TAVILY_API_KEY || "";

async function post(path: string, body: unknown, timeoutMs = 40000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.tavily.com" + path, {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* */ }
    return { ok: res.ok, status: res.status, json, text };
  } finally { clearTimeout(t); }
}

export async function tavilyNews(query: string, caseId: string | null) {
  const t0 = Date.now();
  try {
    const r = await post("/search", { query, topic: "news", time_range: "year", max_results: 5 });
    if (!r.ok) throw Object.assign(new Error(r.text.slice(0, 200)), { http: r.status });
    const results = (r.json.results || []) as { url: string; title: string; content: string; published_date?: string }[];
    recordCall({ caseId, service: "tavily.search", status: "ok", ms: Date.now() - t0, httpStatus: r.status, summary: `news: ${query} → ${results.length}` });
    return results;
  } catch (e: any) {
    recordCall({ caseId, service: "tavily.search", status: "error", ms: Date.now() - t0, httpStatus: e.http, summary: query, detail: String(e.message || e) });
    return [];
  }
}

export async function tavilyMap(url: string, caseId: string | null) {
  const t0 = Date.now();
  try {
    const r = await post("/map", { url, max_depth: 1, limit: 40 }, 30000);
    if (!r.ok) throw Object.assign(new Error(r.text.slice(0, 200)), { http: r.status });
    const urls = (r.json.results || []) as string[];
    recordCall({ caseId, service: "tavily.map", status: "ok", ms: Date.now() - t0, httpStatus: r.status, summary: `map ${url} → ${urls.length} pages` });
    return urls;
  } catch (e: any) {
    recordCall({ caseId, service: "tavily.map", status: "error", ms: Date.now() - t0, httpStatus: e.http, summary: `map ${url}`, detail: String(e.message || e) });
    return [];
  }
}
