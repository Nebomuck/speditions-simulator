// Abschluss nach dem Firmenverkauf: Bilanz der Spedition, Neustart-Bonus, zurück zum Startbildschirm.

import { useEffect } from 'react';
import { Award, Gavel, LogOut, PartyPopper } from 'lucide-react';
import { legacyBonus } from '@spedsim/core';
import { getUi, resetGameUi, useGame } from '../game/store.ts';
import { loadExits, rememberExit } from '../game/legacy.ts';
import { Money } from './components.tsx';

export function ExitScreen() {
  const s = useGame();
  const exit = s.exit;
  useEffect(() => {
    if (!exit) return;
    // eine Insolvenz bringt keinen Neustart-Bonus
    if (exit.kind !== 'insolvency') rememberExit(s.seed, s.company.name, exit);
    // gleich speichern, damit das Ende im Spielstand steht
    void getUi().host?.save?.(`${s.company.name} (${exit.kind === 'insolvency' ? 'insolvent' : 'verkauft'})`);
  }, [exit?.t]);
  if (!exit) return null;
  if (exit.kind === 'insolvency')
    return (
      <div className="exit-screen">
        <div className="card exit-card insolvency">
          <div className="dim" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Gavel size={16} /> Insolvenzverfahren eröffnet</div>
          <h2>{s.company.name} ist zahlungsunfähig</h2>
          <p className="dim" style={{ margin: 0 }}>
            Nach {exit.months} {exit.months === 1 ? 'Monat' : 'Monaten'} am Markt, mit {exit.vehicles} {exit.vehicles === 1 ? 'Fahrzeug' : 'Fahrzeugen'} und {exit.deliveries.toLocaleString('de-DE')} Lieferungen auf Unternehmensstufe {exit.level}.
            Die Sanierungsfrist der Bank ist verstrichen, ohne dass die Liquidität wieder im Rahmen lag.
          </p>
          <div className="exit-figures">
            <div><small>Substanzwert</small><b><Money value={exit.assets} /></b></div>
            <div><small>Verbindlichkeiten</small><b className="neg"><Money value={exit.debts} /></b></div>
          </div>
          <p className="dim" style={{ fontSize: 12.5 }}>Ein Neustart-Bonus gibt es nach einer Insolvenz nicht. Ältere Spielstände dieser Firma lassen sich weiter laden – vielleicht klappt die Sanierung beim zweiten Versuch.</p>
          <div className="row mt" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={() => { getUi().host?.close(); resetGameUi(); }}><LogOut size={15} />Zum Startbildschirm</button>
          </div>
        </div>
      </div>
    );
  // der eigene Verkauf zählt schon mit, auch bevor er gespeichert ist
  const known = loadExits();
  const bonus = legacyBonus(known.some((x) => x.key === `${s.seed}:${exit.t}`) ? known : [...known, exit]);
  return (
    <div className="exit-screen">
      <div className="card exit-card">
        <div className="dim" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><PartyPopper size={16} /> Firmenverkauf abgeschlossen</div>
        <h2>{s.company.name} hat einen neuen Eigentümer</h2>
        <p className="dim" style={{ margin: 0 }}>Nach {exit.months} {exit.months === 1 ? 'Monat' : 'Monaten'} am Markt, mit {exit.vehicles} {exit.vehicles === 1 ? 'Fahrzeug' : 'Fahrzeugen'} und {exit.deliveries.toLocaleString('de-DE')} Lieferungen auf Unternehmensstufe {exit.level}.</p>
        <div className="exit-figures">
          <div><small>Substanzwert</small><b><Money value={exit.assets} /></b></div>
          <div><small>Kundenstamm</small><b><Money value={exit.goodwill} /></b></div>
          <div><small>Kaufpreis</small><b><Money value={exit.price} /></b></div>
          <div><small>Erlös nach Krediten</small><b className="pos"><Money value={exit.proceeds} /></b></div>
        </div>
        <div className="exit-bonus">
          <b><Award size={14} style={{ verticalAlign: -2 }} /> Neustart-Bonus als Serienunternehmer:</b> Deine nächste Spedition startet mit <b><Money value={bonus.capital} /></b> zusätzlichem Kapital
          und +{bonus.reputation} Ruf. Den Bonus kannst du beim Gründen abwählen.
        </div>
        <div className="row mt" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={() => { getUi().host?.close(); resetGameUi(); }}><LogOut size={15} />Zum Startbildschirm</button>
        </div>
      </div>
    </div>
  );
}
