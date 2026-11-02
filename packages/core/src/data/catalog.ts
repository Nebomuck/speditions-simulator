// Spielkataloge: Fahrzeugmodelle (fiktive Hersteller), Auflieger, Ladungsarten, Länderdaten.
// Alle Hersteller- und Modellnamen sind frei erfunden (keine Markenrechte Dritter).

import type { Industry } from './cities.ts';
import type { LocationKind, Money, Qualification, TrailerType } from '../types.ts';

export interface TruckModel {
  id: string;
  maker: string;
  name: string;
  hp: number;
  /** Basisverbrauch leer l/100 km; beladen + bis zu 35 % */
  consumption: number;
  tankL: number;
  emission: 'Euro V' | 'Euro VI';
  /** Neupreis in Cent */
  price: Money;
  /** Leasingrate neu pro Monat in Cent */
  leaseRate: Money;
  /** Versicherung pro Monat */
  insurance: Money;
  /** Zuverlässigkeit 0–1: verlangsamt Verschleiß */
  durability: number;
}

export const TRUCK_MODELS: TruckModel[] = [
  { id: 'nordwal-tx420', maker: 'Nordwal', name: 'TX 420', hp: 420, consumption: 27.5, tankL: 600, emission: 'Euro VI', price: 92_000_00, leaseRate: 1_850_00, insurance: 380_00, durability: 0.85 },
  { id: 'nordwal-tx500', maker: 'Nordwal', name: 'TX 500 Fernverkehr', hp: 500, consumption: 28.5, tankL: 800, emission: 'Euro VI', price: 118_000_00, leaseRate: 2_300_00, insurance: 420_00, durability: 0.9 },
  { id: 'velkor-s460', maker: 'Velkor', name: 'S 460', hp: 460, consumption: 26.8, tankL: 700, emission: 'Euro VI', price: 108_000_00, leaseRate: 2_150_00, insurance: 400_00, durability: 0.92 },
  { id: 'velkor-s540', maker: 'Velkor', name: 'S 540 Highline', hp: 540, consumption: 27.9, tankL: 900, emission: 'Euro VI', price: 134_000_00, leaseRate: 2_650_00, insurance: 450_00, durability: 0.95 },
  { id: 'brennkraft-k410', maker: 'Brennkraft', name: 'K 410 Eco', hp: 410, consumption: 25.9, tankL: 600, emission: 'Euro VI', price: 99_000_00, leaseRate: 1_980_00, insurance: 380_00, durability: 0.88 },
  { id: 'trasko-m380', maker: 'Trasko', name: 'M 380', hp: 380, consumption: 29.5, tankL: 500, emission: 'Euro V', price: 74_000_00, leaseRate: 1_500_00, insurance: 360_00, durability: 0.75 },
];

export const TRUCK_BY_ID: Record<string, TruckModel> = Object.fromEntries(TRUCK_MODELS.map((m) => [m.id, m]));

export interface TrailerDef {
  type: TrailerType;
  name: string;
  payloadT: number;
  price: Money;
  leaseRate: Money;
  insurance: Money;
}

export const TRAILERS: TrailerDef[] = [
  { type: 'curtain', name: 'Planenauflieger', payloadT: 25, price: 32_000_00, leaseRate: 520_00, insurance: 60_00 },
  { type: 'box', name: 'Kofferauflieger', payloadT: 24, price: 38_000_00, leaseRate: 610_00, insurance: 65_00 },
  { type: 'reefer', name: 'Kühlauflieger', payloadT: 22, price: 68_000_00, leaseRate: 1_050_00, insurance: 90_00 },
  { type: 'container', name: 'Containerchassis', payloadT: 28, price: 29_000_00, leaseRate: 450_00, insurance: 55_00 },
  { type: 'tanker', name: 'Tankauflieger (ADR)', payloadT: 26, price: 85_000_00, leaseRate: 1_300_00, insurance: 140_00 },
  { type: 'lowbed', name: 'Tieflader', payloadT: 40, price: 76_000_00, leaseRate: 1_200_00, insurance: 110_00 },
  { type: 'walkingfloor', name: 'Schubbodenauflieger', payloadT: 24, price: 62_000_00, leaseRate: 950_00, insurance: 80_00 },
  { type: 'tipper', name: 'Kippauflieger', payloadT: 27, price: 45_000_00, leaseRate: 720_00, insurance: 70_00 },
  { type: 'cartransporter', name: 'Autotransporter', payloadT: 18, price: 95_000_00, leaseRate: 1_450_00, insurance: 120_00 },
];

export const TRAILER_BY_TYPE = Object.fromEntries(TRAILERS.map((t) => [t.type, t])) as Record<TrailerType, TrailerDef>;

