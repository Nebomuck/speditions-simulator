// Eigene Fahrzeugillustrationen (SVG, Seitenansicht): Zugmaschinen der vier fiktiven Hersteller,
// Solo-LKW, Transporter und alle Aufliegertypen. Kabinenform und Farbe hängen vom Hersteller ab,
// Hochdach von der Modellreihe. Keine fremden Bilddateien.

import type { ReactNode } from 'react';
import { TRUCK_BY_ID, type TrailerType } from '@spedsim/core';

const MAKER: Record<string, { color: string; dark: string; shape: 'box' | 'aero' | 'angled' | 'classic' }> = {
  Nordwal: { color: '#2563eb', dark: '#1e3a8a', shape: 'box' },
  Velkor: { color: '#e2e8f0', dark: '#64748b', shape: 'aero' },
  Brennkraft: { color: '#dc2626', dark: '#7f1d1d', shape: 'angled' },
  Trasko: { color: '#16a34a', dark: '#14532d', shape: 'classic' },
};

const GROUND = 60;
const TIRE = '#1f2937';

function Wheel({ x, r = 7 }: { x: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={GROUND - r} r={r} fill={TIRE} />
      <circle cx={x} cy={GROUND - r} r={r * 0.5} fill="#9ca3af" />
      <circle cx={x} cy={GROUND - r} r={r * 0.18} fill="#4b5563" />
    </g>
  );
}

/** Fahrerhaus mit Front bei x = x0 (nach links), Rückwand bei x0 + 38 */
function Cab({ x0, maker, high }: { x0: number; maker: string; high: boolean }) {
  const m = MAKER[maker] ?? MAKER.Nordwal;
  const top = high ? 6 : m.shape === 'classic' ? 16 : 13;
  const bottom = 46;
  const back = x0 + 38;
  let body: string;
  switch (m.shape) {
    case 'aero':
      body = `M${x0 + 2} ${bottom} L${x0} ${top + 16} Q${x0 + 1} ${top} ${x0 + 16} ${top} L${back} ${top} L${back} ${bottom} Z`;
      break;
    case 'angled':
      body = `M${x0 + 1} ${bottom} L${x0} ${top + 18} L${x0 + 7} ${top} L${back} ${top} L${back} ${bottom} Z`;
      break;
    case 'classic':
      body = `M${x0} ${bottom} L${x0} ${top + 3} Q${x0} ${top} ${x0 + 3} ${top} L${back - 2} ${top} L${back - 2} ${bottom} Z`;
      break;
    default:
      body = `M${x0 + 1} ${bottom} L${x0} ${top + 4} Q${x0 + 1} ${top} ${x0 + 5} ${top} L${back} ${top} L${back} ${bottom} Z`;
  }
  const wsTop = top + (high ? 12 : 6);
  return (
    <g>
      <path d={body} fill={m.color} stroke={m.dark} strokeWidth={1} />
      {/* Windschutzscheibe und Seitenfenster */}
      <path d={`M${x0 + 2} ${wsTop + 14} L${x0 + (m.shape === 'angled' ? 5 : 3)} ${wsTop} L${x0 + 9} ${wsTop} L${x0 + 9} ${wsTop + 14} Z`} fill="#93c5fd" opacity={0.85} />
      <rect x={x0 + 12} y={wsTop} width={14} height={11} rx={1.5} fill="#bfdbfe" opacity={0.9} />
      {/* Tür, Griff, Trittstufen */}
      <path d={`M${x0 + 10} ${wsTop - 1} V${bottom - 2} H${x0 + 29} V${wsTop - 1}`} fill="none" stroke={m.dark} strokeWidth={0.8} opacity={0.7} />
      <rect x={x0 + 25} y={wsTop + 13} width={3} height={1.2} fill={m.dark} />
      <rect x={x0 + 12} y={bottom - 4} width={10} height={1.5} fill={m.dark} opacity={0.6} />
      {/* Kühlergrill, Stoßfänger, Scheinwerfer */}
      <rect x={x0 - 0.5} y={bottom - 12} width={3} height={8} fill={m.dark} />
      <rect x={x0 - 1.5} y={bottom - 4} width={10} height={4} rx={1} fill="#374151" />
      <rect x={x0 - 1} y={bottom - 7} width={4} height={2.5} rx={0.8} fill="#fef3c7" />
      {/* Spiegel */}
      <rect x={x0 - 3} y={wsTop + 1} width={2} height={7} rx={0.8} fill="#374151" />
      {high && <rect x={x0 + 14} y={top + 3} width={18} height={4} rx={1} fill={m.dark} opacity={0.25} />}
      {/* Herstellerkürzel */}
      <text x={x0 + 31} y={bottom - 6} fontSize={4.2} fontWeight={700} fill={m.dark} textAnchor="middle" fontFamily="system-ui, sans-serif">{maker.slice(0, 3).toUpperCase()}</text>
    </g>
  );
}

