"use client";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CaseFile, ClaimScore, Evidence } from "@/lib/types";

export interface TerrainProps {
  c: CaseFile;
  selectedClaim: string | null;
  selectedEvidence: string | null;
  onSelectClaim: (id: string | null) => void;
  onSelectEvidence: (id: string) => void;
  reducedMotion: boolean;
}

const W = 14, D = 8, SEG_X = 140, SEG_Z = 80, SIGMA = 1.5;
const GREEN = new THREE.Color("#3FB68B"), RED = new THREE.Color("#E4572E"), AMBER = new THREE.Color("#F2A93B");
const GROUND = new THREE.Color("#45453d"), SNOW = new THREE.Color("#E8E2D4");

/** Height of a claim's landform: peaks for support, pits for contradiction. */
export function targetAmp(s: ClaimScore | undefined): number {
  if (!s || s.label === "Pending") return 0;
  if (s.label === "Unverifiable") return 0.08;
  if (s.label === "Self-reported only") return 0.7;
  if (s.label === "Contradicted") return -(1.1 + Math.min(0.9, s.contradictWeight * 0.5));
  if (s.label === "Contested") return -(0.45 + Math.min(0.6, s.contradictWeight * 0.6));
  if (s.label === "Verified") return 0.9 + (s.confidence / 100) * 1.6;
  return Math.max(-1.2, Math.min(1.6, (s.supportWeight - s.contradictWeight) * 1.2));
}

function layout(n: number) {
  const span = Math.min(10.5, Math.max(0, (n - 1) * 2.6));
  return Array.from({ length: n }, (_, i) => ({
    x: n === 1 ? 0 : -span / 2 + (span * i) / (n - 1),
    z: i % 2 ? 0.9 : -0.7,
  }));
}

function strongest(c: CaseFile, claimId: string, n = 3): Evidence[] {
  return c.evidence
    .filter((e) => e.claimId === claimId && e.isOrigin && e.stance !== "irrelevant")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n);
}

interface Hover { text: string; sub: string; x: number; y: number }

export default function EvidenceTerrain(props: TerrainProps) {
  const [hover, setHover] = useState<Hover | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const setHoverAt = (e: ThreeEvent<PointerEvent> | null, text = "", sub = "") => {
    const r = wrap.current?.getBoundingClientRect();
    setHover(e && r ? { text, sub, x: e.nativeEvent.clientX - r.left, y: e.nativeEvent.clientY - r.top } : null);
  };
  return (
    <div ref={wrap} className="relative w-full h-full" onPointerLeave={() => setHover(null)}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 4.6, 10.2], fov: 38 }} gl={{ antialias: true }}
        onPointerMissed={() => props.onSelectClaim(null)} style={{ cursor: hover ? "pointer" : "grab" }}>
        <color attach="background" args={["#0E0E0C"]} />
        <fog attach="fog" args={["#0E0E0C", 13, 26]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[-6, 9, 5]} intensity={1.15} color="#fff2dc" />
        <directionalLight position={[6, 4, -5]} intensity={0.25} color="#8fa0b0" />
        <Land {...props} onHover={setHoverAt} />
        <OrbitControls target={[0, 0.4, 0]} enablePan={false} minDistance={7} maxDistance={16} minPolarAngle={0.45} maxPolarAngle={1.3}
          enableDamping />
      </Canvas>
      {hover && (
        <div className="pointer-events-none absolute z-10 bg-basalt/95 border border-line px-2 py-1.5 mono text-[11px] leading-snug max-w-[280px]"
          style={{ left: Math.max(0, Math.min(hover.x + 14, (wrap.current?.clientWidth ?? 400) - 290)), top: hover.y + 14 }}>
          <div className="text-bone">{hover.text}</div>
          <div className="text-muted">{hover.sub}</div>
        </div>
      )}
    </div>
  );
}