export interface CargoDef {
  id: string;
  name: string;
  trailer: TrailerType;
  qualifications: Qualification[];
  /** Grundvergütung pro beladenem km in Cent */
  ratePerKm: number;
  /** Pauschale Be-/Entladung in Cent */
  baseFee: number;
  weight: [number, number];
  loadMin: number;
  producers: Industry[];
  consumers: Industry[];
  /** Relative Häufigkeit */
  freq: number;
  /** Saisonfaktor je Monat (0=Jan) – optional */
  season?: number[];
}

const harvest = [0.6, 0.6, 0.7, 0.8, 0.9, 1.0, 1.4, 1.8, 1.8, 1.4, 0.9, 0.7];
const christmas = [0.9, 0.85, 0.9, 0.95, 1, 1, 0.95, 0.95, 1.05, 1.15, 1.35, 1.4];
const building = [0.6, 0.7, 0.95, 1.15, 1.2, 1.2, 1.15, 1.1, 1.1, 1.0, 0.85, 0.6];

export const CARGOS: CargoDef[] = [
  { id: 'pallets', name: 'Palettenware', trailer: 'curtain', qualifications: [], ratePerKm: 168, baseFee: 90_00, weight: [8, 24], loadMin: 60, producers: ['logistics', 'retail', 'machinery'], consumers: ['retail', 'logistics'], freq: 3, season: christmas },
  { id: 'piece', name: 'Stückgut', trailer: 'curtain', qualifications: [], ratePerKm: 162, baseFee: 70_00, weight: [3, 16], loadMin: 75, producers: ['logistics', 'machinery', 'electronics'], consumers: ['retail', 'logistics', 'construction'], freq: 2.5 },
  { id: 'food', name: 'Lebensmittel (trocken)', trailer: 'box', qualifications: [], ratePerKm: 172, baseFee: 90_00, weight: [10, 22], loadMin: 60, producers: ['food', 'agriculture'], consumers: ['retail'], freq: 2.5, season: christmas },
  { id: 'chilled', name: 'Kühlware', trailer: 'reefer', qualifications: [], ratePerKm: 205, baseFee: 110_00, weight: [8, 20], loadMin: 60, producers: ['food', 'agriculture'], consumers: ['retail'], freq: 2 },
  { id: 'frozen', name: 'Tiefkühlware', trailer: 'reefer', qualifications: [], ratePerKm: 218, baseFee: 120_00, weight: [8, 20], loadMin: 60, producers: ['food', 'port'], consumers: ['retail'], freq: 1.2 },
  { id: 'pharma', name: 'Pharmazeutika (temperiert)', trailer: 'reefer', qualifications: [], ratePerKm: 235, baseFee: 140_00, weight: [2, 12], loadMin: 45, producers: ['pharma'], consumers: ['retail', 'pharma', 'logistics'], freq: 0.9 },
  { id: 'building', name: 'Baustoffe', trailer: 'curtain', qualifications: [], ratePerKm: 158, baseFee: 80_00, weight: [18, 25], loadMin: 50, producers: ['construction', 'steel'], consumers: ['construction', 'retail'], freq: 1.6, season: building },
  { id: 'steel', name: 'Stahlcoils', trailer: 'curtain', qualifications: [], ratePerKm: 175, baseFee: 100_00, weight: [20, 25], loadMin: 60, producers: ['steel'], consumers: ['automotive', 'machinery'], freq: 1.2 },
  { id: 'grain', name: 'Getreide (Schüttgut)', trailer: 'tipper', qualifications: [], ratePerKm: 152, baseFee: 60_00, weight: [22, 27], loadMin: 40, producers: ['agriculture'], consumers: ['food', 'port'], freq: 1.1, season: harvest },
  { id: 'gravel', name: 'Kies & Sand', trailer: 'tipper', qualifications: [], ratePerKm: 145, baseFee: 50_00, weight: [24, 27], loadMin: 30, producers: ['construction'], consumers: ['construction'], freq: 0.7, season: building },
  { id: 'woodchips', name: 'Holzhackschnitzel', trailer: 'walkingfloor', qualifications: [], ratePerKm: 160, baseFee: 60_00, weight: [18, 24], loadMin: 45, producers: ['timber', 'agriculture'], consumers: ['chemical', 'construction'], freq: 0.8 },
  { id: 'container', name: 'Seecontainer', trailer: 'container', qualifications: [], ratePerKm: 170, baseFee: 120_00, weight: [10, 28], loadMin: 40, producers: ['port'], consumers: ['logistics', 'retail', 'automotive', 'electronics'], freq: 2 },
  { id: 'container_export', name: 'Exportcontainer', trailer: 'container', qualifications: [], ratePerKm: 165, baseFee: 110_00, weight: [10, 28], loadMin: 40, producers: ['automotive', 'machinery', 'chemical'], consumers: ['port'], freq: 1.3 },
  { id: 'cars', name: 'Neufahrzeuge', trailer: 'cartransporter', qualifications: [], ratePerKm: 215, baseFee: 150_00, weight: [12, 18], loadMin: 90, producers: ['automotive'], consumers: ['retail', 'port'], freq: 0.9 },
  { id: 'chemicals', name: 'Chemikalien (Gefahrgut)', trailer: 'tanker', qualifications: ['ADR'], ratePerKm: 238, baseFee: 160_00, weight: [18, 26], loadMin: 75, producers: ['chemical'], consumers: ['chemical', 'pharma', 'machinery'], freq: 1.1 },
  { id: 'fuel', name: 'Mineralöl (Gefahrgut)', trailer: 'tanker', qualifications: ['ADR'], ratePerKm: 230, baseFee: 150_00, weight: [20, 26], loadMin: 60, producers: ['port', 'chemical'], consumers: ['logistics', 'retail'], freq: 0.7 },
  { id: 'machines', name: 'Industriemaschinen (Schwertransport)', trailer: 'lowbed', qualifications: ['heavy'], ratePerKm: 285, baseFee: 250_00, weight: [25, 40], loadMin: 120, producers: ['machinery', 'steel'], consumers: ['construction', 'automotive', 'port'], freq: 0.5 },
  { id: 'autoparts', name: 'Autoteile (Just-in-time)', trailer: 'box', qualifications: [], ratePerKm: 185, baseFee: 90_00, weight: [6, 18], loadMin: 45, producers: ['automotive', 'electronics', 'steel'], consumers: ['automotive'], freq: 1.6 },
  { id: 'electronics', name: 'Elektronik', trailer: 'box', qualifications: [], ratePerKm: 190, baseFee: 100_00, weight: [4, 14], loadMin: 50, producers: ['electronics'], consumers: ['retail', 'logistics'], freq: 1.1, season: christmas },
];

