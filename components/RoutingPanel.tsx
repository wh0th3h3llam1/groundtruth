"use client";
import { useState } from "react";
import type { CaseFile, RouteStats } from "@/lib/types";
import { ENGINE_COLOR } from "./ui";

const AUTO = "#8F897C", MINE = "#5B9DFF";

function sum(rows: RouteStats[], k: "credible" | "domains" | "selfReported" | "urls") { return rows.reduce((a, r) => a + r[k], 0); }

function Engines({ list }: { list: string[] }) {
  if (!list.length) return <span className="text-muted">none</span>;
  return <span className="flex flex-wrap gap-x-1.5">{list.map((e) => <span key={e} style={{ color: ENGINE_COLOR[e] ?? "#E8E2D4" }}>{e}</span>)}</span>;
}

/** Measured, not claimed: the same support + attack queries through Telem auto-routing vs Groundtruth routing. */
export default function RoutingPanel({ c, onChanged }: { c: CaseFile; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rows = c.routingCompare ?? [];

  async function measure() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/case/${c.id}/routing`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      onChanged();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const head = (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <h2 className="text-xl font-semibold tracking-tight">Routing, measured</h2>
      {c.status === "done" && (
        <button onClick={measure} disabled={busy} className="mono text-[10px] uppercase tracking-widest border border-line px-2 py-0.5 hover:border-survey hover:text-survey">
          {busy ? "measuring…" : rows.length ? "re-measure" : "measure"}
        </button>
      )}
    </div>
  );

  if (!rows.length) {
    return (
      <div>
        {head}
        <p className="text-sm text-muted leading-snug">Runs each claim&apos;s support and attack queries twice through Telem: once with Telem auto-routing, once routed by claim type. Then counts credible, independent domains each route found.</p>
        {c.status === "running" && <p className="survey-label mt-1">measuring while the check runs…</p>}
        {err && <p className="mono text-[11px] text-oxide mt-1">{err}</p>}
      </div>
    );
  }

  const auto = rows.map((r) => r.auto), mine = rows.map((r) => r.routed);
  const metrics: { k: "credible" | "domains" | "selfReported"; label: string }[] = [
    { k: "credible", label: "credible independent domains (T1–T3)" },
    { k: "domains", label: "distinct domains" },
    { k: "selfReported", label: "company / press-wire domains" },
  ];
  const ca = sum(auto, "credible"), cm = sum(mine, "credible");

  return (
    <div>
      {head}
      <p className="mono text-[11px] text-muted mb-3">
        Same {rows.length * 2} queries, two routes, {rows.length} claims.{" "}
        {ca === cm ? <span className="text-bone">Both routes found {cm} credible domains.</span>
          : cm > ca ? <span className="text-bone">Groundtruth routing found {cm} credible domains vs {ca} with auto-routing.</span>
          : <span className="text-bone">Auto-routing found {ca} credible domains vs {cm} with Groundtruth routing.</span>}
      </p>
      <div className="space-y-2.5">
        {metrics.map(({ k, label }) => {
          const a = sum(auto, k), m = sum(mine, k), max = Math.max(1, a, m);
          return (
            <div key={k}>
              <div className="survey-label mb-0.5">{label}</div>
              {([["auto-routing", a, AUTO], ["groundtruth", m, MINE]] as const).map(([name, v, col]) => (
                <div key={name} className="flex items-center gap-2 mono text-[11px]">
                  <span className="w-24 shrink-0" style={{ color: col }}>{name}</span>
                  <div className="flex-1 h-2 bg-line"><div className="h-2" style={{ width: `${(v / max) * 100}%`, background: col }} /></div>
                  <span className="w-7 text-right tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto mt-3">
      <table className="w-full mono text-[10.5px]">
        <thead className="text-muted text-left"><tr><th className="font-normal py-1">claim</th><th className="font-normal">auto-routing picked</th><th className="font-normal">groundtruth routed</th><th className="font-normal text-right">credible</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const cl = c.claims.find((x) => x.id === r.claimId);
            return (
              <tr key={r.claimId} className="align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{r.claimId.toUpperCase()} <span className="text-muted">{cl?.type}</span></td>
                <td className="pr-2"><Engines list={r.auto.engines} /></td>
                <td className="pr-2"><Engines list={r.routed.engines} /></td>
                <td className="text-right tabular-nums whitespace-nowrap"><span style={{ color: AUTO }}>{r.auto.credible}</span> / <span style={{ color: MINE }}>{r.routed.credible}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {err && <p className="mono text-[11px] text-oxide mt-1">{err}</p>}
    </div>
  );
}
