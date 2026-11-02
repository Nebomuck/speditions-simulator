// Privatleben (Grundlage der Lebenssimulation, Phase 8): Charakter, Privatkonto, Geschäftsführergehalt.

import { useState } from 'react';
import { Home } from 'lucide-react';
import { PRIVATE_LIVING_COST, formatDateTime } from '@spedsim/core';
import { sendCommand, useGame, useUi } from '../game/store.ts';
import { Avatar, Bar, Card, Money, PageHeader } from '../ui/components.tsx';
import { cityName } from '../ui/format.ts';

const NEED_LABEL = { energy: 'Energie', hunger: 'Sättigung', stress: 'Stress', health: 'Gesundheit', happiness: 'Zufriedenheit', social: 'Soziale Kontakte', leisure: 'Freizeit' };

export function PrivatePage() {
  const s = useGame();
  const pid = useUi((u) => u.playerId);
  const me = s.players[pid];
  const [salary, setSalary] = useState(me ? me.character.salary / 100 : 0);
  if (!me) return null;
  const c = me.character;
  const privateLedger = s.ledger.filter((l) => l.account === `private:${pid}`).slice(-30).reverse();
  return (
    <div className="page">
      <PageHeader title="Privatleben" subtitle="Privatvermögen und Firmenvermögen sind strikt getrennt." />
      <div className="grid grid-3">
        <Card title="Dein Charakter">
          <div className="row" style={{ gap: 14 }}>
            <Avatar avatar={c.avatar} size={72} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 650 }}>{c.name}</div>
              <div className="dim">{c.age} Jahre · Geschäftsführung {s.company.name}</div>
              <div className="row mt"><Home size={15} /> Kleine Mietwohnung in {cityName(s.company.hqCityId)}</div>
            </div>
          </div>
          <div className="mt">
            {Object.entries(c.needs).map(([k, v]) => (
              <div key={k} className="row" style={{ marginBottom: 6 }}>
                <span style={{ width: 130 }} className="muted">{NEED_LABEL[k as keyof typeof NEED_LABEL]}</span>
                <div style={{ flex: 1 }}><Bar value={v} invert={k === 'stress'} /></div>
              </div>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 12.5 }}>Bedürfnisse, Freizeitaktivitäten, Immobilien und Beziehungen werden in Entwicklungsphase 8 aktiv simuliert.</p>
        </Card>
        <Card title="Privatkonto">
          <div className="stat"><div className="value"><Money value={c.privateAccount.balance} colored /></div></div>
          <dl className="kv mt">
            <dt>Geschäftsführergehalt</dt><dd><Money value={c.salary} /> / Monat</dd>
            <dt>Wohnung & Lebenshaltung</dt><dd><Money value={-PRIVATE_LIVING_COST} /> / Monat</dd>
            <dt>Monatlich übrig</dt><dd><Money value={c.salary - PRIVATE_LIVING_COST} colored /></dd>
          </dl>
          <div className="field mt">
            <label>Geschäftsführergehalt festlegen (zahlt die Firma am Monatsersten)</label>
            <div className="row">
              <input className="input" type="number" min={0} max={50000} step={100} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
              <button className="btn primary" onClick={() => sendCommand({ type: 'setCeoSalary', playerId: pid, salary: Math.round(salary * 100) })}>Übernehmen</button>
            </div>
            <span className="dim" style={{ fontSize: 12 }}>Ein hohes Gehalt erhöht deinen Wohlstand, belastet aber die Liquidität der Firma.</span>
          </div>
        </Card>
        <Card title="Private Buchungen">
          <div className="list">
            {privateLedger.length === 0 && <div className="empty">Noch keine Buchungen – Gehalt und Lebenshaltung werden am Monatsersten gebucht.</div>}
            {privateLedger.map((l, i) => (
              <div key={i} className="list-item"><time>{formatDateTime(l.t).slice(3, 13)}</time><span style={{ flex: 1 }}>{l.text}</span><Money value={l.amount} colored /></div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
