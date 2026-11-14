"use client";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ApiCall, CaseFile } from "@/lib/types";
import { mockCase } from "@/components/mockCase";
import { ClaimList, Cores2D, EvidenceDrawer, ProofPanel } from "@/components/panels";
import { AlertFeed, TripwireBar } from "@/components/tripwire";
import { ENGINES, ENGINE_COLOR, useReducedMotion } from "@/components/ui";

const EvidenceTerrain = dynamic(() => import("@/components/EvidenceTerrain"), { ssr: false, loading: () => <div className="survey-label p-6">raising terrain…</div> });

class GLBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const isMock = id === "mock";
  const [c, setC] = useState<CaseFile | null>(isMock ? mockCase : null);
  const [err, setErr] = useState<string | null>(null);
  const [calls, setCalls] = useState<ApiCall[]>([]);
  const [callsErr, setCallsErr] = useState<string | null>(null);
  const [selClaim, setSelClaim] = useState<string | null>(null);
  const [selEv, setSelEv] = useState<string | null>(null);
  const [flat, setFlat] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const reduced = useReducedMotion();
  const live = !c || c.status === "running" || !!c.checking;

  useEffect(() => {
    if (isMock) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`/api/case/${id}`, { cache: "no-store" });
        if (!r.ok) throw new Error(r.status === 404 ? "Case not found (yet)" : `HTTP ${r.status}`);
        const d: CaseFile = await r.json();
        if (stop) return;
        setC(d); setErr(null);
        if (d.status !== "running" && !d.checking) return;
      } catch (e) { if (!stop) setErr((e as Error).message); }
      if (!stop) t = setTimeout(tick, 900);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [id, isMock, pollKey]);

  useEffect(() => {
    if (isMock) return;
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/calls?caseId=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: ApiCall[] = await r.json();
        if (!stop) { setCalls(d); setCallsErr(null); }
      } catch (e) { if (!stop) setCallsErr((e as Error).message); }
    };
    load();
    if (!live) return () => { stop = true; };
    const iv = setInterval(load, 1500);
    return () => { stop = true; clearInterval(iv); };
  }, [id, isMock, live]);

  const litEngines = useMemo(() => {
    const s = new Set<string>();
    calls.filter((k) => k.service === "telem.search").slice(0, 12)
      .forEach((k) => k.engines?.forEach((e) => { if (e.status === "succeeded") s.add(e.name); }));
    if (isMock && c) Object.values(c.scores).forEach((sc) => sc.engines.forEach((e) => s.add(e)));
    return s;
  }, [calls, isMock, c]);

  const selEvidence = c?.evidence.find((e) => e.id === selEv) ?? null;

  if (!c) {
    return (
      <main className="min-h-screen grid place-items-center p-8">
        <div className="text-center">
          <div className="survey-label mb-2">CASE {id}</div>
          <div className="text-3xl font-semibold">{err ? "Waiting for the survey…" : "Surveying the ground…"}</div>
          {err && <p className="mono text-[11px] text-muted mt-2">{err} — retrying every 0.9s</p>}
          <a href="/" className="survey-label hover:text-survey mt-6 inline-block">← back</a>
        </div>
      </main>
    );
  }

  const viewProps = { c, selectedClaim: selClaim, selectedEvidence: selEv, onSelectClaim: (x: string | null) => { setSelClaim(x); if (x === null) setSelEv(null); }, onSelectEvidence: setSelEv };
  const counts = { Verified: 0, Contested: 0, "Self-reported only": 0, Unverifiable: 0 } as Record<string, number>;
  Object.values(c.scores).forEach((s) => { const k = s.label === "Contradicted" ? "Contested" : s.label; if (k in counts) counts[k]++; });

  return (
    <main className="min-h-screen px-4 md:px-6 py-4 max-w-[1500px] mx-auto">
      <header className="border-b border-line pb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <a href="/" className="text-lg font-bold tracking-tight hover:text-survey">TRIPWIRE</a>
        <div className="min-w-0">
          <div className="survey-label truncate max-w-[60ch]">{c.input.kind === "url" ? "SITE" : "ASSUMPTIONS"} · {c.input.value.slice(0, 90)}</div>
          <h1 className="text-4xl font-bold tracking-tight leading-none">{c.company || "Untitled company"}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isMock && <span className="mono text-[11px] bg-oxide text-bone px-2 py-0.5 tracking-widest">MOCK DATA</span>}
          {c.seeded && <span className="mono text-[11px] border border-survey text-survey px-2 py-0.5 tracking-widest">SEEDED REPLAY</span>}
          <span className="mono text-[11px] uppercase tracking-widest" style={{ color: c.status === "error" ? "#E4572E" : live ? "#5B9DFF" : "#3FB68B" }}>
            {live ? "● " : ""}{c.checking ? "checking" : c.status}
          </span>
          <span className="mono text-[11px] text-muted">{c.stage}</span>
        </div>
        <div className="ml-auto flex gap-1" aria-label="Search engines">
          {ENGINES.map((e) => {
            const on = litEngines.has(e);
            return <span key={e} className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border transition-colors"
              style={{ borderColor: ENGINE_COLOR[e], color: on ? "#0E0E0C" : ENGINE_COLOR[e], background: on ? ENGINE_COLOR[e] : "transparent", opacity: on ? 1 : 0.55 }}
              title={on ? `${e}: returned results` : `${e}: no successful results yet`}>{e}</span>;
          })}
        </div>
      </header>

      {c.status === "error" && <div className="mt-3 border border-oxide text-oxide mono text-xs p-3">Check failed: {c.error ?? "unknown error"}</div>}
      {err && <div className="mt-3 mono text-[11px] text-muted">poll: {err}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mono text-[11px] px-2 py-0.5" style={{ background: "#3FB68B22", color: "#3FB68B" }}>{counts.Verified} verified</span>
        <span className="mono text-[11px] px-2 py-0.5" style={{ background: "#E4572E22", color: "#E4572E" }}>{counts.Contested} contested / contradicted</span>
        <span className="mono text-[11px] px-2 py-0.5" style={{ background: "#F2A93B22", color: "#F2A93B" }}>{counts["Self-reported only"]} self-reported</span>
        <span className="mono text-[11px] px-2 py-0.5 text-muted" style={{ background: "#5E6B7822" }}>{counts.Unverifiable} unverifiable</span>
        <span className="survey-label ml-2">{c.evidence.length} sources → {c.origins.length || c.evidence.length} origins</span>
        <div className="ml-auto">
          {!isMock && <TripwireBar c={c} onChanged={(d) => { if (d) setC(d); setPollKey((k) => k + 1); }} />}
        </div>
      </div>

      <section className="mt-3">
        <div className="relative border border-line" style={{ height: "56vh", minHeight: 360 }}>
          {c.claims.length === 0 ? (
            <div className="h-full grid place-items-center survey-label">{c.status === "running" ? "extracting claims…" : "no claims found"}</div>
          ) : flat ? <Cores2D {...viewProps} /> : (
            <GLBoundary fallback={<Cores2D {...viewProps} />}>
              <EvidenceTerrain {...viewProps} reducedMotion={reduced} />
            </GLBoundary>
          )}
          <div className="absolute top-2 left-3 survey-label pointer-events-none leading-relaxed">
            <div>
              <span className="inline-block w-2 h-2 mr-1" style={{ background: "#3FB68B" }} />peak = supported
              <span className="inline-block w-2 h-2 mx-1 ml-3" style={{ background: "#E4572E" }} />pit = contradicted
              <span className="inline-block w-2 h-2 mx-1 ml-3" style={{ background: "#F2A93B" }} />amber = self-reported
            </div>
            <div>flags = strongest sources · bigger flag = more credible tier · blue dot = found by Telem Monitor</div>
          </div>
          <button onClick={() => setFlat((f) => !f)} aria-pressed={flat}
            className="absolute top-2 right-2 mono text-[10px] uppercase tracking-widest border border-line bg-basalt/80 px-2 py-0.5 hover:border-survey">
            {flat ? "3D" : "2D"}
          </button>
          <div className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-basalt to-transparent px-3 pt-6 pb-2 pointer-events-none">
            {c.log.slice(-5).map((l, i, arr) => (
              <div key={`${l.ts}-${i}`} className="mono text-[10.5px] truncate tick-in" style={{ color: l.kind === "error" ? "#E4572E" : i === arr.length - 1 ? "#E8E2D4" : "#8F897C" }}>
                <span className="text-muted">{new Date(l.ts).toLocaleTimeString()}</span> {l.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[3fr_2fr] gap-6 mt-5">
        <section className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight mb-2">Claims</h2>
          <ClaimList {...viewProps} />
        </section>

        <section className="space-y-5 min-w-0">
          {selEvidence && <EvidenceDrawer e={selEvidence} c={c} onClose={() => setSelEv(null)} />}
          <AlertFeed c={c} onSelect={(cid) => setSelClaim(cid)} />
          {c.questions.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold tracking-tight mb-2">Ask the founder</h2>
              <ol className="space-y-1.5">
                {c.questions.map((q, i) => <li key={i} className="flex gap-2"><span className="mono text-[11px] text-survey pt-0.5">Q{i + 1}</span><span className="leading-snug">{q}</span></li>)}
              </ol>
            </div>
          )}
          {c.linkedin && (
            <div className="border border-line p-3">
              <div className="survey-label mb-1">LINKEDIN VIA TELEM FETCH · {c.linkedin.provider.toUpperCase()}</div>
              {c.linkedin.ok ? (
                <>
                  <a href={c.linkedin.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-survey">{c.linkedin.title}</a>
                  <p className="mono text-[11px] text-muted mt-1 whitespace-pre-line line-clamp-6">{c.linkedin.excerpt}</p>
                </>
              ) : <p className="mono text-[11px] text-oxide">fetch failed: {c.linkedin.error ?? "unknown error"} ({c.linkedin.url})</p>}
            </div>
          )}
        </section>
      </div>

      <div className="mt-8">
        {isMock ? <p className="survey-label">Live calls hidden — mock data has no API calls.</p> : <ProofPanel calls={calls} err={callsErr} />}
      </div>
    </main>
  );
}
