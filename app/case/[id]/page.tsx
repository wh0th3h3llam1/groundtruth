"use client";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ApiCall, CaseFile } from "@/lib/types";
import { mockCase } from "@/components/mockCase";
import { ClaimList, Cores2D, EvidenceDrawer, ProofPanel } from "@/components/panels";
import MonitorsPanel from "@/components/MonitorsPanel";
import { ENGINES, ENGINE_COLOR, useReducedMotion } from "@/components/ui";

const CoreRack = dynamic(() => import("@/components/CoreRack"), { ssr: false, loading: () => <div className="survey-label p-6">loading rack…</div> });

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
  const reduced = useReducedMotion();
  const running = !c || c.status === "running";

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
        if (d.status !== "running") return;
      } catch (e) { if (!stop) setErr((e as Error).message); }
      if (!stop) t = setTimeout(tick, 900);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [id, isMock]);

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
    if (!running) return () => { stop = true; };
    const iv = setInterval(load, 1500);
    return () => { stop = true; clearInterval(iv); };
  }, [id, isMock, running]);

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
          <div className="text-3xl font-semibold">{err ? "Waiting for the drill rig…" : "Lowering the drill…"}</div>
          {err && <p className="mono text-[11px] text-muted mt-2">{err} — retrying every 0.9s</p>}
          <a href="/" className="survey-label hover:text-survey mt-6 inline-block">← back</a>
        </div>
      </main>
    );
  }

  const rackProps = { c, selectedClaim: selClaim, selectedEvidence: selEv, onSelectClaim: (x: string | null) => { setSelClaim(x); if (x === null) setSelEv(null); }, onSelectEvidence: setSelEv };

  return (
    <main className="min-h-screen px-4 md:px-6 py-4 max-w-[1600px] mx-auto">
      <header className="border-b border-line pb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <a href="/" className="text-lg font-bold tracking-tight hover:text-survey">TRIPWIRE</a>
        <div className="min-w-0">
          <div className="survey-label">{c.input.kind === "url" ? "SITE" : "THESIS"} · {c.input.value.slice(0, 80)}</div>
          <h1 className="text-4xl font-bold tracking-tight leading-none">{c.company || "Untitled company"}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isMock && <span className="mono text-[11px] bg-oxide text-bone px-2 py-0.5 tracking-widest">MOCK DATA</span>}
          {c.seeded && <span className="mono text-[11px] border border-survey text-survey px-2 py-0.5 tracking-widest">SEEDED REPLAY</span>}
          <span className="mono text-[11px] uppercase tracking-widest" style={{ color: c.status === "error" ? "#E4572E" : c.status === "running" ? "#5B9DFF" : "#3FB68B" }}>
            {c.status === "running" ? "● " : ""}{c.status}
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

      {c.status === "error" && <div className="mt-3 border border-oxide text-oxide mono text-xs p-3">Drill failed: {c.error ?? "unknown error"}</div>}
      {err && <div className="mt-3 mono text-[11px] text-muted">poll: {err}</div>}

      <div className="grid lg:grid-cols-[3fr_2fr] gap-5 mt-4">
        <section>
          <div className="flex items-center justify-between mb-1">
            <div className="survey-label">RACK · {c.claims.length} CORES · {c.origins.length} ORIGINS · {c.evidence.length} SAMPLES</div>
            <button onClick={() => setFlat((f) => !f)} aria-pressed={flat} className="mono text-[10px] uppercase tracking-widest border border-line px-2 py-0.5 hover:border-survey">
              {flat ? "3D" : "2D"}
            </button>
          </div>
          <div className="relative border border-line" style={{ height: "62vh" }}>
            {c.claims.length === 0 ? (
              <div className="h-full grid place-items-center survey-label">{c.status === "running" ? "extracting claims…" : "no claims found"}</div>
            ) : flat ? <Cores2D {...rackProps} /> : (
              <GLBoundary fallback={<Cores2D {...rackProps} />}>
                <CoreRack {...rackProps} reducedMotion={reduced} />
              </GLBoundary>
            )}
            <div className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-basalt to-transparent px-3 pt-6 pb-2 pointer-events-none">
              {c.log.slice(-8).map((l, i) => (
                <div key={`${l.ts}-${i}`} className="mono text-[10.5px] truncate tick-in" style={{ color: l.kind === "error" ? "#E4572E" : i === Math.min(7, c.log.length - 1) ? "#E8E2D4" : "#8F897C" }}>
                  <span className="text-muted">{new Date(l.ts).toLocaleTimeString()} {l.kind.padEnd(6)}</span> {l.text}
                </div>
              ))}
            </div>
            <div className="absolute top-2 left-3 survey-label pointer-events-none leading-relaxed">
              <div><span className="inline-block w-2 h-2 bg-lime mr-1" />supports <span className="inline-block w-2 h-2 bg-oxide mx-1 ml-3" />contradicts <span className="inline-block w-2 h-2 bg-slate mx-1 ml-3" />irrelevant</div>
              <div>ring = confidence · thin slivers = echo rewrites</div>
            </div>
          </div>
          {selEvidence && <div className="mt-4"><EvidenceDrawer e={selEvidence} c={c} onClose={() => setSelEv(null)} /></div>}
        </section>

        <section className="space-y-5 min-w-0">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-2">Claims</h2>
            <ClaimList {...rackProps} />
          </div>
          {c.linkedin && (
            <div className="border border-line p-3">
              <div className="survey-label mb-1">LINKEDIN VIA TELEM FETCH · {c.linkedin.provider.toUpperCase()}</div>
              {c.linkedin.ok ? (
                <>
                  <a href={c.linkedin.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-survey">{c.linkedin.title}</a>
                  <p className="mono text-[11px] text-muted mt-1 whitespace-pre-line">{c.linkedin.excerpt}</p>
                </>
              ) : <p className="mono text-[11px] text-oxide">fetch failed: {c.linkedin.error ?? "unknown error"} ({c.linkedin.url})</p>}
            </div>
          )}
          {c.questions.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold tracking-tight mb-2">Ask the founder</h2>
              <ol className="space-y-1.5">
                {c.questions.map((q, i) => <li key={i} className="flex gap-2"><span className="mono text-[11px] text-survey pt-0.5">Q{i + 1}</span><span className="leading-snug">{q}</span></li>)}
              </ol>
            </div>
          )}
        </section>
      </div>

      <div className="mt-8 space-y-8">
        {isMock ? <p className="survey-label">Live calls hidden — mock data has no API calls.</p> : <ProofPanel calls={calls} err={callsErr} />}
        <MonitorsPanel />
      </div>
    </main>
  );
}
