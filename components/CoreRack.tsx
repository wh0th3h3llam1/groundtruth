"use client";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, Line } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CaseFile, Claim, Evidence } from "@/lib/types";
import { STANCE_COLOR, TIER_H } from "./ui";

export interface RackProps {
  c: CaseFile;
  selectedClaim: string | null;
  selectedEvidence: string | null;
  onSelectClaim: (id: string | null) => void;
  onSelectEvidence: (id: string) => void;
  reducedMotion: boolean;
}

const R = 0.45;
const SPACING = 1.5;
const SLIVER = 0.035;

export function orderedLayers(c: CaseFile, claimId: string) {
  return c.evidence
    .filter((e) => e.claimId === claimId)
    .sort((a, b) => a.tier - b.tier || (b.isOrigin ? 1 : 0) - (a.isOrigin ? 1 : 0));
}

interface Hover { e: Evidence; x: number; y: number }

export default function CoreRack(props: RackProps) {
  const { c, reducedMotion } = props;
  const [hover, setHover] = useState<Hover | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // arm echo-collapse shortly after mount so the compression is visible
  const [armed, setArmed] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) { setArmed(true); return; }
    const t = setTimeout(() => setArmed(true), 1400);
    return () => clearTimeout(t);
  }, [reducedMotion]);

  const claims = c.claims;
  const width = Math.max(0, (claims.length - 1) * SPACING);
  const dist = Math.min(13, Math.max(6.5, width * 0.9 + 4));

  return (
    <div ref={wrap} className="relative w-full h-full" onPointerLeave={() => setHover(null)}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [1.5, 3.0, dist], fov: 40 }} gl={{ antialias: true }}
        onPointerMissed={() => props.onSelectClaim(null)} style={{ cursor: hover ? "pointer" : "grab" }}>
        <color attach="background" args={["#0E0E0C"]} />
        <fog attach="fog" args={["#0E0E0C", 10, 24]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[-8, 3.5, 4]} intensity={2.2} color="#fff2dc" castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
        <directionalLight position={[6, 6, -4]} intensity={0.25} color="#8fa0b0" />
        <group position={[-width / 2, 0, 0]}>
          {claims.map((cl, i) => (
            <Core key={cl.id} claim={cl} x={i * SPACING} index={i} {...props} armed={armed}
              onHover={(e, ev) => {
                const r = wrap.current?.getBoundingClientRect();
                setHover(ev && e && r ? { e: ev, x: e.nativeEvent.clientX - r.left, y: e.nativeEvent.clientY - r.top } : null);
              }} />
          ))}
        </group>
        <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#12120f" roughness={1} />
        </mesh>
        <gridHelper args={[40, 40, "#2A2925", "#1c1b18"]} position-y={0.001} />
        <OrbitControls target={[0, 1.0, 0]} enablePan={false} minDistance={4} maxDistance={14} minPolarAngle={0.5} maxPolarAngle={1.42}
          autoRotate={!reducedMotion} autoRotateSpeed={0.25} enableDamping />
      </Canvas>
      {hover && (
        <div className="pointer-events-none absolute z-10 bg-basalt/95 border border-line px-2 py-1.5 mono text-[11px] leading-snug max-w-[260px]"
          style={{ left: Math.max(0, Math.min(hover.x + 14, (wrap.current?.clientWidth ?? 400) - 270)), top: hover.y + 14 }}>
          <div className="text-bone">{hover.e.domain}</div>
          <div className="text-muted">
            T{hover.e.tier} · <span style={{ color: hover.e.stance === "contradicts" ? "#E4572E" : undefined }}>{hover.e.stance}</span>
            {hover.e.isOrigin ? " · origin" : " · rewrite"}{hover.e.selfInterest ? " · self-interest" : ""}
          </div>
          <div className="text-muted">engines: {hover.e.engines.join(", ") || "—"}</div>
        </div>
      )}
    </div>
  );
}

type CoreProps = RackProps & {
  claim: Claim; x: number; index: number; armed: boolean;
  onHover: (e: ThreeEvent<PointerEvent> | null, ev: Evidence | null) => void;
};

