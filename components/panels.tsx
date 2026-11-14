"use client";
import type { ApiCall, CaseFile, Evidence } from "@/lib/types";
import { orderedLayers } from "./CoreRack";
import { STANCE_COLOR, TIER_H, StanceTag, TierBadge, LabelChip } from "./ui";
import { Sparkline } from "./tripwire";

/* 2D fallback: same cores as stacked bars */
export function Cores2D({ c, selectedClaim, selectedEvidence, onSelectClaim, onSelectEvidence }: {
  c: CaseFile; selectedClaim: string | null; selectedEvidence: string | null;
  onSelectClaim: (id: string | null) => void; onSelectEvidence: (id: string) => void;
}) {
  const collapsed = c.origins.length > 0;
  return (
    <div className="h-full w-full flex items-end justify-center gap-6 px-6 pb-16 pt-6 overflow-x-auto">
      {c.claims.map((cl, i) => {
        const s = c.scores[cl.id];
        const layers = orderedLayers(c, cl.id).slice().reverse();
        const dim = selectedClaim !== null && selectedClaim !== cl.id;
        return (
          <div key={cl.id} className="flex flex-col items-center gap-2" style={{ opacity: dim ? 0.35 : 1 }}>
            <div className="mono text-[10px] text-survey">{s ? Math.round(s.confidence) : "—"}%</div>
            <button onClick={() => onSelectClaim(cl.id)} aria-label={`Claim ${i + 1}`}
              className="w-14 flex flex-col border border-line min-h-[60px] justify-end"
              style={{ borderStyle: s?.label === "Pending" ? "dashed" : "solid", opacity: s?.label === "Self-reported only" ? 0.6 : 1 }}>
              {layers.map((e) => (
                <span key={e.id} role="button" tabIndex={0}
                  onClick={(ev) => { ev.stopPropagation(); onSelectClaim(cl.id); onSelectEvidence(e.id); }}
                  onKeyDown={(ev) => { if (ev.key === "Enter") { onSelectClaim(cl.id); onSelectEvidence(e.id); } }}
                  title={`${e.domain} · T${e.tier} · ${e.stance} · ${e.engines.join(", ")}`}
                  className="block w-full border-t border-basalt"
                  style={{ height: (collapsed && !e.isOrigin ? 0.035 : TIER_H[e.tier]) * 90, background: STANCE_COLOR[e.stance], opacity: e.stance === "irrelevant" ? 0.4 : 1, outline: selectedEvidence === e.id ? "2px solid #5B9DFF" : undefined }} />
              ))}
            </button>
            <div className="mono text-[11px]">C{i + 1}</div>
            {s?.label === "Contested" && <div className="mono text-[9px] text-oxide">FRACTURED</div>}
          </div>
        );
      })}
    </div>
  );
}

const FACTORS: (keyof Evidence["factors"])[] = ["tier", "independence", "crossEngine", "selfInterest", "recency", "entailment"];