/** Zugmaschine; Kupplung (Sattelplatte) bei x ≈ 68 */
function Tractor({ maker, high }: { maker: string; high: boolean }) {
  return (
    <g>
      <rect x={6} y={44} width={82} height={5} rx={1} fill="#374151" />
      <rect x={42} y={18} width={3} height={26} rx={1} fill="#9ca3af" />
      <rect x={54} y={40} width={26} height={3} rx={1} fill="#4b5563" />
      <rect x={44} y={45} width={10} height={6} rx={1.5} fill="#6b7280" />
      <path d="M62 44 h26 v-4 a8 8 0 0 0 -8 -4 h-10 a8 8 0 0 0 -8 4 z" fill="#111827" opacity={0.85} />
      <Cab x0={2} maker={maker} high={high} />
      <Wheel x={18} />
      <Wheel x={74} />
    </g>
  );
}

const STRAPS = (x0: number, x1: number, y0: number, y1: number, step: number, color: string) => {
  const out: ReactNode[] = [];
  for (let x = x0 + step / 2; x < x1; x += step) out.push(<line key={x} x1={x} x2={x} y1={y0} y2={y1} stroke={color} strokeWidth={0.8} />);
  return out;
};

/** Aufbau eines Aufliegers bzw. Solo-LKW zwischen x0 und x1; Unterkante 44 */
function Body({ type, x0, x1, seed = 0 }: { type: TrailerType; x0: number; x1: number; seed?: number }) {
  const w = x1 - x0;
  const top = 8;
  const h = 44 - top;
  switch (type) {
    case 'curtain':
      return (
        <g>
          <rect x={x0} y={top} width={w} height={h} rx={1.5} fill="#cbd5e1" stroke="#64748b" strokeWidth={1} />
          {STRAPS(x0, x1, top + 2, 43, 13, '#94a3b8')}
          <rect x={x0} y={top} width={w} height={3} fill="#64748b" />
          <rect x={x0} y={41} width={w} height={3} fill="#475569" />
        </g>
      );
    case 'box':
    case 'reefer':
      return (
        <g>
          <rect x={x0} y={top} width={w} height={h} rx={1.5} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} />
          {STRAPS(x0, x1, top + 1, 43, 40, '#e2e8f0')}
          <line x1={x1 - 3} x2={x1 - 3} y1={top + 2} y2={42} stroke="#94a3b8" strokeWidth={0.8} />
          {type === 'reefer' && (
            <g>
              <rect x={x0 - 6} y={top + 4} width={7} height={18} rx={1.5} fill="#e5e7eb" stroke="#6b7280" strokeWidth={0.8} />
              <path d={`M${x0 + 14} ${top + 12} l4 0 M${x0 + 16} ${top + 10} l0 4 M${x0 + 14.6} ${top + 10.6} l2.8 2.8 M${x0 + 17.4} ${top + 10.6} l-2.8 2.8`} stroke="#38bdf8" strokeWidth={0.9} />
            </g>
          )}
          <rect x={x0} y={41} width={w} height={3} fill="#64748b" />
        </g>
      );
    case 'walkingfloor':
      return (
        <g>
          <rect x={x0} y={top - 4} width={w} height={h + 4} rx={1.5} fill="#d1d5db" stroke="#6b7280" strokeWidth={1} />
          {STRAPS(x0, x1, top - 3, 43, 6, '#9ca3af')}
          <rect x={x0} y={41} width={w} height={3} fill="#4b5563" />
        </g>
      );
    case 'container': {
      const colors = ['#b45309', '#1d4ed8', '#15803d', '#7c2d12', '#334155'];
      const c = colors[Math.abs(seed) % colors.length];
      return (
        <g>
          <rect x={x0} y={42} width={w} height={3} fill="#374151" />
          <rect x={x0 + 2} y={top + 2} width={w - 4} height={h - 3} fill={c} stroke="#111827" strokeWidth={0.8} />
          {STRAPS(x0 + 2, x1 - 2, top + 4, 40, 3, 'rgba(0,0,0,0.25)')}
          <rect x={x1 - 10} y={top + 4} width={6} height={h - 7} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
        </g>
      );
    }
    case 'tanker':
      return (
        <g>
          <rect x={x0} y={42} width={w} height={3} fill="#374151" />
          <rect x={x0 + 2} y={top + 6} width={w - 4} height={h - 6} rx={14} fill="#e5e7eb" stroke="#6b7280" strokeWidth={1} />
          <rect x={x0 + 6} y={top + 13} width={w - 12} height={2} fill="#cbd5e1" />
          {[0.3, 0.55, 0.8].map((f) => <rect key={f} x={x0 + w * f - 3} y={top + 3} width={6} height={3} rx={1} fill="#9ca3af" />)}
          <rect x={x1 - 18} y={top + 22} width={12} height={8} fill="#f97316" stroke="#111827" strokeWidth={0.6} />
          <line x1={x1 - 18} x2={x1 - 6} y1={top + 26} y2={top + 26} stroke="#111827" strokeWidth={0.6} />
        </g>
      );
    case 'tipper':
      return (
        <g>
          <rect x={x0} y={42} width={w} height={3} fill="#374151" />
          <path d={`M${x0 + 2} ${top + 6} L${x1 - 2} ${top + 6} L${x1 - 6} 42 L${x0 + 8} 42 Z`} fill="#a3a3a3" stroke="#525252" strokeWidth={1} />
          {STRAPS(x0 + 8, x1 - 6, top + 8, 41, 18, '#737373')}
          <path d={`M${x0 + 4} ${top + 6} q${w / 2 - 4} -7 ${w - 8} 0`} fill="#a16207" opacity={0.8} />
        </g>
      );
    case 'lowbed':
      return (
        <g>
          <path d={`M${x0} 30 H${x0 + 24} L${x0 + 34} 46 H${x1} V50 H${x0 + 30} L${x0 + 22} 34 H${x0} Z`} fill="#374151" />
          {/* Ladung: Baumaschine */}
          <g transform={`translate(${x0 + 52} 0)`}>
            <rect x={0} y={34} width={46} height={10} rx={4} fill="#1f2937" />
            <rect x={6} y={20} width={24} height={14} rx={2} fill="#eab308" />
            <rect x={20} y={22} width={8} height={7} fill="#bfdbfe" />
            <path d="M30 26 L52 10 L58 14 L38 30 Z" fill="#ca8a04" />
            <path d="M52 10 L64 22 L60 26 L50 16 Z" fill="#a16207" />
          </g>
        </g>
      );
    case 'cartransporter': {
      const car = (x: number, y: number, c: string) => (
        <g key={`${x}-${y}`}>
          <path d={`M${x} ${y} h24 v-4 q-2 -5 -8 -6 h-8 q-5 1 -8 6 z`} fill={c} />
          <rect x={x + 8} y={y - 9} width={8} height={3.5} fill="#bfdbfe" />
          <circle cx={x + 5} cy={y} r={2.2} fill={TIRE} />
          <circle cx={x + 19} cy={y} r={2.2} fill={TIRE} />
        </g>
      );
      const cols = ['#ef4444', '#3b82f6', '#f8fafc', '#111827', '#f59e0b', '#10b981'];
      const n = Math.floor((w - 6) / 30);
      return (
        <g>
          <rect x={x0} y={42} width={w} height={3} fill="#374151" />
          <rect x={x0} y={22} width={w} height={2} fill="#6b7280" />
          {STRAPS(x0, x1, 4, 42, 30, '#6b7280')}
          {Array.from({ length: n }, (_, i) => car(x0 + 4 + i * 30, 41, cols[(i + seed) % cols.length]))}
          {Array.from({ length: n }, (_, i) => car(x0 + 4 + i * 30, 21, cols[(i + seed + 3) % cols.length]))}
        </g>
      );
    }
  }
}

