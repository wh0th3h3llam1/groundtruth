import type { AlertItem, CaseFile, Claim, ClaimScore, Evidence } from "./types";
import { allCases, log, persist, uid } from "./store";
import { monitorChanges, monitorCreate, monitorGet, monitorPoll, telemSearch } from "./telem";
import { buildEvidence, recollapse, type Candidate } from "./pipeline";
import { normUrl } from "./credibility";

const MAX_NEW_PER_CLAIM = 5;
export const AUTO_EVERY_MS = 3 * 60_000;   // auto re-check cadence once tripwires are armed
const IDLE_PAUSE_MS = 20 * 60_000;         // pause when nobody has looked at the case for this long (saves API credits)
const RESUME_DELAY_MS = 20_000;            // first check soon after someone comes back
const TICK_MS = 10_000;

/** One in-process ticker per server: runs due auto-checks for armed cases. */
export function ensureScheduler() {
  const g = globalThis as unknown as { __gtTicker?: ReturnType<typeof setInterval> };
  if (g.__gtTicker) return;
  g.__gtTicker = setInterval(tick, TICK_MS);
}

function tick() {
  const now = Date.now();
  for (const c of allCases()) {
    const a = c.auto;
    if (!a || !c.watch?.length || c.status !== "done") continue;
    if (now - a.lastViewedAt > IDLE_PAUSE_MS) {
      if (a.nextCheckAt !== null) { a.nextCheckAt = null; log(c, "info", "Auto-check paused: nobody watching this case"); }
      continue;
    }
    if (c.checking || a.nextCheckAt === null || a.nextCheckAt > now) continue;
    a.nextCheckAt = now + a.everyMs;
    a.checks++;
    log(c, "info", `Auto-check #${a.checks} (every ${Math.round(a.everyMs / 60_000)} min)`);
    checkWatch(c).catch((e) => log(c, "error", "auto-check failed: " + String(e)));
  }
}

/** Called whenever the case is read: keeps the loop alive while someone is looking, resumes it after a pause. */
export function touchWatch(c: CaseFile) {
  if (!c.watch?.length) return;
  const now = Date.now();
  c.auto ??= { everyMs: AUTO_EVERY_MS, nextCheckAt: now + RESUME_DELAY_MS, lastViewedAt: now, checks: 0 };
  c.auto.lastViewedAt = now;
  if (c.auto.nextCheckAt === null) { c.auto.nextCheckAt = now + RESUME_DELAY_MS; log(c, "info", "Auto-check resumed"); }
  ensureScheduler();
}

/** Arm the tripwire: one Telem Monitor per claim, built from the claim's disproof condition. */
export async function armWatch(c: CaseFile) {
  c.watch ??= [];
  c.alerts ??= [];
  c.history ??= {};
  for (const cl of c.claims) {
    const s = c.scores[cl.id];
    if (s && !c.history[cl.id]?.length) c.history[cl.id] = [{ ts: Date.now(), confidence: s.confidence, label: s.label, note: "before watch" }];
  }
  const todo = c.claims.filter((cl) => !c.watch!.some((w) => w.claimId === cl.id));
  await Promise.all(todo.map(async (cl) => {
    const query = `${c.company}: ${cl.disproof}`.slice(0, 300);
    const m = await monitorCreate(query, `${c.company} ${cl.id}`, c.id);
    if (!m?.id) { log(c, "error", `${cl.id}: monitor create failed`); return; }
    c.watch!.push({ claimId: cl.id, monitorId: m.id, query, cursor: 0, createdAt: Date.now(), agentStatus: m.agent_state?.status ?? null, lastCheckedAt: null, seen: 0 });
    log(c, "info", `${cl.id}: tripwire armed (monitor ${m.id.slice(0, 8)})`);
  }));
  c.watch.sort((a, b) => a.claimId.localeCompare(b.claimId));
  c.auto = { everyMs: AUTO_EVERY_MS, nextCheckAt: Date.now() + AUTO_EVERY_MS, lastViewedAt: Date.now(), checks: 0 };
  ensureScheduler();
  persist();
  return c;
}

/** Check every armed tripwire: new monitor findings + a fresh attack re-search, judged and scored. */
export async function checkWatch(c: CaseFile) {
  if (c.checking) return;
  c.checking = true;
  c.stage = "Checking tripwires";
  try {
    await Promise.all(c.claims.map((cl) => checkClaim(c, cl)));
  } finally {
    c.checking = false;
    if (c.auto?.nextCheckAt) c.auto.nextCheckAt = Math.max(c.auto.nextCheckAt, Date.now() + c.auto.everyMs / 2);
    c.stage = "Complete";
    persist();
  }
}

