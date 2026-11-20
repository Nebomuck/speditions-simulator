// Firmenauftritt: Lackierung mit Logo-Editor und Marketing (Kampagnen, Messen, Online-Auftritt).

import { useEffect, useState } from 'react';
import { Megaphone, Palette, Globe, Presentation } from 'lucide-react';
import {
  CAMPAIGN_COST, CAMPAIGN_DAYS, CITY_BY_ID, COUNTRY_NAMES, FAIRS, FAIR_COOLDOWN_DAYS, FAIR_COST, LIVERY_COLORS, LOGO_SHAPES, MIN_PER_DAY, ONLINE_MONTHLY,
  fairBlock, formatDate, liveryOf, type Livery,
} from '@spedsim/core';
import { sendCommand, useGame } from '../game/store.ts';
import { Badge, Card, Money } from './components.tsx';
import { CompanyLogo } from './CompanyLogo.tsx';
import { VehicleArt } from './VehicleArt.tsx';

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {LIVERY_COLORS.map((c) => (
        <button key={c} className={`swatch ${value.toLowerCase() === c ? 'active' : ''}`} style={{ background: c }} title={c} onClick={() => onChange(c)} />
      ))}
      <label className="swatch custom" title="Eigene Farbe" style={{ background: LIVERY_COLORS.includes(value.toLowerCase()) ? undefined : value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

export function LiveryCard() {
  const s = useGame();
  const saved = liveryOf(s);
  const [draft, setDraft] = useState<Livery>(saved);
  const key = JSON.stringify(saved);
  useEffect(() => setDraft(saved), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== key || !s.company.livery;
  const set = (p: Partial<Livery>) => setDraft((d) => ({ ...d, ...p }));
  return (
    <Card title={<><Palette size={16} />Firmenlackierung</>} className="mb" sub="Farben und Logo erscheinen auf Fahrzeugen, Kartenmarkern, im Branchenblatt und in der Kopfleiste">
      <div className="livery-grid">
        <div className="livery-preview">
          <CompanyLogo livery={draft} size={88} />
          <VehicleArt modelId="nordwal-tx500" trailer="curtain" width={300} livery={draft} />
        </div>
        <div className="livery-form">
          <div className="field">
            <label>Grundfarbe</label>
            <Swatches value={draft.primary} onChange={(primary) => set({ primary })} />
          </div>
          <div className="field">
            <label>Zweitfarbe (Schrift, Zierstreifen)</label>
            <Swatches value={draft.secondary} onChange={(secondary) => set({ secondary })} />
          </div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Logoform</label>
              <div className="seg-mini shape-seg">
                {LOGO_SHAPES.map((sh) => <button key={sh.id} className={draft.shape === sh.id ? 'active' : ''} onClick={() => set({ shape: sh.id })}>{sh.name}</button>)}
              </div>
            </div>
            <div className="field" style={{ width: 110 }}>
              <label>Kürzel</label>
              <input className="input" maxLength={3} value={draft.initials} onChange={(e) => set({ initials: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="row">
            <button className="btn primary" disabled={!dirty || !draft.initials.trim()} onClick={() => sendCommand({ type: 'setLivery', livery: draft })}>{s.company.livery ? 'Lackierung übernehmen' : 'Firmenauftritt festlegen'}</button>
            {dirty && s.company.livery && <button className="btn" onClick={() => setDraft(saved)}>Zurücksetzen</button>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function MarketingCard() {
  const s = useGame();
  const m = s.company.marketing;
  const active = (m?.campaigns ?? []).filter((c) => c.until > s.time);
  const countries = [...new Set(Object.values(CITY_BY_ID).map((c) => c.country))].sort((a, b) => (COUNTRY_NAMES[a] ?? a).localeCompare(COUNTRY_NAMES[b] ?? b));
  const hqCountry = CITY_BY_ID[s.company.hqCityId]?.country ?? 'DE';
  const [country, setCountry] = useState(countries.find((c) => c !== hqCountry && !active.some((a) => a.country === c)) ?? hqCountry);
  const [fair, setFair] = useState(FAIRS[0].id);
  const block = fairBlock(s);
  const busy = active.some((a) => a.country === country);
  return (
    <Card title={<><Megaphone size={16} />Marketing</>} className="mb" sub="Bekanntheit bringt mehr und bessere Anfragen – gezielt in einem Land oder dauerhaft über das Netz">
      <div className="grid grid-3 marketing-grid">
        <div className="mk-box">
          <h4><Megaphone size={15} />Regionale Kampagne</h4>
          <p className="dim">{CAMPAIGN_DAYS} Tage Anzeigen und Kundenbesuche: doppelt so viele Börsenangebote aus dem Land, Angebote bleiben länger stehen, Preise +3 %.</p>
          <div className="row">
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              {countries.map((c) => <option key={c} value={c}>{COUNTRY_NAMES[c] ?? c}{active.some((a) => a.country === c) ? ' (läuft)' : ''}</option>)}
            </select>
            <button className="btn primary" disabled={busy} onClick={() => sendCommand({ type: 'startCampaign', country })}><Money value={CAMPAIGN_COST} /></button>
          </div>
          {active.length > 0 && (
            <div className="mk-active">
              {active.map((c) => <Badge key={c.id} kind="info">{COUNTRY_NAMES[c.country] ?? c.country} bis {formatDate(c.until)}</Badge>)}
            </div>
          )}
        </div>
        <div className="mk-box">
          <h4><Presentation size={15} />Messestand</h4>
          <p className="dim">Drei Tage am eigenen Stand: zwei neue Großkunden aus dem Messeland, ein Angebot für einen Rahmenvertrag und Ruf +3. Danach {FAIR_COOLDOWN_DAYS} Tage Pause.</p>
          <div className="row">
            <select className="input" value={fair} onChange={(e) => setFair(e.target.value)}>
              {FAIRS.map((f) => <option key={f.id} value={f.id}>{f.name} · {CITY_BY_ID[f.cityId]?.name}</option>)}
            </select>
            <button className="btn primary" disabled={!!block} title={block} onClick={() => sendCommand({ type: 'attendFair', fairId: fair })}><Money value={FAIR_COST} /></button>
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            {block ?? (m?.lastFair !== undefined ? `Letzter Auftritt am ${formatDate(m.lastFair)}` : 'Noch kein Messeauftritt')}
            {m?.fairs ? ` · ${m.fairs} Messe${m.fairs > 1 ? 'n' : ''} bisher` : ''}
          </div>
        </div>
        <div className="mk-box">
          <h4><Globe size={15} />Online-Auftritt</h4>
          <p className="dim">Website, Frachtportal und Bewertungen: 5 % mehr Anfragen insgesamt und jeden Monat etwas Ruf (bis 70).</p>
          <div className="row">
            {m?.online ? <Badge kind="success">aktiv</Badge> : <Badge>aus</Badge>}
            <span className="dim"><Money value={ONLINE_MONTHLY} /> im Monat</span>
            <div className="spacer" />
            <button className={`btn ${m?.online ? '' : 'primary'}`} onClick={() => sendCommand({ type: 'setOnlinePresence', on: !m?.online })}>{m?.online ? 'Beenden' : 'Starten'}</button>
          </div>
        </div>
      </div>
      {active.length > 0 && <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Laufende Kampagnen: {active.length} · Kosten bisher <Money value={active.reduce((a, c) => a + c.cost, 0)} /> · Ablauf frühestens {formatDate(Math.min(...active.map((c) => c.until)))} ({Math.ceil((Math.min(...active.map((c) => c.until)) - s.time) / MIN_PER_DAY)} Tage)</div>}
    </Card>
  );
}
