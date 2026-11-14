import type { ClaimScore, ClaimType, Evidence, OriginCluster, Tier } from "./types";

// Seeded tier list. Unknown domains fall back to the LLM's tier judgement.
const T1 = ["sec.gov", "gov", "europa.eu", "courtlistener.com", "uscourts.gov", "fda.gov", "clinicaltrials.gov", "nih.gov", "pubmed.ncbi.nlm.nih.gov", "arxiv.org", "nature.com", "ftc.gov", "justice.gov"];
const T2 = ["reuters.com", "bloomberg.com", "wsj.com", "ft.com", "nytimes.com", "cnbc.com", "techcrunch.com", "theinformation.com", "axios.com", "forbes.com", "fortune.com", "businessinsider.com", "theverge.com", "wired.com", "washingtonpost.com", "apnews.com", "bbc.com", "economist.com", "fastcompany.com", "venturebeat.com", "statnews.com", "fiercehealthcare.com", "theguardian.com", "semafor.com", "sifted.eu"];
const T3 = ["crunchbase.com", "pitchbook.com", "cbinsights.com", "github.com", "huggingface.co", "a16z.com", "sequoiacap.com", "ycombinator.com", "linkedin.com", "g2.com", "gartner.com", "mobihealthnews.com", "healthcareitnews.com", "finextra.com", "tracxn.com", "sacra.com", "stratechery.com", "newcomer.co", "pymnts.com"];
const T4 = ["medium.com", "substack.com", "reddit.com", "x.com", "twitter.com", "youtube.com", "prnewswire.com", "businesswire.com", "globenewswire.com", "einpresswire.com", "accesswire.com", "quora.com", "facebook.com", "tiktok.com", "instagram.com"];
export const PRESS_WIRES = ["prnewswire.com", "businesswire.com", "globenewswire.com", "einpresswire.com", "accesswire.com"];

const match = (d: string, list: string[]) => list.some((x) => d === x || d.endsWith("." + x));
export function seededTier(domain: string): Tier | null {
  if (match(domain, T1)) return 1;
  if (match(domain, T2)) return 2;
  if (match(domain, T3)) return 3;
  if (match(domain, T4)) return 4;
  return null;
}

export function domainOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return url; }
}
export function normUrl(url: string) {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")).toLowerCase();
  } catch { return url.toLowerCase(); }
}

// Engines routed per claim type (query understanding → routing).
export const ROUTES: Record<ClaimType, string[]> = {
  funding: ["linkup", "exa", "brave", "perplexity", "tavily"],
  people: ["exa", "linkup", "brave", "parallel"],
  product: ["exa", "parallel", "brave", "tavily"],
  customers: ["exa", "brave", "linkup", "parallel", "tavily"],
  market: ["perplexity", "parallel", "exa", "tavily"],
  pricing: ["parallel", "exa", "brave"],
  legal: ["brave", "linkup", "perplexity", "tavily"],
  other: ["exa", "brave", "linkup", "perplexity", "tavily", "parallel"],
};

// ---- Echo collapse: 5-word shingles + Jaccard ----
function shingles(text: string) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 1500);
  const s = new Set<string>();
  for (let i = 0; i + 5 <= words.length; i++) s.add(words.slice(i, i + 5).join(" "));
  return s;
}
function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  // containment on the smaller doc: a rewrite usually embeds the release
  return inter / small.size;
}