function Land({ c, selectedClaim, selectedEvidence, onSelectClaim, onSelectEvidence, reducedMotion, onHover }: TerrainProps & {
  onHover: (e: ThreeEvent<PointerEvent> | null, text?: string, sub?: string) => void;
}) {
  const claims = c.claims;
  const spots = useMemo(() => layout(claims.length), [claims.length]);
  const targets = claims.map((cl) => targetAmp(c.scores[cl.id]));
  const selfFlags = claims.map((cl) => c.scores[cl.id]?.label === "Self-reported only");
  const alerted = new Set((c.alerts ?? []).map((a) => a.claimId));

  const amps = useRef<number[]>([]);
  const dirty = useRef(true);
  const group = useRef<THREE.Group>(null);
  const t = useRef(0);

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, D, SEG_X, SEG_Z);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, []);

  const heightAt = (x: number, z: number) => {
    let h = Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.05;
    spots.forEach((s, i) => { h += (amps.current[i] ?? 0) * Math.exp(-((x - s.x) ** 2 + (z - s.z) ** 2) / SIGMA); });
    return h;
  };

  const pinRefs = useRef<Record<string, THREE.Group | null>>({});
  const labelRefs = useRef<Record<string, THREE.Group | null>>({});
  const ringRefs = useRef<Record<string, THREE.Mesh | null>>({});
  const alertRefs = useRef<Record<string, THREE.Mesh | null>>({});

  useFrame((_, dt) => {
    t.current += dt;
    const d = Math.min(dt, 0.05);
    // ease landforms toward their targets (peaks rise, pits sink)
    targets.forEach((tg, i) => {
      const cur = amps.current[i] ?? 0;
      const next = reducedMotion ? tg : cur + (tg - cur) * (1 - Math.exp(-d * 2.2));
      if (Math.abs(next - cur) > 1e-4 || amps.current[i] === undefined) dirty.current = true;
      amps.current[i] = next;
    });
    amps.current.length = targets.length;

    if (dirty.current) {
      dirty.current = false;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const col = geo.attributes.color as THREE.BufferAttribute;
      const tmp = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const h = heightAt(x, z);
        pos.setY(i, h);
        if (h >= 0) tmp.copy(GROUND).lerp(GREEN, Math.min(1, h / 1.1));
        else tmp.copy(GROUND).lerp(RED, Math.min(1, -h / 0.9));
        let amber = 0;
        spots.forEach((s, k) => { if (selfFlags[k]) amber += Math.exp(-((x - s.x) ** 2 + (z - s.z) ** 2) / SIGMA); });
        if (amber > 0.02 && h > 0.04) tmp.lerp(AMBER, Math.min(0.9, amber));
        if (h > 2.1) tmp.lerp(SNOW, Math.min(0.55, (h - 2.1) * 1.2));
        col.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
      geo.computeVertexNormals();
    }

    // keep pins, labels and rings glued to the moving surface
    claims.forEach((cl, i) => {
      const s = spots[i];
      const top = heightAt(s.x, s.z);
      const lab = labelRefs.current[cl.id];
      if (lab) lab.position.set(s.x, Math.max(top, 0) + 0.9, s.z);
      const ring = ringRefs.current[cl.id];
      if (ring) { ring.position.set(s.x, top + 0.04, s.z); ring.visible = selectedClaim === cl.id; }
      const al = alertRefs.current[cl.id];
      if (al) {
        al.position.set(s.x, top + 0.03, s.z);
        const m = al.material as THREE.MeshBasicMaterial;
        m.opacity = reducedMotion ? 0.8 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t.current * 4));
      }
      strongest(c, cl.id).forEach((e, k) => {
        const g = pinRefs.current[e.id];
        if (!g) return;
        const a = k * 2.1 + 0.6;
        const px = s.x + Math.cos(a) * 0.62, pz = s.z + Math.sin(a) * 0.62;
        g.position.set(px, heightAt(px, pz), pz);
      });
    });
    if (group.current && !reducedMotion) group.current.rotation.y = Math.sin(t.current * 0.18) * 0.22;
  });

  const nearestClaim = (p: THREE.Vector3) => {
    let best = -1, bd = 1e9;
    spots.forEach((s, i) => { const dd = (p.x - s.x) ** 2 + (p.z - s.z) ** 2; if (dd < bd) { bd = dd; best = i; } });
    return bd < 2.6 ? best : -1;
  };

  return (
    <group ref={group}>
      <mesh geometry={geo}
        onClick={(e) => { e.stopPropagation(); const local = group.current ? group.current.worldToLocal(e.point.clone()) : e.point; const i = nearestClaim(local); onSelectClaim(i >= 0 ? claims[i].id : null); }}
        onPointerMove={(e) => {
          const local = group.current ? group.current.worldToLocal(e.point.clone()) : e.point;
          const i = nearestClaim(local);
          if (i < 0) { onHover(null); return; }
          const cl = claims[i], s = c.scores[cl.id];
          onHover(e, `C${i + 1} · ${cl.text.slice(0, 90)}${cl.text.length > 90 ? "…" : ""}`, `${s?.label ?? "Pending"} · ${s ? Math.round(s.confidence) : "—"}/100 · ${s?.articles ?? 0} articles → ${s?.independentOrigins ?? 0} origins`);
        }}
        onPointerOut={() => onHover(null)}>
        <meshStandardMaterial vertexColors roughness={0.88} flatShading />
      </mesh>
      <mesh geometry={geo} raycast={() => null}>
        <meshBasicMaterial color="#000000" wireframe transparent opacity={0.13} />
      </mesh>

      {claims.map((cl, i) => {
        const s = c.scores[cl.id];
        const conf = s && s.label !== "Pending" ? Math.round(s.confidence) : null;
        const color = s?.label === "Contested" || s?.label === "Contradicted" ? "#E4572E" : s?.label === "Self-reported only" ? "#F2A93B" : s?.label === "Verified" ? "#3FB68B" : "#8F897C";
        const dim = selectedClaim !== null && selectedClaim !== cl.id;
        return (
          <group key={cl.id}>
            <group ref={(g) => { labelRefs.current[cl.id] = g; }}>
              <Html center zIndexRange={[5, 0]} style={{ pointerEvents: "auto" }}>
                <button onClick={() => onSelectClaim(cl.id)}
                  className="mono whitespace-nowrap text-[11px] tracking-wider px-1.5 py-0.5 border bg-basalt/85 transition-opacity"
                  style={{ color, borderColor: selectedClaim === cl.id ? "#5B9DFF" : color, opacity: dim ? 0.35 : 1 }}>
                  C{i + 1} · {conf ?? "…"}{alerted.has(cl.id) ? " ⚠" : ""}
                </button>
              </Html>
            </group>
            <mesh ref={(m) => { ringRefs.current[cl.id] = m; }} rotation-x={-Math.PI / 2} raycast={() => null}>
              <ringGeometry args={[1.05, 1.13, 64]} />
              <meshBasicMaterial color="#5B9DFF" side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            {alerted.has(cl.id) && (
              <mesh ref={(m) => { alertRefs.current[cl.id] = m; }} rotation-x={-Math.PI / 2} raycast={() => null}>
                <ringGeometry args={[1.25, 1.4, 64]} />
                <meshBasicMaterial color="#E4572E" side={THREE.DoubleSide} transparent toneMapped={false} />
              </mesh>
            )}
            {strongest(c, cl.id).map((e) => <Pin key={e.id} e={e} c={c} selected={selectedEvidence === e.id} dim={dim}
              setRef={(g) => { pinRefs.current[e.id] = g; }}
              onClick={() => { onSelectClaim(cl.id); onSelectEvidence(e.id); }} onHover={onHover} />)}
          </group>
        );
      })}
    </group>
  );
}