/** Sattelauflieger: Front bei x0, Länge 228; mit Stützbeinen, wenn nicht angekuppelt */
function Semitrailer({ type, x0, coupled, seed }: { type: TrailerType; x0: number; coupled: boolean; seed: number }) {
  const x1 = x0 + 228;
  const low = type === 'lowbed';
  return (
    <g>
      <Body type={type} x0={x0} x1={x1} seed={seed} />
      {!low && <rect x={x0 + 4} y={44} width={x1 - x0 - 8} height={3} fill="#1f2937" />}
      {!coupled && !low && <rect x={x0 + 40} y={46} width={3} height={GROUND - 46} fill="#4b5563" />}
      {coupled && <rect x={x0 + 14} y={44} width={6} height={3} fill="#111827" />}
      {[x1 - 38, x1 - 24, x1 - 10].map((x) => <Wheel key={x} x={x} r={low ? 5.5 : 7} />)}
      <rect x={x1 - 2} y={low ? 46 : 40} width={2.5} height={5} fill="#ef4444" />
    </g>
  );
}

function Svg({ w, h = 64, width, title, children }: { w: number; h?: number; width?: number; title: string; children: ReactNode }) {
  return (
    <svg className="vehicle-art" viewBox={`-6 0 ${w + 8} ${h}`} width={width} role="img" aria-label={title}>
      <title>{title}</title>
      <line x1={-6} x2={w + 2} y1={GROUND + 0.5} y2={GROUND + 0.5} stroke="var(--border-strong)" strokeWidth={1} />
      {children}
    </svg>
  );
}

