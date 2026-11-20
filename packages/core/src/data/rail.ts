// Kombinierter Verkehr: begleitete Bahnverbindungen („Rollende Landstraße“), auf denen der ganze Lastzug mitfährt.
// Der Fahrer reist im Liegewagen mit, die Zeit auf der Bahn zählt als Ruhezeit. Strecken grob an realen
// Verbindungen orientiert, Zeiten und Preise vereinfacht (inklusive Verladung am Terminal).

export interface RailLink {
  id: string;
  name: string;
  a: string;
  b: string;
  /** Streckenlänge in km */
  km: number;
  /** Dauer inklusive Verladung in Stunden */
  hours: number;
  /** Preis je Lastzug in Cent */
  fare: number;
}

export const RAIL_LINKS: RailLink[] = [
  { id: 'brenner', name: 'Rollende Landstraße Brenner', a: 'innsbruck', b: 'verona', km: 275, hours: 6.5, fare: 330_00 },
  { id: 'freiburg', name: 'Rollende Landstraße Freiburg–Mailand', a: 'freiburg', b: 'mailand', km: 410, hours: 10.5, fare: 520_00 },
  { id: 'basel', name: 'Gotthard-Verlad Basel–Lugano', a: 'basel', b: 'lugano', km: 270, hours: 6, fare: 360_00 },
  { id: 'koeln', name: 'Alpentransit Köln–Verona', a: 'koeln', b: 'verona', km: 1050, hours: 20, fare: 1_150_00 },
  { id: 'tauern', name: 'Tauernbahn Salzburg–Ljubljana', a: 'salzburg', b: 'ljubljana', km: 300, hours: 7, fare: 290_00 },
  { id: 'lorraine', name: 'Schienenautobahn Metz–Perpignan', a: 'metz', b: 'perpignan', km: 1060, hours: 17, fare: 920_00 },
];
