import type { CaseFile, Claim, Evidence, OriginCluster, ClaimScore, Stance, Tier } from "@/lib/types";

const claims: Claim[] = [
  { id: "c1", text: "Raised a $105M Series C led by Thrive Capital", type: "funding", disproof: "SEC Form D or lead investor statement showing a different amount or lead", entities: ["Thrive Capital"], weight: 0.9, queries: { support: "Series C Thrive", attack: "Series C amount disputed" }, engines: ["exa", "brave", "tavily", "perplexity"] },
  { id: "c2", text: "Used by over 50% of Fortune 500 engineering teams", type: "customers", disproof: "Independent survey or customer list showing materially lower adoption", entities: [], weight: 0.7, queries: { support: "fortune 500 adoption", attack: "adoption overstated" }, engines: ["exa", "linkup", "parallel"] },
  { id: "c3", text: "Annual recurring revenue surpassed $100M within 12 months", type: "market", disproof: "Reporting from independent outlets citing lower ARR", entities: [], weight: 0.8, queries: { support: "ARR 100M", attack: "ARR lower" }, engines: ["brave", "perplexity", "tavily"] },
  { id: "c4", text: "SOC 2 Type II certified", type: "legal", disproof: "Absence from auditor registry or trust portal", entities: [], weight: 0.4, queries: { support: "SOC 2 Type II", attack: "" }, engines: ["exa", "linkup"] },
  { id: "c5", text: "Founded by former OpenAI researchers", type: "people", disproof: "Founder LinkedIn histories without OpenAI tenure", entities: [], weight: 0.5, queries: { support: "founders OpenAI", attack: "" }, engines: ["exa", "brave"] },
];

let n = 0;
function ev(claimId: string, domain: string, tier: Tier, stance: Stance, engines: string[], originId: string, isOrigin: boolean, selfInterest = false, quote = ""): Evidence {
  n++;
  const f = { tier: [1, 0.85, 0.65, 0.4, 0.2][tier - 1], independence: isOrigin ? 1 : 0.15, crossEngine: Math.min(1, 0.4 + engines.length * 0.15), selfInterest: selfInterest ? 0.3 : 1, recency: 0.9, entailment: stance === "irrelevant" ? 0.3 : 0.85 };
  return {
    id: `e${n}`, claimId, url: `https://${domain}/article-${n}`, domain, title: `${domain} report on ${claimId}`,
    quote: quote || `"…the company confirmed the figure in a statement on ${domain}…"`, stance, entailment: f.entailment, tier,
    tierReason: ["Primary filing", "Major newsroom", "Trade press", "Blog / aggregator", "Unknown"][tier - 1],
    engines, originId, isOrigin, selfInterest, publishedAt: "2026-09-12", fetchedVia: "telem.fetch",
    weight: +(f.tier * f.independence * f.crossEngine * f.selfInterest * f.recency * f.entailment).toFixed(3), factors: f,
  };
}

const evidence: Evidence[] = [
  ev("c1", "sec.gov", 1, "supports", ["exa", "brave"], "o1", true, false, "Total offering amount: $105,000,000"),
  ev("c1", "bloomberg.com", 2, "supports", ["brave", "perplexity", "tavily"], "o2", true),
  ev("c1", "techcrunch.com", 3, "supports", ["exa", "tavily"], "o2", false),
  ev("c1", "venturebeat.com", 3, "supports", ["linkup"], "o2", false),
  ev("c1", "aiwire-news.net", 5, "supports", ["parallel"], "o2", false),
  ev("c1", "businesswire.com", 4, "supports", ["exa", "brave", "tavily"], "o3", true, true),
  ev("c2", "company.com", 4, "supports", ["exa", "linkup"], "o4", true, true, "Trusted by over half of the Fortune 500"),
  ev("c2", "theinformation.com", 2, "contradicts", ["perplexity", "brave"], "o5", true, false, "Paid enterprise seats are concentrated in fewer than 60 large companies"),
  ev("c2", "medium.com", 5, "supports", ["parallel"], "o4", false),
  ev("c2", "devtoolsdigest.io", 4, "supports", ["exa"], "o4", false),
  ev("c2", "reddit.com", 5, "irrelevant", ["brave"], "o6", true),
  ev("c3", "company.com", 4, "supports", ["brave", "tavily"], "o7", true, true),
  ev("c3", "forbes.com", 3, "supports", ["perplexity"], "o7", false),
  ev("c3", "linkedin.com", 5, "supports", ["exa"], "o7", false),
  ev("c4", "trust.company.com", 4, "supports", ["exa"], "o8", true, true, "SOC 2 Type II report available on request"),
  ev("c5", "linkedin.com", 3, "supports", ["exa", "brave"], "o9", true),
  ev("c5", "nytimes.com", 2, "supports", ["brave", "perplexity", "parallel"], "o10", true),
];

