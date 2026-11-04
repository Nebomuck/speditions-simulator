import { useGame } from '../game/store.ts';
import { AchievementsCard } from '../ui/Goals.tsx';
import { Card, LineChart, Money, PageHeader, Stat } from '../ui/components.tsx';
import { km } from '../ui/format.ts';

export function StatsPage() {
  const s = useGame();
  const t = s.company.totals;
  const emptyShare = t.kmLoaded + t.kmEmpty > 0 ? (t.kmEmpty / (t.kmLoaded + t.kmEmpty)) * 100 : 0;
  return (
    <div className="page">
      <PageHeader title="Statistiken" subtitle="Leistungskennzahlen deiner Spedition" />
      <div className="grid grid-4">
        <Stat label="Lieferungen gesamt" value={t.deliveries} hint={`${t.lateDeliveries} verspätet (${t.deliveries ? Math.round((t.lateDeliveries / t.deliveries) * 100) : 0} %)`} />
        <Stat label="Umsatz gesamt" value={<Money value={t.revenue} />} hint="abgerechnete Frachterlöse" />
        <Stat label="Lastkilometer" value={km(t.kmLoaded)} hint={`Leerkilometer ${km(t.kmEmpty)}`} />
        <Stat label="Leerfahrtanteil" value={`${Math.round(emptyShare)} %`} hint="Ziel: unter 20 % durch gute Rückladungen" />
      </div>
      <div className="grid grid-2 mt">
        <Card title="Tägliche Einnahmen und Ausgaben (Firmenkonto)">
          <LineChart
            series={[
              { label: 'Einnahmen', color: 'var(--success)', values: s.stats.map((d) => d.revenue / 100) },
              { label: 'Ausgaben', color: 'var(--danger)', values: s.stats.map((d) => d.costs / 100) },
            ]}
            format={(v) => `${Math.round(v).toLocaleString('de-DE')} €`}
          />
        </Card>
        <Card title="Kontostand">
          <LineChart series={[{ label: 'Kontostand', color: 'var(--accent)', values: s.stats.map((d) => d.balance / 100) }]} format={(v) => `${Math.round(v).toLocaleString('de-DE')} €`} />
        </Card>
      </div>
      <AchievementsCard s={s} />
    </div>
  );
}
