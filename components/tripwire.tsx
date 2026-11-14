"use client";
import { useEffect, useState } from "react";
import type { CaseFile, HistoryPoint } from "@/lib/types";
import { TierBadge, timeAgo } from "./ui";

/** Arm per-claim Telem Monitors, then check them on demand. */
export function TripwireBar({ c, onChanged }: { c: CaseFile; onChanged: (d: CaseFile | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const armed = (c.watch?.length ?? 0) > 0;
  const ready = c.status === "done";

  async function arm() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/case/${c.id}/watch`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onChanged(d as CaseFile);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function check() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/case/${c.id}/check`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      onChanged(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!armed) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [armed]);
  const next = c.auto?.nextCheckAt ?? null;
  const left = next ? Math.max(0, Math.round((next - now) / 1000)) : null;
  const statuses = [...new Set((c.watch ?? []).map((w) => w.agentStatus ?? "unknown"))].join(", ");
  const last = Math.max(0, ...(c.watch ?? []).map((w) => w.lastCheckedAt ?? 0));
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {armed && c.auto && (
        <span className="mono text-[11px] px-2 py-0.5 border" style={{ borderColor: "#5B9DFF", color: "#5B9DFF" }}
          title={`Re-checks every ${Math.round(c.auto.everyMs / 60000)} min on its own while this case is open; pauses after 20 min with no viewer`}>
          {c.checking ? "● checking now" : left === null ? "auto-check paused" : `● auto-check every ${Math.round(c.auto.everyMs / 60000)} min · next in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
          {c.auto.checks > 0 && <span className="text-muted"> · {c.auto.checks} run</span>}
        </span>
      )}
      {armed && (
        <span className="survey-label">
          {c.watch!.length} tripwires · monitors {statuses} · {last ? `checked ${timeAgo(last)}` : "not checked yet"}
        </span>
      )}
      {!armed ? (
        <button onClick={arm} disabled={busy || !ready} title={ready ? "Create one Telem Monitor per claim" : "Wait for the check to finish"}
          className="bg-survey text-basalt font-semibold text-sm px-3 py-1.5 hover:bg-bone transition-colors">
          {busy ? "Arming…" : "Arm tripwires"}
        </button>
      ) : (
        <button onClick={check} disabled={busy || !!c.checking}
          className="border border-survey text-survey font-semibold text-sm px-3 py-1.5 hover:bg-survey hover:text-basalt transition-colors">
          {c.checking ? "Checking…" : busy ? "Starting…" : "Check now"}
        </button>
      )}
      {err && <span className="mono text-[11px] text-oxide w-full text-right">{err}</span>}
    </div>
  );
}

const KIND_TEXT = { drop: "confidence dropped", contested: "now contested", "new-contradiction": "new credible contradiction" } as const;

export function AlertFeed({ c, onSelect }: { c: CaseFile; onSelect: (claimId: string) => void }) {
  const alerts = c.alerts ?? [];
  if (!c.watch?.length && !alerts.length) {
    return (
      <div className="border border-line p-3">
        <div className="survey-label mb-1">TRIPWIRE ALERTS</div>
        <p className="text-sm text-muted leading-snug">Arm tripwires to watch every claim with a Telem Monitor. When credible new evidence breaks a claim, its peak sinks and an alert lands here.</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight mb-2">Tripwire alerts</h2>
      {alerts.length === 0 && <p className="mono text-[11px] text-muted">No tripwire has fired yet. Claims are being watched.</p>}
      <ul className="space-y-2">
        {alerts.map((a) => {
          const idx = c.claims.findIndex((x) => x.id === a.claimId);
          return (
            <li key={a.id}>
              <button onClick={() => onSelect(a.claimId)} className="w-full text-left border-l-2 border-oxide pl-3 py-1.5 hover:bg-panel transition-colors" style={{ borderRadius: 0 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="mono text-[11px] text-oxide uppercase tracking-wider">C{idx + 1} · {KIND_TEXT[a.kind]}</span>
                  <span className="mono text-[11px] text-bone">{a.from} → {a.to}</span>
                  <span className="survey-label ml-auto">{timeAgo(a.ts)}</span>
                </div>
                <div className="mono text-[11px] text-muted mt-1 flex items-center gap-2 flex-wrap">
                  <TierBadge tier={a.tier} /> {a.domain}
                  <span>· {a.source === "monitor" ? "found by Telem Monitor" : "found by Telem re-search"}</span>
                </div>
                {a.quote && <div className="mono text-[11px] italic text-muted mt-1 line-clamp-2">{a.quote}</div>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) return null;
  const w = 84, h = 22;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map((p) => h - 2 - (p.confidence / 100) * (h - 4));
  const last = points[points.length - 1], first = points[0];
  const color = last.label === "Contested" || last.label === "Contradicted" ? "#E4572E" : last.confidence < first.confidence - 5 ? "#E4572E" : last.label === "Self-reported only" ? "#F2A93B" : "#3FB68B";
  return (
    <svg width={w} height={h} aria-label={`confidence ${first.confidence} to ${last.confidence}`} className="shrink-0">
      <polyline points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")} fill="none" stroke={color} strokeWidth={1.8} />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.4} fill={color} />
    </svg>
  );
}