async function checkClaim(c: CaseFile, cl: Claim) {
  const w = c.watch?.find((x) => x.claimId === cl.id);
  const known = new Set(c.evidence.filter((e) => e.claimId === cl.id).map((e) => normUrl(e.url)));
  const cands = new Map<string, Candidate>();
  const add = (url: string, title: string, engine: string, summary = "") => {
    if (!url || known.has(normUrl(url))) return;
    const k = normUrl(url);
    const a = cands.get(k) || { url, title, summary, engines: new Set<string>(), rank: engine === "telem-monitor" ? 0 : 5, published: null };
    a.engines.add(engine);
    cands.set(k, a);
  };

  // 1. Telem Monitor: agent change feed (entity_added carries the article URL) + poll.
  if (w) {
    const [m, ch, poll] = await Promise.all([monitorGet(w.monitorId), monitorChanges(w.monitorId, c.id, w.cursor || undefined), monitorPoll(w.monitorId, c.id)]);
    w.agentStatus = m?.agent_state?.status ?? w.agentStatus;
    let n = 0;
    for (const x of ch?.changes || []) {
      w.cursor = Math.max(w.cursor, x.seq || 0);
      const url = x.after?.url;
      if (url) { add(url, x.subject?.name || url, "telem-monitor"); n++; }
    }
    for (const run of poll.json?.preprocessor_runs || [])
      for (const h of run.output_payload?.results || []) { add(h.url, h.title || h.url, "telem-monitor", h.summary || ""); n++; }
    w.seen += n;
    w.lastCheckedAt = Date.now();
    log(c, "search", `${cl.id}: monitor ${w.monitorId.slice(0, 8)} (${w.agentStatus ?? "?"}) → ${n} findings`);
  }

  // 2. Fresh attack re-search through Telem (so a check works even before the monitor's first run).
  const re = await telemSearch(`${cl.queries.attack} latest`, { engines: cl.engines.slice(0, 4), numResults: 3, caseId: c.id, label: `${cl.id} recheck` });
  for (const h of re.hits) { add(h.url, h.title, h.engine, h.summary); }

  const pick = [...cands.values()].sort((a, b) => a.rank - b.rank || b.engines.size - a.engines.size).slice(0, MAX_NEW_PER_CLAIM);
  const before: ClaimScore = { ...c.scores[cl.id] };
  if (!pick.length) {
    pushHistory(c, cl.id, "check: nothing new");
    return;
  }
  const evs = await buildEvidence(c, cl, pick, `${cl.id} new sources`);
  c.evidence.push(...evs);
  const after = recollapse(c, cl);
  const relevant = evs.filter((e) => e.stance !== "irrelevant").length;
  pushHistory(c, cl.id, `check: ${evs.length} new, ${relevant} relevant`);
  log(c, "score", `${cl.id}: ${before.confidence} → ${after.confidence} (${after.label}) · ${evs.length} new sources`);
  maybeAlert(c, cl, before, after, evs);
}

function pushHistory(c: CaseFile, claimId: string, note: string) {
  c.history ??= {};
  const s = c.scores[claimId];
  (c.history[claimId] ??= []).push({ ts: Date.now(), confidence: s.confidence, label: s.label, note });
}

function maybeAlert(c: CaseFile, cl: Claim, before: ClaimScore, after: ClaimScore, evs: Evidence[]) {
  const contra = evs.filter((e) => e.stance === "contradicts").sort((a, b) => b.weight - a.weight);
  const strongContra = contra.find((e) => e.tier <= 3 && e.entailment >= 0.6 && !e.selfInterest);
  let kind: AlertItem["kind"] | null = null;
  if (after.confidence <= before.confidence - 15) kind = "drop";
  else if ((after.label === "Contested" || after.label === "Contradicted") && after.label !== before.label) kind = "contested";
  else if (strongContra) kind = "new-contradiction";
  if (!kind) return;
  const src = strongContra || contra[0] || evs.sort((a, b) => b.weight - a.weight)[0];
  const alert: AlertItem = {
    id: uid("al_"), ts: Date.now(), claimId: cl.id, kind,
    from: before.confidence, to: after.confidence, fromLabel: before.label, toLabel: after.label,
    url: src.url, domain: src.domain, tier: src.tier, quote: src.quote,
    source: src.engines.includes("telem-monitor") ? "monitor" : "recheck",
  };
  (c.alerts ??= []).unshift(alert);
  log(c, "error", `TRIPWIRE ${cl.id}: ${before.confidence} → ${after.confidence} · ${src.domain} (T${src.tier})`);
}
