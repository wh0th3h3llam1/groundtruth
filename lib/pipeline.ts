import type { CaseFile, Claim, Evidence } from "./types";
import { getCase, log, persist, putCase, uid } from "./store";
import { telemFetchPages, telemSearch, type FetchedPage } from "./telem";
import { tavilyMap, tavilyNews } from "./tavily";
import { extractClaims, judgeEvidence, openQuestions } from "./llm";
import { compareRouting, putCompare } from "./routing";
import { PRESS_WIRES, ROUTES, domainOf, echoCollapse, normUrl, scoreClaim, seededTier, weighEvidence } from "./credibility";

const PER_CLAIM_DOCS = 7;

// Full page text per evidence id (server memory only) so echo collapse can be re-run when new evidence arrives.
const g = globalThis as unknown as { __twText?: Map<string, string> };
const textCache: Map<string, string> = (g.__twText ??= new Map());

export function startCase(input: { kind: "url" | "thesis"; value: string }) {
  let value = input.value.trim();
  if (input.kind === "url" && !/^https?:\/\//i.test(value)) value = "https://" + value;
  const c: CaseFile = {
    id: uid("case_"), input: { kind: input.kind, value }, company: input.kind === "url" ? domainOf(value) : "Investment thesis",
    companyDomain: input.kind === "url" ? domainOf(value) : null, createdAt: Date.now(), status: "running", stage: "Starting",
    claims: [], evidence: [], origins: [], scores: {}, questions: [], linkedin: null, routingBaseline: null, log: [], seeded: false,
    watch: [], alerts: [], history: {},
  };
  putCase(c);
  run(c.id).catch((e) => {
    const cc = getCase(c.id);
    if (!cc) return;
    cc.status = "error"; cc.error = String(e?.message || e); cc.stage = "Failed";
    log(cc, "error", cc.error);
  });
  return c;
}

async function run(id: string) {
  const c = getCase(id)!;
  let sitePages: FetchedPage[] = [];

  if (c.input.kind === "url") {
    c.stage = "Mapping company site (Tavily map) + reading it (Telem fetch)";
    log(c, "fetch", `Mapping ${c.input.value}`);
    const [mapped, home] = await Promise.all([
      tavilyMap(c.input.value, c.id),
      telemFetchPages([c.input.value], { caseId: c.id, label: "homepage" }),
    ]);
    const wanted = /(about|customer|pricing|company|team|security|careers|press|news)/i;
    const extra = mapped.filter((u) => { try { return wanted.test(new URL(u, c.input.value).pathname); } catch { return false; } }).slice(0, 3);
    const more = extra.length ? await telemFetchPages(extra, { caseId: c.id, label: "site pages" }) : [];
    sitePages = [...home, ...more].filter((p) => p.ok);
    log(c, "fetch", `Read ${sitePages.length} site pages`);
    linkedin(c, sitePages).catch(() => {});
  }

  c.stage = "Extracting checkable claims (Claude)";
  const ex = await extractClaims(c.input, sitePages.map((p) => ({ url: p.url, content: p.content })), c.id);
  if (ex.company) c.company = ex.company;
  c.claims = ex.claims.slice(0, 5).map((r, i): Claim => ({
    id: `c${i + 1}`, text: r.text, type: ROUTES[r.type] ? r.type : "other", disproof: r.disproof, entities: r.entities || [],
    weight: r.weight ?? 0.5, queries: { support: r.support_query, attack: r.attack_query },
    engines: ROUTES[ROUTES[r.type] ? r.type : "other"],
  }));
  for (const cl of c.claims) c.scores[cl.id] = { claimId: cl.id, confidence: 0, label: "Pending", supportWeight: 0, contradictWeight: 0, articles: 0, independentOrigins: 0, engines: [] };
  log(c, "llm", `${c.claims.length} claims extracted for ${c.company}`);


  c.stage = "Drilling: two-sided search across engines, fetching full pages, judging";
  await Promise.all(c.claims.map((cl) => drill(c, cl)));

  c.stage = "Writing questions for the founder";
  try {
    const summary = c.claims.map((cl) => { const s = c.scores[cl.id]; return `- [${s.label}, ${s.confidence}/100, ${s.articles} articles → ${s.independentOrigins} origins] ${cl.text}`; }).join("\n");
    const q = await openQuestions(c.company, summary, c.id);
    c.questions = q.questions || [];
  } catch (e) { log(c, "error", "questions failed: " + String(e)); }

  c.history = {};
  for (const cl of c.claims) {
    const s = c.scores[cl.id];
    c.history[cl.id] = [{ ts: Date.now(), confidence: s.confidence, label: s.label, note: "initial check" }];
  }
  c.status = "done";
  c.stage = "Complete";
  log(c, "info", "Case complete");
  persist();
}

async function linkedin(c: CaseFile, pages: FetchedPage[]) {
  let li = pages.map((p) => p.content.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/company\/[A-Za-z0-9_\-%.]+/i)?.[0]).find(Boolean);
  if (!li) {
    const r = await telemSearch(`${c.companyDomain} company LinkedIn page`, { engines: ["exa", "brave"], numResults: 5, caseId: c.id, label: "find LinkedIn" });
    li = r.hits.map((h) => h.url).find((u) => /linkedin\.com\/company\//i.test(u));
  }
  if (!li) { c.linkedin = { url: "", provider: "none", title: "", excerpt: "", ok: false, error: "No LinkedIn company page found" }; return; }
  li = li.replace(/\/(about|jobs|people|posts)\/?$/i, "");
  const [p] = await telemFetchPages([li], { caseId: c.id, label: "LinkedIn" });
  c.linkedin = p?.ok
    ? { url: li, provider: p.provider, title: p.title, excerpt: p.content.slice(0, 700), ok: true }
    : { url: li, provider: p?.provider || "none", title: "", excerpt: "", ok: false, error: p?.error || "fetch failed" };
  log(c, "fetch", `LinkedIn ${c.linkedin.ok ? "read via " + c.linkedin.provider : "failed"}`);
}

export interface Candidate { url: string; title: string; summary: string; engines: Set<string>; rank: number; published: string | null }

/** Fetch full text for candidates, judge them against the claim, and return new Evidence (not yet added to the case). */
export async function buildEvidence(c: CaseFile, cl: Claim, cands: Candidate[], label: string): Promise<Evidence[]> {
  if (!cands.length) return [];
  const pages = await telemFetchPages(cands.map((t) => t.url), { caseId: c.id, label });
  const byUrl = new Map(pages.map((p) => [normUrl(p.url), p]));
  const docs = cands.map((t, i) => {
    const p = byUrl.get(normUrl(t.url));
    const ok = p?.ok && p.content.length > 200;
    return { i, url: t.url, title: p?.title || t.title, text: ok ? p!.content : t.summary, via: ok ? p!.provider : "snippet", agg: t };
  });

  let judged: Awaited<ReturnType<typeof judgeEvidence>>["results"] = [];
  try { judged = (await judgeEvidence(cl.text, docs, c.id)).results || []; }
  catch (e) { log(c, "error", `${cl.id} judge failed: ${String(e)}`); }

  const company = (c.companyDomain || "").split(".")[0];
  const existing = c.evidence.filter((e) => e.claimId === cl.id).length;
  return docs.map((d, k) => {
    const j = judged.find((x) => x.i === d.i);
    const domain = domainOf(d.url);
    const tier = seededTier(domain) ?? ((j?.tier as Evidence["tier"]) || 5);
    const self = (!!c.companyDomain && (domain === c.companyDomain || domain.endsWith("." + c.companyDomain) || (company.length > 3 && domain.split(".")[0] === company)))
      || PRESS_WIRES.some((w) => domain.endsWith(w));
    const ev: Evidence = {
      id: `${cl.id}-e${existing + k + 1}`, claimId: cl.id, url: d.url, domain, title: d.title, quote: j?.quote || "",
      stance: j?.stance || "irrelevant", entailment: j?.entailment ?? 0,
      tier: (self && tier < 4 && domain !== "sec.gov" ? Math.max(tier, 3) : tier) as Evidence["tier"],
      tierReason: seededTier(domain) ? "seeded domain list" : j?.tier_reason || "unclassified",
      engines: [...d.agg.engines], originId: `solo-${cl.id}-${existing + k}`, isOrigin: true, selfInterest: self,
      publishedAt: j?.published || d.agg.published, fetchedVia: d.via, weight: 0,
      factors: { tier: 0, independence: 1, crossEngine: 1, selfInterest: 1, recency: 1, entailment: 0 },
    };
    textCache.set(ev.id, d.text.slice(0, 8000));
    weighEvidence(ev, 1);
    return ev;
  });
}

/** Re-run echo collapse + weights + score over ALL evidence of a claim. */
export function recollapse(c: CaseFile, cl: Claim) {
  const evs = c.evidence.filter((e) => e.claimId === cl.id);
  const docs = evs.map((ev) => ({ ev, text: textCache.get(ev.id) || ev.quote || ev.title }));
  const clusters = echoCollapse(cl.id, docs);
  for (const e of evs) {
    const cluster = clusters.find((k) => k.id === e.originId)!;
    weighEvidence(e, cluster.memberIds.length);
  }
  c.origins = [...c.origins.filter((o) => o.claimId !== cl.id), ...clusters];
  c.scores[cl.id] = scoreClaim(cl.id, evs, clusters);
  return c.scores[cl.id];
}

async function drill(c: CaseFile, cl: Claim) {
  log(c, "search", `${cl.id} [${cl.type}] → ${cl.engines.join(", ")}`);
  const [sup, att, news] = await Promise.all([
    telemSearch(cl.queries.support, { engines: cl.engines, numResults: 4, caseId: c.id, label: `${cl.id} support` }),
    telemSearch(cl.queries.attack, { engines: cl.engines, numResults: 4, caseId: c.id, label: `${cl.id} attack` }),
    tavilyNews(cl.queries.attack, c.id),
  ]);

  // Measure: same two queries through Telem auto-routing (runs alongside evidence building).
  const compared = compareRouting(c, cl, [sup, att]).then((r) => putCompare(c, r)).catch((e) => log(c, "error", `${cl.id} routing compare failed: ${String(e)}`));

  const agg = new Map<string, Candidate>();
  const add = (url: string, title: string, summary: string, engine: string, rank: number, published: string | null = null) => {
    if (!url) return;
    const k = normUrl(url);
    const a = agg.get(k) || { url, title, summary, engines: new Set<string>(), rank, published };
    a.engines.add(engine); a.rank = Math.min(a.rank, rank);
    if (!a.summary && summary) a.summary = summary;
    if (!a.published && published) a.published = published;
    agg.set(k, a);
  };
  for (const h of [...sup.hits, ...att.hits]) add(h.url, h.title, h.summary, h.engine, h.rank);
  for (const n of news) add(n.url, n.title, n.content, "tavily-news", 3, n.published_date ? new Date(n.published_date).toISOString().slice(0, 10) : null);

  const top = [...agg.values()].sort((a, b) => b.engines.size - a.engines.size || a.rank - b.rank).slice(0, PER_CLAIM_DOCS);
  log(c, "search", `${cl.id}: ${agg.size} unique URLs from ${new Set([...sup.engines, ...att.engines].map((e) => e.name)).size} engines → reading top ${top.length}`);
  if (!top.length) { c.scores[cl.id] = scoreClaim(cl.id, [], []); await compared; return; }

  const evs = await buildEvidence(c, cl, top, `${cl.id} evidence`);
  // Stream pre-collapse evidence so the UI shows it arriving, then collapse.
  c.evidence.push(...evs);
  c.scores[cl.id] = scoreClaim(cl.id, evs, []);
  await new Promise((r) => setTimeout(r, 700));
  const s = recollapse(c, cl);
  await compared;
  log(c, "score", `${cl.id} ${s.label} ${s.confidence}/100 · ${s.articles} articles → ${s.independentOrigins} origins`);
}