export function EvidenceDrawer({ e, c, onClose }: { e: Evidence; c: CaseFile; onClose: () => void }) {
  const cluster = c.origins.find((o) => o.id === e.originId);
  const origin = cluster ? c.evidence.find((x) => x.id === cluster.originEvidenceId) : undefined;
  return (
    <aside className="border border-survey/60 bg-panel p-4 tick-in" aria-label="Evidence detail">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="survey-label">EVIDENCE {e.id.toUpperCase()} · {e.fetchedVia}</div>
          <a href={e.url} target="_blank" rel="noreferrer" className="block font-semibold text-lg leading-tight hover:text-survey truncate">{e.title || e.domain}</a>
          <div className="mono text-[11px] text-muted flex gap-2 items-center mt-1 flex-wrap">
            <TierBadge tier={e.tier} /> <StanceTag stance={e.stance} /> <span>{e.domain}</span>
            {e.selfInterest && <span className="text-survey">SELF-INTEREST</span>}
            {!e.isOrigin && origin && <span>rewrite of {origin.domain}</span>}
          </div>
        </div>
        <button onClick={onClose} className="mono text-xs text-muted hover:text-bone" aria-label="Close evidence">✕</button>
      </div>
      {e.quote && <p className="mono text-[12px] italic text-lime mt-3 border-l-2 border-line pl-2">{e.quote}</p>}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {FACTORS.map((k) => (
          <div key={k}>
            <div className="flex justify-between mono text-[10px] text-muted uppercase"><span>{k}</span><span>{e.factors[k].toFixed(2)}</span></div>
            <div className="h-1 bg-line"><div className="h-1 bg-survey" style={{ width: `${Math.min(1, e.factors[k]) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="mono text-[10.5px] text-muted mt-3">weight = tier × independence × cross-engine × self-interest × recency × entailment = <span className="text-bone">{e.weight.toFixed(3)}</span></p>
      <p className="mono text-[10.5px] text-muted mt-1">tier reason: {e.tierReason} · engines: {e.engines.join(", ") || "—"} · published {e.publishedAt ?? "unknown"}</p>
    </aside>
  );
}

export function ClaimList({ c, selectedClaim, onSelectClaim, onSelectEvidence, selectedEvidence }: {
  c: CaseFile; selectedClaim: string | null; selectedEvidence: string | null;
  onSelectClaim: (id: string | null) => void; onSelectEvidence: (id: string) => void;
}) {
  if (c.claims.length === 0) return <p className="survey-label">no claims extracted yet…</p>;
  return (
    <ol className="divide-y divide-line border-y border-line">
      {c.claims.map((cl, i) => {
        const s = c.scores[cl.id];
        const open = selectedClaim === cl.id;
        const ev = c.evidence.filter((e) => e.claimId === cl.id).sort((a, b) => b.weight - a.weight);
        const total = (s?.supportWeight ?? 0) + (s?.contradictWeight ?? 0);
        return (
          <li key={cl.id} className={open ? "bg-panel" : ""}>
            <button onClick={() => onSelectClaim(open ? null : cl.id)} aria-expanded={open}
              className="w-full text-left p-3 grid grid-cols-[3.5rem_1fr] gap-3 hover:bg-panel transition-colors">
              <div>
                <div className="survey-label">C{i + 1}</div>
                <div className="text-3xl font-semibold leading-none tabular-nums" style={{ color: s?.label === "Contested" || s?.label === "Contradicted" ? "#E4572E" : "#E8E2D4" }}>{s && s.label !== "Pending" ? Math.round(s.confidence) : "—"}</div>
              </div>
              <div className="min-w-0">
                <div className="flex gap-2 items-center mb-1"><LabelChip label={s?.label ?? "Pending"} /><span className="survey-label">{cl.type}</span></div>
                <div className="leading-snug">{cl.text}</div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="survey-label">{s?.articles ?? ev.length} articles → {s?.independentOrigins ?? "?"} origins · {s?.engines.length ?? 0} engines</div>
                  {c.history?.[cl.id] && <span className="ml-auto"><Sparkline points={c.history[cl.id]} /></span>}
                </div>
              </div>
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-3 tick-in">
                <p className="mono text-[11px] text-muted"><span className="text-survey">DISPROOF ·</span> {cl.disproof}</p>
                {s && (
                  <div>
                    <div className="flex justify-between survey-label"><span>support {s.supportWeight.toFixed(2)}</span><span>contradict {s.contradictWeight.toFixed(2)}</span></div>
                    <div className="h-2 flex bg-line">
                      <div style={{ width: `${total ? (s.supportWeight / total) * 100 : 0}%`, background: "#3FB68B" }} />
                      <div style={{ width: `${total ? (s.contradictWeight / total) * 100 : 0}%`, background: "#E4572E" }} />
                    </div>
                  </div>
                )}
                <ul className="space-y-1.5">
                  {ev.map((e) => {
                    const cluster = c.origins.find((o) => o.id === e.originId);
                    const origin = !e.isOrigin && cluster ? c.evidence.find((x) => x.id === cluster.originEvidenceId) : undefined;
                    return (
                      <li key={e.id}>
                        <button onClick={() => onSelectEvidence(e.id)}
                          className="w-full text-left border-l-2 pl-2 py-1 hover:bg-basalt transition-colors"
                          style={{ borderColor: STANCE_COLOR[e.stance], background: selectedEvidence === e.id ? "#0E0E0C" : undefined }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <TierBadge tier={e.tier} /><StanceTag stance={e.stance} />
                            <span className="mono text-[11px]">{e.domain}</span>
                            <span className="mono text-[10px] text-muted ml-auto">w {e.weight.toFixed(3)}</span>
                          </div>
                          {e.quote && <div className="mono text-[11px] italic text-muted mt-0.5 line-clamp-2">{e.quote}</div>}
                          <div className="mono text-[10px] text-muted mt-0.5">
                            {e.engines.join(" · ")}{e.selfInterest && <span className="text-survey"> · self-reported</span>}
                            {origin && <span> · rewrite of {origin.domain}</span>}
                          </div>
                        </button>
                        <a href={e.url} target="_blank" rel="noreferrer" className="mono text-[10px] text-muted hover:text-survey pl-2.5">open source ↗</a>
                      </li>
                    );
                  })}
                  {ev.length === 0 && <li className="survey-label">drilling… no evidence yet</li>}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ProofPanel({ calls, err }: { calls: ApiCall[]; err: string | null }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight mb-2">Live calls — every row is a real API response</h2>
      {err && <p className="mono text-[11px] text-oxide mb-2">calls feed unavailable — {err}</p>}
      <div className="overflow-x-auto border-y border-line max-h-80 overflow-y-auto">
        <table className="w-full mono text-[11px]">
          <thead className="text-muted uppercase tracking-wider text-[10px] sticky top-0 bg-basalt">
            <tr className="text-left"><th className="py-1.5 pr-3">service</th><th className="pr-3">summary</th><th className="pr-3">engines</th><th className="pr-3 text-right">ms</th><th className="pr-3">status</th><th>trace</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {calls.length === 0 && <tr><td colSpan={6} className="py-3 text-muted">No calls recorded yet.</td></tr>}
            {calls.map((k) => (
              <tr key={k.id} className="align-top" style={{ color: k.status === "error" ? "#E4572E" : undefined }}>
                <td className="py-1 pr-3 whitespace-nowrap text-survey">{k.service}</td>
                <td className="pr-3">{k.summary}{k.status === "error" && k.detail && <div className="text-[10px]">{k.detail}</div>}</td>
                <td className="pr-3">{k.engines?.map((e) => <span key={e.name} className="mr-2 whitespace-nowrap" style={{ color: e.status === "succeeded" ? undefined : "#8F897C" }}>{e.name}:{e.count}</span>) ?? "—"}</td>
                <td className="pr-3 text-right tabular-nums">{k.ms}</td>
                <td className="pr-3">{k.status}{k.httpStatus ? ` ${k.httpStatus}` : ""}</td>
                <td className="text-muted">{k.traceId ? k.traceId.slice(0, 8) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
