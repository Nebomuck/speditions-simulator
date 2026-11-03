// KI-Disposition: Modus (manuell / teil- / vollautomatisch), Vorschläge der Disponenten und Regeln.

import { useState } from 'react';
import { Bot, Check, X, Settings2 } from 'lucide-react';
import {
  CARGOS, COUNTRY_NAMES, CHAIN_MIN_SKILL, REACT_MIN_SKILL, VEHICLES_PER_DISPATCHER, dispatchers, managedVehicles, type DispatchMode, type DispatchRules,
} from '@spedsim/core';
import { sendCommand, setUi, useGame } from '../game/store.ts';
import { Badge, Modal, Money } from '../ui/components.tsx';
import { cityName } from '../ui/format.ts';

const MODE_LABEL: Record<DispatchMode, string> = { manual: 'Manuell', assist: 'Teilautomatisch', auto: 'Vollautomatisch' };
const MODE_TEXT: Record<DispatchMode, string> = {
  manual: 'Du disponierst alles selbst.',
  assist: 'Die Disponenten schlagen Fahrten vor, du entscheidest.',
  auto: 'Die Disponenten nehmen Aufträge an und planen selbstständig nach deinen Regeln.',
};

export function AutoDispatchBar() {
  const s = useGame();
  const ad = s.autoDispatch;
  const [rules, setRules] = useState(false);
  if (!ad) return null;
  const staff = dispatchers(s);
  const managed = managedVehicles(s);
  const total = Object.keys(s.vehicles).length;
  return (
    <div className="card mb">
      <div className="row wrap">
        <Bot size={18} />
        <b>KI-Disposition</b>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {(Object.keys(MODE_LABEL) as DispatchMode[]).map((m) => (
            <button key={m} className={ad.mode === m ? 'active' : ''} disabled={m !== 'manual' && staff.length === 0} onClick={() => sendCommand({ type: 'setAutoDispatch', mode: m })}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <span className="dim" style={{ flex: 1, fontSize: 12.5 }}>
          {staff.length === 0 ? (
            <>Noch kein Disponent – einstellen unter <a href="#" onClick={(e) => (e.preventDefault(), setUi({ page: 'locations' }))}>Standorte & Ausbau → Abteilungen</a>.</>
          ) : (
            <>
              {MODE_TEXT[ad.mode]} {staff.length} Disponent{staff.length > 1 ? 'en' : ''} ({staff.map((m) => `${m.name.split(' ')[0]} ${Math.round(m.skill)}`).join(', ')}) {staff.length > 1 ? 'betreuen' : 'betreut'} {managed.length}/{total} Fahrzeuge
              {managed.length < total - ad.rules.excludedVehicles.length ? ` – je Disponent ${VEHICLES_PER_DISPATCHER}` : ''}. Bisher {ad.stats.planned} Fahrten, geplanter Gewinn <Money value={ad.stats.profit} />.
            </>
          )}
        </span>
        <button className="btn small" onClick={() => setRules(true)}><Settings2 size={14} />Regeln</button>
      </div>
      {ad.mode === 'assist' && (
        <div className="list mt">
          {ad.suggestions.length === 0 && <div className="dim" style={{ fontSize: 12.5 }}>Keine Vorschläge – die Disponenten prüfen stündlich Aufträge und freie Fahrzeuge.</div>}
          {ad.suggestions.map((g) => {
            const v = s.vehicles[g.vehicleId];
            return (
              <div key={g.id} className="list-item" style={{ alignItems: 'center' }}>
                <Badge kind={g.kind === 'relocate' ? 'warning' : g.kind === 'queue' ? 'violet' : 'info'}>{g.kind === 'relocate' ? 'Überführung' : g.kind === 'queue' ? 'Folgeauftrag' : 'Fahrt'}</Badge>
                <span style={{ flex: 1 }}>
                  <b>{v?.plate}</b> · {s.drivers[g.driverId]?.name ?? '–'} · {g.reason}
                </span>
                <button className="btn small primary" onClick={() => sendCommand({ type: 'acceptSuggestion', suggestionId: g.id })}><Check size={13} />Übernehmen</button>
                <button className="btn small" title="Verwerfen" onClick={() => sendCommand({ type: 'dismissSuggestion', suggestionId: g.id })}><X size={13} /></button>
              </div>
            );
          })}
        </div>
      )}
      {rules && <RulesDialog onClose={() => setRules(false)} />}
    </div>
  );
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const [r, setR] = useState<DispatchRules>({ ...s.autoDispatch.rules });
  const set = <K extends keyof DispatchRules>(k: K, v: DispatchRules[K]) => setR({ ...r, [k]: v });
  const toggle = (k: 'cargoIds' | 'countries' | 'excludedVehicles', id: string) => set(k, r[k].includes(id) ? r[k].filter((x) => x !== id) : [...r[k], id]);
  const countries = Object.keys(COUNTRY_NAMES).sort((a, b) => COUNTRY_NAMES[a].localeCompare(COUNTRY_NAMES[b]));
  const flags: { k: 'regularsFirst' | 'safeDeadlines' | 'nearestFirst' | 'chains' | 'returnToBase'; label: string }[] = [
    { k: 'regularsFirst', label: 'Stammkunden bevorzugen' },
    { k: 'safeDeadlines', label: 'Keine riskanten Liefertermine (mind. 2 h Puffer)' },
    { k: 'nearestFirst', label: 'Fahrzeug möglichst nahe am Auftrag (statt höchstem Gewinn)' },
    { k: 'chains', label: `Rückladungen/Folgeaufträge für fahrende LKW planen (ab Kompetenz ${CHAIN_MIN_SKILL})` },
    { k: 'returnToBase', label: 'LKW ohne Auftrag nach 12 h zum nächsten Standort zurückholen' },
  ];
  async function save() {
    const res = await sendCommand({ type: 'setAutoDispatch', rules: r });
    if (res.ok) onClose();
  }
  return (
    <Modal title="Regeln für die Disponenten" onClose={onClose} width={880}>
      <div className="grid grid-2">
        <div>
          <div className="field">
            <label>Mindestgewinn je neuem Auftrag</label>
            <div className="row"><input className="input" type="number" step={50} style={{ width: 140 }} value={Math.round(r.minProfit / 100)} onChange={(e) => set('minProfit', Number(e.target.value) * 100)} /> €</div>
          </div>
          <div className="field">
            <label>Maximale Leerfahrt bis zur Abholung</label>
            <div className="row"><input className="input" type="number" step={25} style={{ width: 140 }} value={r.maxEmptyKm} onChange={(e) => set('maxEmptyKm', Number(e.target.value))} /> km</div>
          </div>
          <div className="list">
            {flags.map((f) => (
              <label key={f.k} className="list-item" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={r[f.k]} onChange={(e) => set(f.k, e.target.checked)} /> {f.label}
              </label>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 12 }}>
            Bereits angenommene Aufträge und Vertragstouren werden immer zuerst vergeben – Mindestgewinn und Leerfahrt gelten nur für neue Angebote.
            Erfahrene Disponenten (ab {REACT_MIN_SKILL}) geben verspätete Folgeaufträge an andere LKW ab. Unerfahrene verkalkulieren sich öfter.
          </p>
        </div>
        <div>
          <div className="field">
            <label>Bevorzugte Ladungsarten {r.cargoIds.length ? `(${r.cargoIds.length})` : '(alle)'}</label>
            <div className="row wrap">
              {CARGOS.map((c) => <button key={c.id} className={`chip ${r.cargoIds.includes(c.id) ? 'active' : ''}`} onClick={() => toggle('cargoIds', c.id)}>{c.name}</button>)}
            </div>
          </div>
          <div className="field">
            <label>Einsatzländer {r.countries.length ? `(${r.countries.length})` : '(ganz Europa)'}</label>
            <div className="row wrap">
              {countries.map((c) => <button key={c} className={`chip ${r.countries.includes(c) ? 'active' : ''}`} onClick={() => toggle('countries', c)}>{COUNTRY_NAMES[c]}</button>)}
            </div>
          </div>
          <div className="field">
            <label>Nur manuell disponieren</label>
            <div className="row wrap">
              {Object.values(s.vehicles).map((v) => (
                <button key={v.id} className={`chip ${r.excludedVehicles.includes(v.id) ? 'active' : ''}`} onClick={() => toggle('excludedVehicles', v.id)} title={cityName(v.cityId)}>{v.plate}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Abbrechen</button>
        <button className="btn primary" onClick={save}>Regeln speichern</button>
      </div>
    </Modal>
  );
}
