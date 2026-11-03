// Wiederverwendbare UI-Bausteine.

import { useEffect, useState, type ReactNode } from 'react';
import { X, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { formatMoney, type Issue } from '@spedsim/core';

export function Money({ value, colored = false, cents = false }: { value: number; colored?: boolean; cents?: boolean }) {
  const cls = colored ? (value > 0 ? 'pos' : value < 0 ? 'neg' : '') : '';
  return <span className={`nowrap ${cls}`}>{formatMoney(value, cents)}</span>;
}

export function Card({ title, sub, actions, children, className = '', style }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`card ${className}`} style={style}>
      {title && (
        <div className="card-title">
          {title}
          {sub && <span className="sub">{sub}</span>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">
        {icon}
        {label}
      </div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Badge({ kind = '', children, title }: { kind?: '' | 'info' | 'success' | 'warning' | 'danger' | 'violet'; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${kind}`} title={title}>
      {children}
    </span>
  );
}

export function Bar({ value, invert = false }: { value: number; invert?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const q = invert ? 100 - v : v;
  const cls = q >= 60 ? 'good' : q >= 35 ? 'mid' : 'bad';
  return (
    <div className={`bar ${cls}`} title={`${Math.round(v)} %`}>
      <div style={{ width: `${v}%` }} />
    </div>
  );
}

export function Modal({ title, onClose, children, footer, width }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <div className="spacer" />
          <button className="icon-btn" onClick={onClose} title="Schließen (Esc)">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function IssueList({ issues, okText }: { issues: Issue[]; okText?: string }) {
  if (!issues.length && okText)
    return (
      <div className="issues">
        <div className="issue ok">
          <CheckCircle2 size={16} /> {okText}
        </div>
      </div>
    );
  return (
    <div className="issues">
      {issues.map((i, k) => (
        <div key={k} className={`issue ${i.level}`}>
          {i.level === 'error' ? <XCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{i.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Sortierbare Tabellenüberschrift */
export function useSort<K extends string>(initial: K, initialDir: 1 | -1 = -1) {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<1 | -1>(initialDir);
  const th = (k: K, label: ReactNode, className = '') => (
    <th
      className={`sortable ${className}`}
      onClick={() => {
        if (k === key) setDir((d) => (d === 1 ? -1 : 1));
        else {
          setKey(k);
          setDir(-1);
        }
      }}
    >
      {label}
      {k === key ? (dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  return { key, dir, th };
}

/** 2D-Avatar aus einfachen SVG-Formen (eigene Grafik). */
export { Avatar } from './Portrait.tsx';

/** Kleines Liniendiagramm (SVG). */
export function LineChart({ series, height = 160, format }: { series: { label: string; color: string; values: number[] }[]; height?: number; format?: (v: number) => string }) {
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) return <Empty>Noch zu wenige Daten – Statistiken entstehen mit jedem Spieltag.</Empty>;
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const n = Math.max(...series.map((s) => s.values.length));
  const W = 600;
  const H = height;
  const pad = 4;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
        {min < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeDasharray="4 4" />}
        {series.map((s) => (
          <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i className="dot" style={{ background: s.color }} />
            {s.label}
            {format && s.values.length ? `: ${format(s.values[s.values.length - 1])}` : ''}
          </span>
        ))}
        {format && <span className="dim" style={{ marginLeft: 'auto' }}>Max {format(max)}</span>}
      </div>
    </div>
  );
}