export function echoCollapse(claimId: string, docs: { ev: Evidence; text: string }[]): OriginCluster[] {
  const sh = docs.map((d) => shingles(d.text + " " + d.ev.quote));
  const parent = docs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const simMax = new Map<number, number>();
  for (let i = 0; i < docs.length; i++)
    for (let j = i + 1; j < docs.length; j++) {
      const s = jaccard(sh[i], sh[j]);
      const sameQuote = docs[i].ev.quote.length > 40 && docs[i].ev.quote === docs[j].ev.quote;
      if (s > 0.3 || sameQuote) {
        parent[find(i)] = find(j);
        const r = find(j);
        simMax.set(r, Math.max(simMax.get(r) || 0, sameQuote ? 1 : s));
      }
    }
  const groups = new Map<number, number[]>();
  docs.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), i]); });
  const clusters: OriginCluster[] = [];
  for (const [root, idx] of groups) {
    // origin = best tier, then earliest published
    const sorted = [...idx].sort((a, b) => {
      const ea = docs[a].ev, eb = docs[b].ev;
      if (ea.tier !== eb.tier) return ea.tier - eb.tier;
      return (ea.publishedAt || "9999").localeCompare(eb.publishedAt || "9999");
    });
    const id = `o-${claimId}-${clusters.length + 1}`;
    sorted.forEach((k, n) => { docs[k].ev.originId = id; docs[k].ev.isOrigin = n === 0; });
    clusters.push({ id, claimId, originEvidenceId: docs[sorted[0]].ev.id, memberIds: sorted.map((k) => docs[k].ev.id), similarity: Math.round((simMax.get(root) || 0) * 100) / 100 });
  }
  return clusters;
}

// ---- Weights + scoring ----
const TIER_W: Record<Tier, number> = { 1: 1, 2: 0.85, 3: 0.65, 4: 0.35, 5: 0.12 };

export function weighEvidence(ev: Evidence, clusterSize: number) {
  const tier = TIER_W[ev.tier];
  const independence = ev.isOrigin ? 1 : 0.15 / Math.max(1, clusterSize - 1); // rewrites barely count
  const crossEngine = Math.min(1.5, 0.8 + 0.15 * ev.engines.length);
  const selfInterest = ev.selfInterest ? 0.4 : 1;
  let recency = 1;
  if (ev.publishedAt) {
    const ageDays = (Date.now() - Date.parse(ev.publishedAt)) / 86400000;
    if (Number.isFinite(ageDays)) recency = ageDays < 180 ? 1 : ageDays < 540 ? 0.8 : 0.6;
  }
  const entailment = ev.stance === "irrelevant" ? 0 : Math.max(0, Math.min(1, ev.entailment));
  ev.factors = { tier, independence: Math.round(independence * 100) / 100, crossEngine: Math.round(crossEngine * 100) / 100, selfInterest, recency, entailment };
  ev.weight = Math.round(tier * independence * crossEngine * selfInterest * recency * entailment * 1000) / 1000;
}

export function scoreClaim(claimId: string, evs: Evidence[], origins: OriginCluster[]): ClaimScore {
  const rel = evs.filter((e) => e.stance !== "irrelevant");
  const sup = rel.filter((e) => e.stance === "supports");
  const con = rel.filter((e) => e.stance === "contradicts");
  const supportWeight = sup.reduce((a, e) => a + e.weight, 0);
  const contradictWeight = con.reduce((a, e) => a + e.weight, 0);
  const relOrigins = new Set(rel.map((e) => e.originId));
  const indepSupport = sup.filter((e) => e.isOrigin && !e.selfInterest && e.tier <= 3);
  const net = supportWeight - 1.2 * contradictWeight;
  const confidence = rel.length ? Math.round(100 / (1 + Math.exp(-2.2 * net))) : 0;
  let label: ClaimScore["label"];
  if (!rel.length) label = "Unverifiable";
  // contradicted: credible evidence against, essentially nothing for it
  else if (contradictWeight >= 0.2 && contradictWeight > supportWeight && supportWeight < 0.25) label = "Contradicted";
  // contested only when contradiction is a meaningful share of the support (not one weak dissent among many)
  else if (contradictWeight >= 0.2 && contradictWeight >= 0.25 * supportWeight) label = "Contested";
  else if (contradictWeight > supportWeight) label = "Contested";
  else if (!indepSupport.length && sup.some((e) => e.selfInterest)) label = "Self-reported only";
  else if (indepSupport.length && confidence >= 60) label = "Verified";
  else label = "Unverifiable";
  void origins;
  return {
    claimId, confidence, label,
    supportWeight: Math.round(supportWeight * 100) / 100,
    contradictWeight: Math.round(contradictWeight * 100) / 100,
    articles: rel.length, independentOrigins: relOrigins.size,
    engines: [...new Set(rel.flatMap((e) => e.engines))],
  };
}
