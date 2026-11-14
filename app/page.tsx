"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MonitorsPanel from "@/components/MonitorsPanel";
import { ENGINES, ENGINE_COLOR, timeAgo } from "@/components/ui";

type CaseRow = { id: string; company: string; status: string; seeded: boolean; createdAt: number };
const SEEDS = ["cursor.com", "ramp.com", "abridge.com"];

const SAMPLE_THESES: { title: string; tag: string; color: string; text: string }[] = [
  {
    title: "AI coding tools", tag: "Dev tools", color: "#6FD3FF",
    text: "Cursor is the fastest-growing AI code editor and has passed $1B in annual recurring revenue.\nGitHub Copilot is losing developers to Cursor.\nNo AI coding startup has raised at a higher valuation than Anysphere.",
  },
  {
    title: "Corporate cards", tag: "Fintech", color: "#A6E35F",
    text: "Ramp has overtaken Brex as the leading US corporate card for startups.\nRamp is profitable.\nAmex has not launched a competing spend-management product.",
  },
  {
    title: "Clinical AI scribes", tag: "Health", color: "#FF7EB6",
    text: "Abridge is the leading clinical AI documentation company.\nNo competitor has more health-system customers.\nMicrosoft Nuance DAX is losing share to Abridge.",
  },
];

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<"url" | "thesis">("url");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [casesErr, setCasesErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cases", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: CaseRow[]) => setCases(d))
      .catch((e: Error) => setCasesErr(e.message));
  }, []);

  async function drill(kind: "url" | "thesis", v: string) {
    if (!v.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, value: v.trim() }) });
      if (!r.ok) throw new Error(`analyze failed: HTTP ${r.status}`);
      const { id } = (await r.json()) as { id: string };
      router.push(`/case/${id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <main className="min-h-screen px-5 md:px-10 py-6 max-w-[1100px] mx-auto">
      <header className="flex items-center justify-between border-b border-line pb-3">
        <div className="text-2xl font-bold tracking-tight">GROUNDTRUTH</div>
        <div className="flex gap-1" aria-label="Search engines routed through Telem">
          {ENGINES.map((e) => (
            <span key={e} className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border" style={{ color: ENGINE_COLOR[e], borderColor: ENGINE_COLOR[e] }}>{e}</span>
          ))}
        </div>
      </header>

      <section className="py-12">
        <h1 className="text-[clamp(2.8rem,7vw,6rem)] leading-[0.9] font-bold tracking-tight">
          Every claim,<br /><span style={{ color: "#3FB68B" }}>checked</span> <span className="text-muted">and</span> <span style={{ color: "#5B9DFF" }}>watched.</span>
        </h1>
        <p className="mt-5 text-lg text-muted max-w-2xl leading-snug">
          Paste a company or write your investment assumptions. Groundtruth checks each claim across 6 search engines, scores how credible the sources are, and keeps watching for changes.
        </p>
        <p className="mt-3 mono text-[12px] max-w-2xl leading-snug" style={{ color: "#5B9DFF" }}>
          Why Telem: one API reaches 6 search engines at once, so agreement across independent engines becomes a credibility signal — and Telem Monitors keep watching every claim after the check ends.
        </p>

        <div className="mt-8 max-w-3xl">
          <div role="tablist" className="flex border-b border-line">
            {(["url", "thesis"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setValue(""); }}
                className={`mono text-[11px] uppercase tracking-widest px-3 py-2 -mb-px border-b-2 transition-colors ${tab === t ? "border-survey text-bone" : "border-transparent text-muted hover:text-bone"}`}>
                {t === "url" ? "Company URL" : "Investment assumptions"}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); drill(tab, value); }} className="mt-3 flex gap-2 items-stretch">
            {tab === "url" ? (
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://company.com" aria-label="Company URL"
                className="flex-1 bg-panel border border-line px-3 py-3 mono text-sm focus:border-survey outline-none" />
            ) : (
              <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={4} aria-label="Investment assumptions"
                placeholder={"One assumption per line, e.g.\nAcme raised a $40M Series B.\nNo competitor has more enterprise customers."}
                className="flex-1 bg-panel border border-line px-3 py-3 mono text-sm focus:border-survey outline-none" />
            )}
            <button type="submit" disabled={busy || !value.trim()} className="bg-survey text-basalt font-bold uppercase tracking-wider px-6 text-lg hover:bg-bone transition-colors">
              {busy ? "…" : "Check"}
            </button>
          </form>
          {err && <p className="mono text-[11px] text-oxide mt-2">{err}</p>}

          {tab === "url" ? (
            <div className="mt-4 flex gap-2 items-center flex-wrap">
              <span className="survey-label">try</span>
              {SEEDS.map((s) => (
                <button key={s} disabled={busy} onClick={() => drill("url", `https://${s}`)}
                  className="mono text-xs border border-line px-2.5 py-1 hover:border-survey hover:text-survey transition-colors">{s}</button>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <div className="survey-label mb-2">sample assumptions — click to fill</div>
              <div className="grid sm:grid-cols-3 gap-2">
                {SAMPLE_THESES.map((t) => (
                  <button key={t.title} disabled={busy} onClick={() => setValue(t.text)}
                    className="text-left border border-line bg-panel px-3 py-2.5 hover:border-current transition-colors" style={{ color: t.color }}>
                    <div className="mono text-[10px] uppercase tracking-widest">{t.tag}</div>
                    <div className="text-bone font-semibold mt-0.5">{t.title}</div>
                    <div className="text-muted text-xs mt-1 line-clamp-2">{t.text.split("\n")[0]}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-8 border-t border-line pt-5 mb-10">
        <div>
          <h2 className="text-xl font-semibold tracking-tight mb-3">Recent checks</h2>
          {casesErr && <p className="mono text-[11px] text-muted">Case index unavailable ({casesErr}).</p>}
          {cases === null && !casesErr && <p className="survey-label">loading…</p>}
          {cases && cases.length === 0 && <p className="mono text-xs text-muted">No checks yet.</p>}
          <ul className="divide-y divide-line">
            {cases?.slice(0, 8).map((c) => (
              <li key={c.id}>
                <a href={`/case/${c.id}`} className="flex items-center gap-3 py-2 hover:text-survey">
                  <span className="font-semibold truncate">{c.company}</span>
                  {c.seeded && <span className="mono text-[10px] border border-survey text-survey px-1 tracking-widest shrink-0">SEEDED REPLAY</span>}
                  <span className="survey-label ml-auto shrink-0">{c.status} · {timeAgo(c.createdAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <MonitorsPanel />
        </div>
      </section>
    </main>
  );
}