/** Fahrzeugbild: Zugmaschine (optional mit Auflieger), Solo-LKW oder Transporter */
export function VehicleArt({ modelId, trailer, width = 140, seed = 0 }: { modelId: string; trailer?: TrailerType | null; width?: number; seed?: number }) {
  const m = TRUCK_BY_ID[modelId];
  if (!m) return null;
  const high = m.hp >= 480 || /Fernverkehr|Highline/.test(m.name);
  const title = `${m.maker} ${m.name}`;
  if (m.kind === 'van') {
    const c = MAKER[m.maker] ?? MAKER.Trasko;
    return (
      <Svg w={96} width={width} title={title}>
        <path d="M4 50 L4 30 Q6 18 18 16 L26 8 Q28 6 32 6 L88 6 Q92 6 92 10 L92 50 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} />
        <path d="M9 28 L20 18 L30 18 L30 28 Z" fill="#93c5fd" opacity={0.9} />
        <rect x={34} y={12} width={1} height={36} fill="#cbd5e1" />
        <rect x={4} y={36} width={88} height={4} fill={c.color} />
        <rect x={2} y={46} width={10} height={4} rx={1} fill="#374151" />
        <rect x={3} y={32} width={4} height={3} rx={1} fill="#fef3c7" />
        <Wheel x={20} r={6.5} />
        <Wheel x={76} r={6.5} />
      </Svg>
    );
  }
  if (m.kind === 'rigid') {
    return (
      <Svg w={170} width={width} title={title}>
        <rect x={6} y={44} width={160} height={5} rx={1} fill="#374151" />
        <Body type={m.body ?? 'box'} x0={44} x1={166} seed={seed} />
        <Cab x0={2} maker={m.maker} high={false} />
        <Wheel x={18} />
        <Wheel x={130} />
        {(m.payloadT ?? 0) > 6 && <Wheel x={146} />}
      </Svg>
    );
  }
  return (
    <Svg w={trailer ? 284 : 92} width={width} title={trailer ? `${title} mit Auflieger` : title}>
      <Tractor maker={m.maker} high={high} />
      {trailer && <Semitrailer type={trailer} x0={52} coupled seed={seed} />}
    </Svg>
  );
}

/** Einzelner Auflieger (abgestellt, auf Stützbeinen) */
export function TrailerArt({ type, width = 140, seed = 0 }: { type: TrailerType; width?: number; seed?: number }) {
  return (
    <Svg w={232} width={width} title="Auflieger">
      <Semitrailer type={type} x0={2} coupled={false} seed={seed} />
    </Svg>
  );
}

/** einfacher Zahlenwert aus einer ID (z. B. für die Containerfarbe) */
export const artSeed = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