const TIER_FLAG: Record<number, number> = { 1: 1.25, 2: 1.1, 3: 0.9, 4: 0.7, 5: 0.55 };

function Pin({ e, c, selected, dim, setRef, onClick, onHover }: {
  e: Evidence; c: CaseFile; selected: boolean; dim: boolean;
  setRef: (g: THREE.Group | null) => void; onClick: () => void;
  onHover: (ev: ThreeEvent<PointerEvent> | null, text?: string, sub?: string) => void;
}) {
  const color = e.stance === "contradicts" ? "#E4572E" : e.selfInterest ? "#F2A93B" : "#3FB68B";
  const rewrites = (c.origins.find((o) => o.id === e.originId)?.memberIds.length ?? 1) - 1;
  const k = TIER_FLAG[e.tier] ?? 0.7;
  const fromMonitor = e.engines.includes("telem-monitor");
  return (
    <group ref={setRef}>
      <group
        onClick={(ev) => { ev.stopPropagation(); onClick(); }}
        onPointerOver={(ev) => { ev.stopPropagation(); onHover(ev, `${e.domain} · T${e.tier} · ${e.stance}`, `${fromMonitor ? "found by Telem Monitor · " : ""}${e.engines.join(", ")}${rewrites > 0 ? ` · +${rewrites} rewrites collapsed` : ""}`); }}
        onPointerMove={(ev) => { ev.stopPropagation(); onHover(ev, `${e.domain} · T${e.tier} · ${e.stance}`, `${fromMonitor ? "found by Telem Monitor · " : ""}${e.engines.join(", ")}${rewrites > 0 ? ` · +${rewrites} rewrites collapsed` : ""}`); }}
        onPointerOut={() => onHover(null)}>
        <mesh position-y={0.42 * k}>
          <cylinderGeometry args={[0.018, 0.018, 0.84 * k, 6]} />
          <meshStandardMaterial color="#E8E2D4" transparent opacity={dim ? 0.3 : 1} />
        </mesh>
        <mesh position={[0.17 * k, 0.74 * k, 0]}>
          <boxGeometry args={[0.34 * k, 0.2 * k, 0.025]} />
          <meshBasicMaterial color={selected ? "#5B9DFF" : color} transparent opacity={dim ? 0.3 : 1} toneMapped={false} />
        </mesh>
        {fromMonitor && (
          <mesh position-y={0.9 * k}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshBasicMaterial color="#5B9DFF" toneMapped={false} />
          </mesh>
        )}
        {/* larger invisible hit target */}
        <mesh position-y={0.5 * k} visible={false}>
          <boxGeometry args={[0.45, 1.0 * k, 0.45]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}
