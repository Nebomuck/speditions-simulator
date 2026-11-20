// Firmenlogo aus der Lackierung: einfache Form mit Kürzel. Als eigenständiges SVG oder eingebettet in
// Fahrzeugillustrationen (x/y/size im Koordinatensystem des umgebenden SVG).

import type { Livery, LogoShape } from '@spedsim/core';

const SHAPE: Record<LogoShape, string> = {
  circle: 'M50 4 A46 46 0 1 1 49.9 4 Z',
  shield: 'M50 4 L92 16 L92 48 Q92 80 50 96 Q8 80 8 48 L8 16 Z',
  diamond: 'M50 2 L98 50 L50 98 L2 50 Z',
  square: 'M14 6 L86 6 Q94 6 94 14 L94 86 Q94 94 86 94 L14 94 Q6 94 6 86 L6 14 Q6 6 14 6 Z',
  arrow: 'M4 22 L64 22 L64 6 L96 50 L64 94 L64 78 L4 78 Z',
};

/** helle Grundfarbe → dunkle Schrift */
const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
};

export function CompanyLogo({ livery: l, size = 28, x, y, title, className }: { livery: Livery; size?: number; x?: number; y?: number; title?: string; className?: string }) {
  const text = l.initials || '?';
  const fs = text.length >= 3 ? 30 : text.length === 2 ? 38 : 48;
  const textColor = l.secondary.toLowerCase() === l.primary.toLowerCase() ? (isLight(l.primary) ? '#111827' : '#ffffff') : l.secondary;
  return (
    <svg className={className} viewBox="0 0 100 100" width={size} height={size} x={x} y={y} role="img" aria-label={title ?? `Logo ${text}`}>
      {title && <title>{title}</title>}
      <path d={SHAPE[l.shape] ?? SHAPE.shield} fill={l.primary} stroke={isLight(l.primary) ? '#94a3b8' : l.secondary} strokeWidth={4} />
      <text
        x={l.shape === 'arrow' ? 44 : 50} y={l.shape === 'shield' ? 54 : 51} textAnchor="middle" dominantBaseline="central"
        fontFamily="Inter, Segoe UI, sans-serif" fontWeight={800} fontSize={fs} fill={textColor} letterSpacing={-1}
      >
        {text}
      </text>
    </svg>
  );
}
