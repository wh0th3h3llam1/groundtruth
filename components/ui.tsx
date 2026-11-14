"use client";
import { useEffect, useState } from "react";
import type { ClaimLabel, Stance, Tier } from "@/lib/types";

export const ENGINES = ["exa", "brave", "linkup", "tavily", "perplexity", "parallel"] as const;
export const ENGINE_COLOR: Record<string, string> = { exa: "#6FD3FF", brave: "#FF8A3D", linkup: "#A6E35F", tavily: "#FF7EB6", perplexity: "#2EC4B6", parallel: "#FFD84D" };
export const TIER_COLOR: Record<Tier, string> = { 1: "#3FB68B", 2: "#5B9DFF", 3: "#C9B98F", 4: "#8F897C", 5: "#5E6B78" };
export const STANCE_COLOR: Record<Stance, string> = { supports: "#3FB68B", contradicts: "#E4572E", irrelevant: "#5E6B78" };
export const TIER_H: Record<Tier, number> = { 1: 0.55, 2: 0.42, 3: 0.32, 4: 0.24, 5: 0.16 };

export function labelStyle(l: ClaimLabel): { bg: string; fg: string; border: string } {
  switch (l) {
    case "Verified": return { bg: "#3FB68B", fg: "#0E0E0C", border: "#3FB68B" };
    case "Contested": return { bg: "transparent", fg: "#E4572E", border: "#E4572E" };
    case "Contradicted": return { bg: "#E4572E", fg: "#0E0E0C", border: "#E4572E" };
    case "Self-reported only": return { bg: "transparent", fg: "#F2A93B", border: "#F2A93B" };
    case "Unverifiable": return { bg: "transparent", fg: "#8F897C", border: "#5E6B78" };
    default: return { bg: "transparent", fg: "#8F897C", border: "#2A2925" };
  }
}

export function LabelChip({ label }: { label: ClaimLabel }) {
  const s = labelStyle(label);
  return (
    <span className="mono inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-widest border" style={{ background: s.bg, color: s.fg, borderColor: s.border }}>
      {label}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  const solid = tier <= 2;
  return (
    <span className="mono inline-block w-7 text-center text-[10px] py-0.5 border" title={`Tier ${tier}`} style={{ background: solid ? TIER_COLOR[tier] : "transparent", color: solid ? "#0E0E0C" : TIER_COLOR[tier], borderColor: TIER_COLOR[tier] }}>
      T{tier}
    </span>
  );
}

export function StanceTag({ stance }: { stance: Stance }) {
  return (
    <span className="mono inline-flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: stance === "irrelevant" ? "#8F897C" : STANCE_COLOR[stance] }}>
      <span className="inline-block w-2 h-2" style={{ background: STANCE_COLOR[stance] }} />
      {stance}
    </span>
  );
}

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

export function timeAgo(ts: number | string | null) {
  if (ts == null) return "—";
  const t = typeof ts === "string" ? Date.parse(ts) : ts;
  if (isNaN(t)) return String(ts);
  const d = (Date.now() - t) / 1000;
  const abs = Math.abs(d);
  const s = abs < 60 ? `${Math.round(abs)}s` : abs < 3600 ? `${Math.round(abs / 60)}m` : abs < 86400 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86400)}d`;
  return d >= 0 ? `${s} ago` : `in ${s}`;
}
