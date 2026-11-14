"use client";
import { useCallback, useEffect, useState } from "react";
import type { MonitorView } from "@/lib/types";
import { timeAgo } from "./ui";

export default function MonitorsPanel() {
  const [mons, setMons] = useState<MonitorView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/monitors", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMons(await r.json());
      setErr(null);
    } catch (e) { setErr(String((e as Error).message)); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  async function check(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/monitors/${id}/check`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m: MonitorView = await r.json();
      setMons((prev) => (prev ?? []).map((x) => (x.id === id ? m : x)));
    } catch (e) { setErr(`check failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  return (
    <section className="border-t border-line pt-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-semibold tracking-tight">Telem Monitors <span className="survey-label ml-2">hourly watch</span></h2>
        <button onClick={load} className="survey-label hover:text-survey">refresh</button>
      </div>
      {err && <p className="mono text-[11px] text-oxide mb-2">Monitors unavailable — {err}</p>}
      {mons === null && !err && <p className="survey-label">loading monitors…</p>}
      {mons && mons.length === 0 && <p className="mono text-xs text-muted">No monitors yet. Drill a company to start one.</p>}
      <ul className="divide-y divide-line border-y border-line">
        {mons?.map((m) => (
          <li key={m.id} className="py-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{m.label}</span>
                <span className="mono text-[10px] uppercase tracking-widest px-1 border border-survey text-survey">{m.agentStatus ?? m.status}</span>
              </div>
              <div className="mono text-[11px] text-muted truncate">q: {m.query}</div>
              <div className="survey-label mt-1">next run {timeAgo(m.nextRunAt)} · watermark {m.watermark} · created {timeAgo(m.createdAt)}</div>
              {m.changes.length === 0 ? (
                <p className="mono text-[11px] text-muted mt-1">No runs completed yet — agent status: {m.agentStatus ?? m.status}</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {m.changes.slice(-6).reverse().map((ch) => (
                    <li key={ch.seq} className="mono text-[11px]"><span className="text-survey">{ch.kind}</span> · {ch.subject} <span className="text-muted">· {timeAgo(ch.at)}</span></li>
                  ))}
                </ul>
              )}
              {m.pollWarnings.map((w, i) => <p key={i} className="mono text-[10px] text-oxide">{w}</p>)}
            </div>
            <div>
              <button onClick={() => check(m.id)} disabled={busy === m.id}
                className="mono text-[11px] uppercase tracking-widest border border-line px-3 py-1.5 hover:border-survey hover:text-survey transition-colors">
                {busy === m.id ? "checking…" : "Check now"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
