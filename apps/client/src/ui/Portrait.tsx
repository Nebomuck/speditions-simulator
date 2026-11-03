// Porträts für Spieler, Fahrer und Büropersonal (eigene SVG-Zeichnung, keine fremden Bilder).
// Spieler wählen ihr Aussehen im Charakter-Editor; Angestellte bekommen ein aus dem Namen abgeleitetes,
// stabiles Aussehen – Fahrer eher Arbeitskleidung, Büropersonal Hemd oder Sakko, Ältere öfter graue Haare.

import type { ReactNode } from 'react';
import type { AvatarLook } from '@spedsim/core';

export const SKIN = ['#fde3cf', '#f5d0b5', '#eab896', '#d69e78', '#b97c56', '#9a6747', '#7a4f35', '#5c3a26'];
export const HAIR = ['#1f1a17', '#3b2a20', '#5c3b25', '#8b5a2b', '#a0522d', '#c9a15b', '#e6cf96', '#9aa0a6', '#e5e7eb'];
export const EYE = ['#5b3a1e', '#8a6a2f', '#3f7d4e', '#3b82c4', '#6b7280'];
export const CLOTH = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#f87171', '#64748b', '#1e3a8a', '#0f766e', '#be185d', '#1f2937'];
const BG = ['#1e293b', '#0f3a4a', '#3b2f4a', '#3a3320', '#16352a', '#3a1f24'];

export type PortraitRole = 'player' | 'driver' | 'office';

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** stabiles Aussehen aus dem Namen (für Angestellte und Bewerber) */
export function seededLook(seed: string, role: PortraitRole = 'driver', age?: number): AvatarLook {
  let h = hash(seed);
  const next = (n: number) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return (h >>> 0) % n;
  };
  const old = (age ?? 35) >= 50;
  const hair = old && next(10) < 3 ? 11 : next(11);
  const look: AvatarLook = {
    skin: next(8),
    hair,
    hairColor: old && next(10) < 6 ? 7 + next(2) : next(7),
    shirt: next(10),
    face: next(3),
    eyes: next(4),
    eyeColor: next(5),
    brows: next(3),
    mouth: next(4),
    beard: next(10) < 6 ? 0 : 1 + next(4),
    glasses: next(10) < (old ? 5 : 2) ? 1 + next(2) : 0,
    outfit: role === 'driver' ? [0, 4, 5, 6, 3][next(5)] : role === 'office' ? [1, 2, 6, 0][next(4)] : next(7),
    accessory: role === 'driver' ? (next(10) < 2 ? 1 : next(20) === 0 ? 4 : 0) : role === 'office' ? (next(10) < 2 ? 3 : next(10) < 1 ? 2 : 0) : 0,
    bg: next(6),
  };
  return look;
}

/** Haare hinter dem Kopf (lange Frisuren) */
function HairBack({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 5: // Bob
      return <path d="M27 44 Q26 22 50 20 Q74 22 73 44 L74 66 Q66 70 60 66 L40 66 Q34 70 26 66 Z" fill={color} />;
    case 6: // lang
      return <path d="M26 44 Q25 20 50 19 Q75 20 74 44 L77 86 Q66 90 58 84 L42 84 Q34 90 23 86 Z" fill={color} />;
    case 7: // Zopf
      return <path d="M66 40 Q82 46 78 70 Q76 80 70 84 Q74 66 64 50 Z" fill={color} />;
    case 9: // Afro
      return <circle cx={50} cy={40} r={30} fill={color} />;
    default:
      return null;
  }
}

