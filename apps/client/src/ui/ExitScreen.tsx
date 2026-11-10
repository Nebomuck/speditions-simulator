// Abschluss nach dem Firmenverkauf: Bilanz der Spedition, Neustart-Bonus, zurück zum Startbildschirm.

import { useEffect } from 'react';
import { Award, LogOut, PartyPopper } from 'lucide-react';
import { legacyBonus } from '@spedsim/core';
import { getUi, resetGameUi, useGame } from '../game/store.ts';
import { loadExits, rememberExit } from '../game/legacy.ts';
import { Money } from './components.tsx';

export function ExitScreen() {
  const s = useGame();
  const exit = s.exit;
  useEffect(() => {
    if (!exit) return;
    rememberExit(s.seed, s.company.name, exit);
    // gleich speichern, damit der Verkauf im Spielstand steht
    void getUi().host?.save?.(`${s.company.name} (verkauft)`);
  }, [exit?.t]);
  if (!exit) return null;
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
