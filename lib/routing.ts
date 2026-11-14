import type { CaseFile, Claim, RouteStats, RoutingCompare } from "./types";
import { telemSearch, type SearchResult } from "./telem";
import { PRESS_WIRES, domainOf, normUrl, seededTier } from "./credibility";

const N = 4;

function stats(c: CaseFile, results: SearchResult[]): RouteStats {
  const hits = results.flatMap((r) => r.hits).filter((h) => h.url);
  const engines = [...new Set(results.flatMap((r) => r.engines.filter((e) => e.count > 0).map((e) => e.name)))];
  const urls = new Set(hits.map((h) => normUrl(h.url)));
  const domains = new Set(hits.map((h) => domainOf(h.url)));
  const co = c.companyDomain;
  const isSelf = (d: string) => (!!co && (d === co || d.endsWith("." + co))) || PRESS_WIRES.some((w) => d.endsWith(w));
  let credible = 0, selfReported = 0;
  for (const d of domains) {
    if (isSelf(d)) selfReported++;
    else if ((seededTier(d) ?? 5) <= 3) credible++;
  }
  return { engines, urls: urls.size, domains: domains.size, credible, selfReported };
}

/**
 * Run a claim's support + attack queries through Telem auto-routing and compare with Groundtruth's routed results.
 * Pass the routed results when the pipeline already has them (no extra calls); otherwise they are fetched.
 */
export async function compareRouting(c: CaseFile, cl: Claim, routed?: SearchResult[]): Promise<RoutingCompare> {
  const qs = [cl.queries.support, cl.queries.attack];
  const [auto, mine] = await Promise.all([
    Promise.all(qs.map((q, i) => telemSearch(q, { autoRouting: true, numResults: N, caseId: c.id, label: `${cl.id} ${i ? "attack" : "support"} · auto-routing` }))),
    routed ? Promise.resolve(routed) : Promise.all(qs.map((q, i) => telemSearch(q, { engines: cl.engines, numResults: N, caseId: c.id, label: `${cl.id} ${i ? "attack" : "support"} · routed` }))),
  ]);
  return { claimId: cl.id, auto: stats(c, auto), routed: stats(c, mine), at: Date.now() };
}

export function putCompare(c: CaseFile, r: RoutingCompare) {
  c.routingCompare = [...(c.routingCompare ?? []).filter((x) => x.claimId !== r.claimId), r]
    .sort((a, b) => a.claimId.localeCompare(b.claimId, undefined, { numeric: true }));
}