/** Haare über der Stirn */
function HairFront({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // Glatze
      return <path d="M34 30 Q50 20 66 30" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={3} fill="none" />;
    case 1: // sehr kurz
      return <path d="M29 40 Q28 21 50 20 Q72 21 71 40 Q68 30 50 29 Q32 30 29 40 Z" fill={color} opacity={0.85} />;
    case 2: // Seitenscheitel
      return <path d="M28 44 Q26 19 50 18 Q75 19 72 44 Q70 32 62 30 Q50 34 38 28 Q31 32 28 44 Z" fill={color} />;
    case 3: // Tolle
      return <path d="M28 42 Q27 22 44 16 Q56 10 66 16 Q74 22 72 42 Q68 30 58 28 Q44 30 34 30 Q30 34 28 42 Z" fill={color} />;
    case 4: // Locken kurz
      return (
        <g fill={color}>
          {[30, 37, 44, 51, 58, 65, 70].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 24 : 27} r={7} />)}
          <rect x={27} y={26} width={46} height={8} />
        </g>
      );
    case 5: // Bob: Pony
      return <path d="M27 46 Q26 20 50 19 Q74 20 73 46 Q70 30 60 28 Q52 33 40 29 Q30 32 27 46 Z" fill={color} />;
    case 6: // lang: Mittelscheitel
      return <path d="M27 50 Q25 20 50 19 Q75 20 73 50 Q70 30 52 25 L50 22 L48 25 Q30 30 27 50 Z" fill={color} />;
    case 7: // Zopf: zurückgekämmt
      return <path d="M28 42 Q27 20 50 19 Q73 20 72 42 Q68 27 50 26 Q32 27 28 42 Z" fill={color} />;
    case 8: // Dutt
      return (
        <g fill={color}>
          <circle cx={50} cy={14} r={9} />
          <path d="M28 42 Q27 20 50 19 Q73 20 72 42 Q68 27 50 26 Q32 27 28 42 Z" />
        </g>
      );
    case 9: // Afro: Haaransatz
      return <path d="M28 40 Q30 24 50 23 Q70 24 72 40 Q64 30 50 30 Q36 30 28 40 Z" fill={color} />;
    case 10: // Undercut
      return (
        <g>
          <path d="M29 42 Q28 30 33 26 L36 40 Z" fill={color} opacity={0.6} />
          <path d="M71 42 Q72 30 67 26 L64 40 Z" fill={color} opacity={0.6} />
          <path d="M34 30 Q36 14 54 14 Q70 16 68 30 Q58 24 46 26 Q38 26 34 30 Z" fill={color} />
        </g>
      );
    case 11: // Geheimratsecken
      return (
        <g fill={color}>
          <path d="M28 46 Q27 30 34 26 L36 40 Q32 42 28 46 Z" />
          <path d="M72 46 Q73 30 66 26 L64 40 Q68 42 72 46 Z" />
          <path d="M44 24 Q50 21 56 24 Q50 26 44 24 Z" opacity={0.7} />
        </g>
      );
    default:
      return null;
  }
}

function Face({ face, skin }: { face: number; skin: string }) {
  if (face === 1) return <ellipse cx={50} cy={44} rx={20} ry={25} fill={skin} />;
  if (face === 2) return <path d="M29 38 Q29 18 50 18 Q71 18 71 38 L70 52 Q66 66 50 69 Q34 66 30 52 Z" fill={skin} />;
  return <ellipse cx={50} cy={44} rx={22} ry={24} fill={skin} />;
}

function Eyes({ kind, color }: { kind: number; color: string }) {
  const eye = (x: number) => {
    switch (kind) {
      case 1: // mandelförmig
        return (
          <g key={x}>
            <path d={`M${x - 5} 46 Q${x} 41.5 ${x + 5} 46 Q${x} 49.5 ${x - 5} 46 Z`} fill="#ffffff" />
            <circle cx={x} cy={45.8} r={2.2} fill={color} />
            <circle cx={x} cy={45.8} r={1} fill="#111827" />
          </g>
        );
      case 2: // verschmitzt
        return <path key={x} d={`M${x - 4.5} 46.5 Q${x} 42.5 ${x + 4.5} 46.5`} stroke="#1f2937" strokeWidth={1.8} fill="none" strokeLinecap="round" />;
      case 3: // müde Lider
        return (
          <g key={x}>
            <ellipse cx={x} cy={46} rx={4.2} ry={3} fill="#ffffff" />
            <circle cx={x} cy={46.6} r={2.1} fill={color} />
            <circle cx={x} cy={46.6} r={1} fill="#111827" />
            <path d={`M${x - 4.6} 45 Q${x} 42.6 ${x + 4.6} 45 L${x + 4.6} 45.4 L${x - 4.6} 45.4 Z`} fill="rgba(0,0,0,0.25)" />
          </g>
        );
      default: // rund
        return (
          <g key={x}>
            <ellipse cx={x} cy={46} rx={4} ry={3.4} fill="#ffffff" />
            <circle cx={x} cy={46} r={2.3} fill={color} />
            <circle cx={x} cy={46} r={1.1} fill="#111827" />
            <circle cx={x + 0.8} cy={45.2} r={0.5} fill="#ffffff" />
          </g>
        );
    }
  };
  return <g>{eye(41)}{eye(59)}</g>;
}

