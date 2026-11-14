// SHARED CONTRACT — backend (lib/, app/api/) and UI (app/**/page.tsx, components/) both import this.
// Do not change field names without updating both sides.

export type ClaimType =
  | "funding" | "people" | "product" | "customers" | "market" | "pricing" | "legal" | "other";

export type Tier = 1 | 2 | 3 | 4 | 5; // 1 = primary (SEC, gov, courts), 5 = unknown / content farm
export type Stance = "supports" | "contradicts" | "irrelevant";
export type ClaimLabel = "Verified" | "Contested" | "Contradicted" | "Self-reported only" | "Unverifiable" | "Pending";

export interface Claim {
  id: string;                 // "c1", "c2"...
  text: string;
  type: ClaimType;
  disproof: string;           // what evidence would kill this claim
  entities: string[];
  weight: number;             // 0..1 importance to the overall case
  queries: { support: string; attack: string };
  engines: string[];          // Telem engines routed to for this claim type
}

export interface Evidence {
  id: string;
  claimId: string;
  url: string;
  domain: string;
  title: string;
  quote: string;              // exact sentence from the fetched page ("" if none)
  stance: Stance;
  entailment: number;         // 0..1 LLM confidence in stance
  tier: Tier;
  tierReason: string;
  engines: string[];          // which Telem engines (and "tavily-news") returned this URL
  originId: string;           // echo-collapse cluster id
  isOrigin: boolean;          // true if this doc is the cluster's origin
  selfInterest: boolean;      // company talking about itself / press wire
  publishedAt: string | null;
  fetchedVia: string;         // Telem fetch provider that returned the page, or "snippet"
  weight: number;             // final credibility weight (signed later by stance)
  factors: {
    tier: number; independence: number; crossEngine: number;
    selfInterest: number; recency: number; entailment: number;
  };
}

export interface OriginCluster {
  id: string;
  claimId: string;
  originEvidenceId: string;
  memberIds: string[];        // evidence ids that are rewrites of the origin (incl. origin)
  similarity: number;         // max pairwise similarity inside cluster
}

export interface ClaimScore {
  claimId: string;
  confidence: number;         // 0..100
  label: ClaimLabel;
  supportWeight: number;
  contradictWeight: number;
  articles: number;           // relevant evidence docs
  independentOrigins: number; // after echo collapse
  engines: string[];          // distinct engines that contributed relevant evidence
}

export interface LinkedInRecord {
  url: string;
  provider: string;           // expected "brightdata"
  title: string;
  excerpt: string;            // first ~600 chars of the record
  ok: boolean;
  error?: string;
}

export interface LogLine { ts: number; kind: "info" | "search" | "fetch" | "llm" | "score" | "error"; text: string }

export interface WatchEntry {
  claimId: string;
  monitorId: string;
  query: string;
  cursor: number;             // last agent-change seq handled
  createdAt: number;
  agentStatus: string | null;
  lastCheckedAt: number | null;
  seen: number;               // monitor URLs seen so far
}

export interface AlertItem {
  id: string;
  ts: number;
  claimId: string;
  kind: "drop" | "contested" | "new-contradiction";
  from: number; to: number;
  fromLabel: ClaimLabel; toLabel: ClaimLabel;
  url: string; domain: string; tier: Tier; quote: string;
  source: "monitor" | "recheck";
}

export interface HistoryPoint { ts: number; confidence: number; label: ClaimLabel; note: string }

export interface CaseFile {
  id: string;
  input: { kind: "url" | "thesis"; value: string };
  company: string;
  companyDomain: string | null;
  createdAt: number;
  status: "running" | "done" | "error";
  stage: string;              // human-readable current stage
  claims: Claim[];
  evidence: Evidence[];
  origins: OriginCluster[];
  scores: Record<string, ClaimScore>;
  questions: string[];
  linkedin: LinkedInRecord | null;
  routingBaseline: { claimId: string; engines: string[]; note: string } | null;
  log: LogLine[];
  seeded: boolean;            // true when replayed from data/cases.json cache (UI must label "SEEDED REPLAY")
  error?: string;
  // ---- Tripwire watch loop (optional so older cached cases still load) ----
  checking?: boolean;         // a watch check is running; UI keeps polling
  watch?: WatchEntry[];
  alerts?: AlertItem[];
  history?: Record<string, HistoryPoint[]>;
  routingCompare?: RoutingCompare[];
}

/** Same queries, two routes: Telem auto-routing vs Groundtruth's per-claim-type engine routing. */
export interface RouteStats { engines: string[]; urls: number; domains: number; credible: number; selfReported: number }
export interface RoutingCompare { claimId: string; auto: RouteStats; routed: RouteStats; at: number }

export type Service =
  | "telem.search" | "telem.fetch" | "telem.monitors" | "tavily.search" | "tavily.map" | "anthropic";

export interface ApiCall {
  id: string;
  caseId: string | null;
  ts: number;
  service: Service;
  summary: string;
  status: "ok" | "error";
  ms: number;
  httpStatus?: number;
  traceId?: string;           // Telem trajectory_id / session_id for Observe
  engines?: { name: string; status: string; count: number; ms: number | null }[];
  detail?: string;
}

export interface MonitorView {
  id: string;
  label: string;
  query: string;
  status: string;
  agentStatus: string | null;
  nextRunAt: string | null;
  createdAt: string;
  watermark: number;
  changes: {
    seq: number; kind: string; at: string; subject: string;
    before: unknown; after: unknown;
  }[];
  pollWarnings: string[];
  pollResults: { url: string; title: string }[];
}

// ---- HTTP API ----
// POST /api/analyze        body {kind:"url"|"thesis", value:string}   -> {id}
// GET  /api/case/:id       -> CaseFile   (UI polls every ~900ms while status==="running")
// GET  /api/cases          -> {id, company, status, seeded, createdAt}[]
// GET  /api/calls?caseId=  -> ApiCall[] (newest first; caseId optional)
// GET  /api/monitors       -> MonitorView[]
// POST /api/monitors       body {query, label}  -> MonitorView
// POST /api/monitors/:id/check -> MonitorView   (reads agent changes + poll now)
// POST /api/case/:id/watch  -> CaseFile   (creates one Telem monitor per claim from its disproof condition)
// POST /api/case/:id/check  -> {ok:true}  (async: reads monitor changes + attack re-search, judges new sources, rescores, raises alerts; poll /api/case/:id while case.checking)