export const CARGO_BY_ID: Record<string, CargoDef> = Object.fromEntries(CARGOS.map((x) => [x.id, x]));

/** Maut für 40-t-Sattelzug in Cent/km (Spielwerte, angelehnt an reale Größenordnungen 2025). */
export const TOLL_CENT_PER_KM: Record<string, number> = {
  DE: 35, AT: 44, CH: 110, FR: 24, IT: 20, ES: 12, PT: 18, NL: 14, BE: 15, LU: 10, GB: 4,
  PL: 9, CZ: 21, SK: 18, HU: 26, SI: 25, HR: 18, RS: 12, BA: 8, MK: 8, RO: 7, BG: 9, GR: 15,
  DK: 15, SE: 3, NO: 10, LT: 5, LV: 5, EE: 5,
};

export const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', FR: 'Frankreich', IT: 'Italien', ES: 'Spanien',
  PT: 'Portugal', NL: 'Niederlande', BE: 'Belgien', LU: 'Luxemburg', GB: 'Vereinigtes Königreich',
  PL: 'Polen', CZ: 'Tschechien', SK: 'Slowakei', HU: 'Ungarn', SI: 'Slowenien', HR: 'Kroatien',
  RS: 'Serbien', BA: 'Bosnien und Herzegowina', MK: 'Nordmazedonien', RO: 'Rumänien', BG: 'Bulgarien',
  GR: 'Griechenland', DK: 'Dänemark', SE: 'Schweden', NO: 'Norwegen', LT: 'Litauen', LV: 'Lettland', EE: 'Estland',
};

export interface LocationDef {
  kind: LocationKind;
  name: string;
  rent: Money; // pro Monat
  parking: number; // Stellplätze für Zugmaschinen
  trailerParking: number;
  staff: number; // Büroarbeitsplätze
  deposit: Money; // einmalige Kaution/Einrichtung
}

export const LOCATION_DEFS: Record<LocationKind, LocationDef> = {
  office_small: { kind: 'office_small', name: 'Kleines Büro mit Stellplätzen', rent: 650_00, parking: 2, trailerParking: 2, staff: 1, deposit: 0 },
  office_yard: { kind: 'office_yard', name: 'Büro mit Betriebshof', rent: 2_400_00, parking: 8, trailerParking: 10, staff: 4, deposit: 7_500_00 },
  depot: { kind: 'depot', name: 'Großer Betriebshof', rent: 6_800_00, parking: 25, trailerParking: 30, staff: 12, deposit: 25_000_00 },
};

export const PRIVATE_LIVING_COST: Money = 1_450_00; // Miete kleine Wohnung + Lebenshaltung / Monat