function Brows({ kind, color }: { kind: number; color: string }) {
  const w = kind === 2 ? 2.6 : 1.6;
  const d = (x: number, dir: 1 | -1) =>
    kind === 1 ? `M${x - 5 * dir} 40 Q${x} 36.5 ${x + 5 * dir} 39.5` : `M${x - 5 * dir} 40 L${x + 5 * dir} 39`;
  return (
    <g stroke={color} strokeWidth={w} strokeLinecap="round" fill="none">
      <path d={d(41, 1)} />
      <path d={d(59, -1)} />
    </g>
  );
}

function Mouth({ kind }: { kind: number }) {
  switch (kind) {
    case 1:
      return <path d="M44 58.5 L56 58.5" stroke="#7f1d1d" strokeWidth={1.8} strokeLinecap="round" />;
    case 2:
      return (
        <g>
          <path d="M42.5 56.5 Q50 64 57.5 56.5 Z" fill="#7f1d1d" />
          <path d="M44 57 Q50 59 56 57 L55.5 58 Q50 59.6 44.5 58 Z" fill="#ffffff" />
        </g>
      );
    case 3:
      return <path d="M44 58.5 Q51 61 56.5 56.5" stroke="#7f1d1d" strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    default:
      return <path d="M43.5 57 Q50 62.5 56.5 57" stroke="#7f1d1d" strokeWidth={1.9} fill="none" strokeLinecap="round" />;
  }
}

function Beard({ kind, color }: { kind: number; color: string }) {
  switch (kind) {
    case 1: // Dreitagebart
      return <path d="M30 50 Q31 66 50 69 Q69 66 70 50 Q66 60 58 62 Q50 64 42 62 Q34 60 30 50 Z" fill={color} opacity={0.28} />;
    case 2: // Schnurrbart
      return <path d="M42 55 Q46 52.5 50 54.5 Q54 52.5 58 55 Q55 57.5 50 56 Q45 57.5 42 55 Z" fill={color} />;
    case 3: // Vollbart
      return <path d="M29 46 Q29 68 50 72 Q71 68 71 46 Q68 56 62 58 Q58 54 50 54.5 Q42 54 38 58 Q32 56 29 46 Z M45 58.5 Q50 61 55 58.5 Q50 63 45 58.5 Z" fill={color} fillRule="evenodd" />;
    case 4: // Kinnbart
      return <path d="M44 62 Q50 72 56 62 Q53 65.5 50 65.5 Q47 65.5 44 62 Z" fill={color} />;
    default:
      return null;
  }
}

function Glasses({ kind }: { kind: number }) {
  if (!kind) return null;
  const sun = kind === 3;
  const lens = (x: number) =>
    kind === 1 ? <circle key={x} cx={x} cy={46} r={6} /> : <rect key={x} x={x - 6.5} y={41.5} width={13} height={9} rx={2} />;
  return (
    <g stroke="#111827" strokeWidth={1.4} fill={sun ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.12)'}>
      {lens(41)}
      {lens(59)}
      <path d="M47 46 Q50 44 53 46" fill="none" />
      <path d="M34.5 45 L29 43.5 M65.5 45 L71 43.5" fill="none" />
    </g>
  );
}