function Core({ claim, x, index, c, selectedClaim, selectedEvidence, onSelectClaim, onSelectEvidence, reducedMotion, armed, onHover }: CoreProps) {
  const layers = useMemo(() => orderedLayers(c, claim.id), [c, claim.id]);
  const score = c.scores[claim.id];
  const label = score?.label ?? "Pending";
  const hasOrigins = c.origins.some((o) => o.claimId === claim.id);
  const collapse = armed && hasOrigins;

  const group = useRef<THREE.Group>(null);
  const meshes = useRef<Record<string, THREE.Mesh | null>>({});
  const anim = useRef<Record<string, { h: number; drop: number; v: number }>>({});
  const fracture = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    let y = 0;
    for (const e of layers) {
      const th = collapse && !e.isOrigin ? SLIVER : TIER_H[e.tier];
      let a = anim.current[e.id];
      if (!a) a = anim.current[e.id] = { h: th, drop: reducedMotion ? 0 : 3, v: 0 };
      if (reducedMotion) { a.h = th; a.drop = 0; a.v = 0; }
      else {
        a.h += (th - a.h) * (1 - Math.exp(-d * 7)); // ~600ms settle
        const k = 120, damp = 13; // spring drop-in
        a.v += (-k * a.drop - damp * a.v) * d;
        a.drop += a.v * d;
      }
      const m = meshes.current[e.id];
      if (m) { m.scale.y = Math.max(a.h, 0.001); m.position.y = y + a.h / 2 + Math.max(a.drop, 0); }
      y += a.h;
    }
    const lift = selectedClaim === claim.id ? 0.25 : 0;
    if (group.current) group.current.position.y += (lift - group.current.position.y) * (reducedMotion ? 1 : 1 - Math.exp(-d * 10));
    if (fracture.current) fracture.current.position.y = y / 2;
    if (ring.current) ring.current.position.y = Math.max(y, 0.05) + 0.02;
  });

  const dim = selectedClaim !== null && selectedClaim !== claim.id;
  const hollow = label === "Self-reported only";
  const pending = label === "Pending";
  const conf = Math.round(score?.confidence ?? 0);
  const jag = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const rr = R + 0.012;
      pts.push([Math.cos(t) * rr, (i % 2 ? 0.08 : -0.08) * (0.6 + ((i * 37) % 5) / 10), Math.sin(t) * rr]);
    }
    pts[24] = pts[0];
    return pts;
  }, []);
  const shellH = Math.max(2.2, layers.reduce((s, e) => s + TIER_H[e.tier], 0));

  return (
    <group position={[x, 0, 0]}>
      <group ref={group}>
        <group onClick={(e) => { e.stopPropagation(); onSelectClaim(claim.id); }}>
          {layers.map((e) => {
            const sel = selectedEvidence === e.id;
            const op = (e.stance === "irrelevant" ? 0.35 : 1) * (hollow ? 0.55 : 1) * (dim ? 0.25 : 1);
            return (
              <mesh key={e.id} ref={(m) => { meshes.current[e.id] = m; }} castShadow receiveShadow position-y={20}
                onPointerOver={(ev) => { ev.stopPropagation(); onHover(ev, e); }}
                onPointerMove={(ev) => { ev.stopPropagation(); onHover(ev, e); }}
                onPointerOut={() => onHover(null, null)}
                onClick={(ev) => { ev.stopPropagation(); onSelectClaim(claim.id); onSelectEvidence(e.id); }}>
                <cylinderGeometry args={[R * (e.isOrigin ? 1 : 0.985), R * (e.isOrigin ? 1 : 0.985), 1, 40, 1]} />
                <meshStandardMaterial color={STANCE_COLOR[e.stance]} roughness={Math.min(0.55 + e.tier * 0.09, 1)} metalness={0.02}
                  transparent={op < 1} opacity={op} emissive={sel ? "#5B9DFF" : "#000000"} emissiveIntensity={sel ? 0.45 : 0} flatShading={e.tier >= 4} />
              </mesh>
            );
          })}
          {hollow && (
            <mesh position-y={shellH / 2}>
              <cylinderGeometry args={[R + 0.06, R + 0.06, shellH, 40, 1, true]} />
              <meshStandardMaterial color="#E8E2D4" transparent opacity={dim ? 0.1 : 0.35} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          )}
          {pending && (
            <mesh position-y={shellH / 2}>
              <cylinderGeometry args={[R + 0.04, R + 0.04, shellH, 20, 8, true]} />
              <meshBasicMaterial color="#8F897C" wireframe transparent opacity={dim ? 0.15 : 0.5} />
            </mesh>
          )}
        </group>
        {label === "Contested" && (
          <group ref={fracture}>
            <Line points={jag} color="#E4572E" lineWidth={2.5} />
            <mesh rotation-x={-Math.PI / 2 + 0.12}>
              <circleGeometry args={[R + 0.01, 40]} />
              <meshBasicMaterial color="#E4572E" transparent opacity={0.55} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          </group>
        )}
        <group ref={ring}>
          <mesh rotation-x={-Math.PI / 2}>
            <torusGeometry args={[R + 0.1, 0.008, 6, 64]} />
            <meshBasicMaterial color="#2A2925" />
          </mesh>
          {conf > 0 && (
            <mesh rotation-x={-Math.PI / 2}>
              <torusGeometry args={[R + 0.1, 0.022, 8, 64, (conf / 100) * Math.PI * 2]} />
              <meshBasicMaterial color="#5B9DFF" toneMapped={false} />
            </mesh>
          )}
        </group>
      </group>
      <Html position={[0, -0.25, 0.6]} center style={{ pointerEvents: "none" }} zIndexRange={[5, 0]}>
        <div className="mono whitespace-nowrap text-[11px] tracking-wider" style={{ color: dim ? "#5E6B78" : selectedClaim === claim.id ? "#5B9DFF" : "#E8E2D4" }}>
          C{index + 1} · {pending ? "—" : conf}
        </div>
      </Html>
    </group>
  );
}