function clusters(): OriginCluster[] {
  const m = new Map<string, Evidence[]>();
  evidence.forEach((e) => m.set(e.originId, [...(m.get(e.originId) ?? []), e]));
  return [...m.entries()].map(([id, es]) => ({ id, claimId: es[0].claimId, originEvidenceId: es.find((e) => e.isOrigin)!.id, memberIds: es.map((e) => e.id), similarity: es.length > 1 ? 0.91 : 1 }));
}

const S = (claimId: string, confidence: number, label: ClaimScore["label"], s: number, c: number, eng: string[]): ClaimScore => {
  const es = evidence.filter((e) => e.claimId === claimId && e.stance !== "irrelevant");
  return { claimId, confidence, label, supportWeight: s, contradictWeight: c, articles: es.length, independentOrigins: new Set(es.map((e) => e.originId)).size, engines: eng };
};

export const mockCase: CaseFile = {
  id: "mock", input: { kind: "url", value: "https://example-ai.com" }, company: "Example AI", companyDomain: "example-ai.com",
  createdAt: Date.now() - 60000, status: "done", stage: "Scored 5 claims", claims, evidence, origins: clusters(),
  scores: {
    c1: S("c1", 88, "Verified", 1.42, 0, ["exa", "brave", "perplexity", "tavily", "linkup", "parallel"]),
    c2: S("c2", 34, "Contested", 0.31, 0.58, ["exa", "linkup", "perplexity", "brave", "parallel"]),
    c3: S("c3", 22, "Self-reported only", 0.18, 0, ["brave", "tavily", "perplexity", "exa"]),
    c4: S("c4", 15, "Unverifiable", 0.05, 0, ["exa"]),
    c5: { claimId: "c5", confidence: 0, label: "Pending", supportWeight: 0, contradictWeight: 0, articles: 2, independentOrigins: 2, engines: ["exa", "brave"] },
  },
  questions: ["Can you share the Form D or cap table confirming the Series C lead?", "How many Fortune 500 companies have paid enterprise contracts vs. free individual seats?", "What is ARR excluding usage overages?"],
  linkedin: { url: "https://linkedin.com/company/example-ai", provider: "brightdata", title: "Example AI | LinkedIn", excerpt: "Example AI · Software Development · 201-500 employees · San Francisco. We build AI tools for developers…", ok: true },
  routingBaseline: null,
  log: [
    { ts: Date.now() - 9000, kind: "search", text: "telem.search c1 → 6 engines, 41 results" },
    { ts: Date.now() - 7000, kind: "fetch", text: "telem.fetch sec.gov/…/formd.xml ok" },
    { ts: Date.now() - 5000, kind: "llm", text: "entailment c2 theinformation.com → contradicts 0.86" },
    { ts: Date.now() - 3000, kind: "score", text: "echo-collapse c1: 4 articles → 1 origin (bloomberg.com)" },
    { ts: Date.now() - 1000, kind: "info", text: "done" },
  ],
  seeded: false,
};