function Outfit({ kind, color }: { kind: number; color: string }) {
  const torso = 'M14 100 Q16 80 34 76 L42 73 Q50 78 58 73 L66 76 Q84 80 86 100 Z';
  const base = <path d={torso} fill={color} />;
  switch (kind) {
    case 1: // Hemd mit Krawatte
      return (
        <g>
          <path d={torso} fill="#f8fafc" />
          <path d="M42 73 L50 82 L58 73 L55 71 L50 76 L45 71 Z" fill="#e2e8f0" />
          <path d="M48 80 L52 80 L54 98 L50 100 L46 98 Z" fill={color} />
        </g>
      );
    case 2: // Sakko
      return (
        <g>
          {base}
          <path d="M42 73 L50 92 L58 73 Q55 74 50 79 Q45 74 42 73 Z" fill="#f8fafc" />
          <path d="M42 73 L38 86 L48 90 Z M58 73 L62 86 L52 90 Z" fill="rgba(0,0,0,0.22)" />
          <circle cx={50} cy={95} r={1.2} fill="rgba(0,0,0,0.4)" />
        </g>
      );
    case 3: // Kapuzenpullover
      return (
        <g>
          {base}
          <path d="M34 76 Q50 92 66 76 Q60 84 50 85 Q40 84 34 76 Z" fill="rgba(0,0,0,0.2)" />
          <path d="M46 84 L45 94 M54 84 L55 94" stroke="#f8fafc" strokeWidth={1.2} />
        </g>
      );
    case 4: // Arbeitsjacke
      return (
        <g>
          {base}
          <path d="M50 76 L50 100" stroke="rgba(0,0,0,0.35)" strokeWidth={1.2} />
          <rect x={33} y={86} width={10} height={7} rx={1} fill="rgba(0,0,0,0.18)" />
          <rect x={57} y={86} width={10} height={7} rx={1} fill="rgba(0,0,0,0.18)" />
          <path d="M42 73 L46 79 L50 76 L54 79 L58 73" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={1.2} />
        </g>
      );
    case 5: // Warnweste
      return (
        <g>
          {base}
          <path d="M30 78 L42 73 L46 100 L24 100 Q24 86 30 78 Z M70 78 L58 73 L54 100 L76 100 Q76 86 70 78 Z" fill="#facc15" />
          <path d="M27 90 L45 90 M55 90 L73 90" stroke="#e5e7eb" strokeWidth={2.4} />
        </g>
      );
    case 6: // Pullover
      return (
        <g>
          {base}
          <path d="M41 73 Q50 80 59 73" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={2.4} />
          <path d="M18 98 L82 98" stroke="rgba(0,0,0,0.18)" strokeWidth={3} />
        </g>
      );
    default: // Polohemd
      return (
        <g>
          {base}
          <path d="M42 73 L46 80 L50 76 L54 80 L58 73 L55 71 L50 75 L45 71 Z" fill="rgba(255,255,255,0.35)" />
          <circle cx={50} cy={83} r={0.9} fill="rgba(0,0,0,0.4)" />
        </g>
      );
  }
}

function Accessory({ kind, color, hairStyle }: { kind: number; color: string; hairStyle: number }) {
  switch (kind) {
    case 1: // Kappe
      return (
        <g>
          <path d="M27 34 Q28 15 50 15 Q72 15 73 34 Z" fill={color} />
          <path d="M24 34 Q50 28 82 35 Q80 38 72 37 Q50 33 26 37 Z" fill="rgba(0,0,0,0.35)" />
          <circle cx={50} cy={16} r={1.6} fill="rgba(0,0,0,0.3)" />
        </g>
      );
    case 2: // Ohrringe
      return (
        <g fill="#facc15">
          <circle cx={28.5} cy={55} r={1.8} />
          <circle cx={71.5} cy={55} r={1.8} />
        </g>
      );
    case 3: // Headset
      return (
        <g>
          <path d={hairStyle === 9 ? 'M22 44 Q22 8 50 8 Q78 8 78 44' : 'M27 44 Q26 16 50 15 Q74 16 73 44'} fill="none" stroke="#1f2937" strokeWidth={2.4} />
          <rect x={23} y={41} width={6} height={10} rx={2.5} fill="#1f2937" />
          <path d="M26 50 Q30 60 42 60" fill="none" stroke="#1f2937" strokeWidth={1.4} />
          <circle cx={42.5} cy={60} r={1.8} fill="#1f2937" />
        </g>
      );
    case 4: // Mütze
      return (
        <g>
          <path d="M27 36 Q27 13 50 13 Q73 13 73 36 Z" fill={color} />
          <rect x={26} y={31} width={48} height={7} rx={3} fill="rgba(0,0,0,0.25)" />
          <circle cx={50} cy={11} r={4} fill={color} />
        </g>
      );
    default:
      return null;
  }
}

export function Portrait({ look, size = 36, title }: { look: AvatarLook; size?: number; title?: string }) {
  const skin = SKIN[look.skin % SKIN.length];
  const hair = HAIR[look.hairColor % HAIR.length];
  const cloth = CLOTH[look.shirt % CLOTH.length];
  const style = look.hair % 12;
  const acc = look.accessory ?? 0;
  // Kappe/Mütze verdecken die Frisur oben
  const covered = acc === 1 || acc === 4;
  const parts: ReactNode[] = [
    <rect key="bg" width={100} height={100} fill={BG[(look.bg ?? 0) % BG.length]} />,
    <HairBack key="hb" style={covered && style !== 6 && style !== 5 ? -1 : style} color={hair} />,
    <Outfit key="o" kind={look.outfit ?? 0} color={cloth} />,
    <path key="n" d="M43 62 L43 76 Q50 80 57 76 L57 62 Z" fill={skin} />,
    <path key="ns" d="M43 68 Q50 73 57 68 L57 66 L43 66 Z" fill="rgba(0,0,0,0.12)" />,
    <ellipse key="el" cx={28.5} cy={48} rx={3.5} ry={5} fill={skin} />,
    <ellipse key="er" cx={71.5} cy={48} rx={3.5} ry={5} fill={skin} />,
    <Face key="f" face={look.face ?? 0} skin={skin} />,
    <ellipse key="c1" cx={36} cy={54} rx={4} ry={2.4} fill="#f43f5e" opacity={0.12} />,
    <ellipse key="c2" cx={64} cy={54} rx={4} ry={2.4} fill="#f43f5e" opacity={0.12} />,
    <Beard key="b" kind={look.beard ?? 0} color={hair} />,
    <Eyes key="e" kind={look.eyes ?? 0} color={EYE[(look.eyeColor ?? 0) % EYE.length]} />,
    <Brows key="br" kind={look.brows ?? 0} color={look.hairColor >= 7 ? '#6b7280' : hair} />,
    <path key="no" d="M50 47 Q48 53 47 54.5 Q50 56 53 54.5" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={1.3} strokeLinecap="round" />,
    <Mouth key="m" kind={look.mouth ?? 0} />,
    !covered ? <HairFront key="hf" style={style} color={hair} /> : <HairFront key="hf" style={style === 5 || style === 6 ? style : -1} color={hair} />,
    <Glasses key="g" kind={look.glasses ?? 0} />,
    <Accessory key="a" kind={acc} color={cloth} hairStyle={style} />,
  ];
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? 'Porträt'}>
      {title && <title>{title}</title>}
      {parts}
    </svg>
  );
}

/** Porträt eines Spielers (gewähltes Aussehen) oder einer Person mit abgeleitetem Aussehen (`seed`) */
export function Avatar({ seed, size = 36, avatar, role = 'driver', age }: { seed?: string; size?: number; avatar?: AvatarLook; role?: PortraitRole; age?: number }) {
  return <Portrait look={avatar ?? seededLook(seed ?? '', role, age)} size={size} title={seed} />;
}
