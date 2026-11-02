// Zentrale Datenmodelle des Spielzustands.
// Der gesamte Zustand ist ein reines JSON-Objekt: serialisierbar, synchronisierbar, deterministisch.
// Geldbeträge sind immer ganze Euro-Cent (Money), Zeiten immer Spielminuten seit Spielbeginn (GameTime).

export type Id = string;
export type Money = number; // Cent
export type GameTime = number; // Minuten seit Epoche (siehe time.ts)

export type TrailerType =
  | 'curtain'
  | 'box'
  | 'reefer'
  | 'container'
  | 'tanker'
  | 'lowbed'
  | 'walkingfloor'
  | 'tipper'
  | 'cartransporter';

export type Qualification = 'ADR' | 'heavy' | 'reefer';

export type Permission =
  | 'dispatch' // Aufträge annehmen, disponieren, Fahrten überwachen
  | 'fleet' // Fahrzeuge warten, reparieren
  | 'purchase' // Fahrzeuge/Auflieger kaufen und leasen
  | 'sellVehicles'
  | 'personnel' // Einstellen
  | 'fireStaff'
  | 'finance' // Gehälter, Entnahmen
  | 'loans'
  | 'expansion' // Standorte, große Investitionen
  | 'admin'; // Rechte vergeben, Spielgeschwindigkeit

export type DifficultyId = 'easy' | 'normal' | 'realistic' | 'custom';

export interface Difficulty {
  id: DifficultyId;
  startCapital: Money;
  /** Multiplikator auf Frachtraten (Marge). */
  rateFactor: number;
  /** Multiplikator auf Ereignis-/Pannenwahrscheinlichkeit. */
  eventFactor: number;
  /** Anteil Kunden mit schlechter Zahlungsmoral, Multiplikator. */
  paymentRiskFactor: number;
  startTruckOwned: boolean;
}

export interface Account {
  balance: Money;
}

export type LedgerAccount = 'company' | `private:${Id}`;

export type LedgerCategory =
  | 'revenue'
  | 'fuel'
  | 'toll'
  | 'wages'
  | 'rent'
  | 'insurance'
  | 'leasing'
  | 'maintenance'
  | 'repair'
  | 'vehicle_purchase'
  | 'vehicle_sale'
  | 'penalty'
  | 'hiring'
  | 'salary'
  | 'living'
  | 'loan'
  | 'interest'
  | 'tax'
  | 'other';

export interface LedgerEntry {
  t: GameTime;
  account: LedgerAccount;
  amount: Money; // positiv = Einnahme
  category: LedgerCategory;
  text: string;
}

export interface Location {
  id: Id;
  cityId: string;
  kind: LocationKind;
  since: GameTime;
}

export type LocationKind = 'office_small' | 'office_yard' | 'depot';

export interface Company {
  name: string;
  hqCityId: string;
  account: Account;
  founded: GameTime;
  locations: Location[];
  /** 0–100, beeinflusst Auftragsangebot. */
  reputation: number;
  /** Kumulierte Kennzahlen für Statistiken. */
  totals: { deliveries: number; lateDeliveries: number; revenue: Money; kmLoaded: number; kmEmpty: number };
  /** laufende Bankkredite */
  loans: Loan[];
}

/** Ratenkredit (Annuität, monatliche Rate am Monatsersten). */
export interface Loan {
  id: Id;
  principal: Money;
  /** Restschuld */
  remaining: Money;
  /** Zinssatz p. a., z. B. 0.075 */
  ratePa: number;
  monthly: Money;
  months: number;
  taken: GameTime;
}

export interface Character {
  name: string;
  age: number;
  avatar: { skin: number; hair: number; hairColor: number; shirt: number };
  privateAccount: Account;
  /** Monatliches Geschäftsführergehalt (brutto ≈ netto im Spielmodell). */
  salary: Money;
  home: 'apartment_small';
  /** Bedürfnisse 0–100 (Phase 8 vollständig). */
  needs: { energy: number; hunger: number; stress: number; health: number; happiness: number; social: number; leisure: number };
}

export interface Player {
  id: Id;
  name: string;
  isFounder: boolean;
  permissions: Permission[];
  character: Character;
  online?: boolean;
}

/** Lenk- und Ruhezeiten (vereinfachtes Modell der VO (EG) 561/2006, siehe GAME_DESIGN.md). */
export interface HoursOfService {
  drivenSinceBreak: number;
  drivenToday: number;
  drivenWeek: number;
  /** Minuten ununterbrochene Ruhe (zählt im Stand und in Ruhezeiten). */
  restStreak: number;
  /** Tageslenkzeiten seit letzter Wochenruhe. */
  daysSinceWeeklyRest: number;
  /** Noch abzuleistende Ruhe/Pause in Minuten; >0 bedeutet Fahrer darf nicht fahren. */
  requiredRest: number;
  requiredRestKind: 'none' | 'break' | 'daily' | 'weekly';
}

export type DriverStatus = 'idle' | 'on_trip' | 'resting' | 'sick' | 'vacation';

export interface Driver {
  id: Id;
  name: string;
  age: number;
  homeCityId: string;
  /** aktueller Aufenthaltsort, wenn nicht unterwegs */
  cityId: string;
  experience: number; // 0–100
  licenses: ('C' | 'CE')[];
  qualifications: Qualification[];
  salary: Money; // pro Monat
  reliability: number; // 0–100
  ecoDriving: number; // 0–100
  stressResistance: number; // 0–100
  satisfaction: number; // 0–100
  hired: GameTime;
  status: DriverStatus;
  tripId?: Id;
  hos: HoursOfService;
  kmDriven: number;
}

export interface Applicant extends Omit<Driver, 'status' | 'hired' | 'tripId' | 'hos' | 'kmDriven' | 'satisfaction'> {
  expires: GameTime;
}

export type VehicleStatus = 'idle' | 'on_trip' | 'workshop' | 'broken';

export interface Vehicle {
  id: Id;
  modelId: string;
  plate: string;
  year: number;
  odometerKm: number;
  condition: number; // 0–100
  fuelL: number;
  cityId: string;
  status: VehicleStatus;
  tripId?: Id;
  ownership: 'owned' | 'leased';
  leaseRate?: Money; // pro Monat
  purchasePrice: Money;
  bought: GameTime;
  /** Werkstattaufenthalt bis */
  busyUntil?: GameTime;
  /** Vorausplanung: Folgeaufträge, die nach der laufenden Fahrt automatisch starten (gleicher Fahrer/Auflieger) */
  queue?: QueuedJob[];
  history: { t: GameTime; text: string; cost: Money }[];
}

export interface QueuedJob {
  id: Id;
  orderId: Id;
  /** Zeitpunkt der Einplanung */
  queuedAt: GameTime;
}

export interface Trailer {
  id: Id;
  type: TrailerType;
  plate: string;
  condition: number;
  cityId: string;
  status: 'idle' | 'on_trip';
  tripId?: Id;
  ownership: 'owned' | 'leased';
  leaseRate?: Money;
  purchasePrice: Money;
  bought: GameTime;
}

export interface VehicleOffer {
  id: Id;
  modelId: string;
  year: number;
  odometerKm: number;
  condition: number;
  price: Money;
  cityId: string;
  expires: GameTime;
}

export type CustomerSize = 'small' | 'medium' | 'large';

export interface Customer {
  id: Id;
  name: string;
  cityId: string;
  industry: string;
  size: CustomerSize;
  /** Wahrscheinlichkeit pünktlicher Zahlung 0–1 */
  paymentReliability: number;
  paymentTermDays: number;
  satisfaction: number; // 0–100
  priceSensitivity: number; // 0–1
  deliveries: number;
}

export type OrderStatus = 'offered' | 'accepted' | 'planned' | 'in_transit' | 'delivered' | 'expired' | 'cancelled';

export interface Order {
  id: Id;
  customerId: Id;
  cargoId: string;
  fromCityId: string;
  toCityId: string;
  weightT: number;
  trailerType: TrailerType;
  qualifications: Qualification[];
  pickupStart: GameTime;
  pickupEnd: GameTime;
  deliveryEnd: GameTime;
  distanceKm: number;
  payment: Money;
  /** Vertragsstrafe pro angefangener Verspätungsstunde, gedeckelt (siehe finance). */
  penaltyPerHour: Money;
  express: boolean;
  international: boolean;
  /** Teilladung (kleine Sendung, passend für Solo-LKW/Transporter) */
  partial?: boolean;
  status: OrderStatus;
  offerExpires: GameTime;
  created: GameTime;
  tripId?: Id;
  deliveredAt?: GameTime;
  lateMinutes?: number;
}

export type TripPhase = 'to_pickup' | 'loading' | 'to_delivery' | 'unloading' | 'done';
export type TripActivity =
  | 'driving'
  | 'break'
  | 'rest_daily'
  | 'rest_weekly'
  | 'fueling'
  | 'loading'
  | 'unloading'
  | 'waiting'
  | 'ferry'
  | 'breakdown'
  | 'done';

export interface TripLeg {
  /** Knotenfolge (Stadt-IDs) im Straßennetz */
  nodes: string[];
  km: number;
  loaded: boolean;
}

export interface Trip {
  id: Id;
  orderId?: Id; // fehlt bei Überführungsfahrten
  driverId: Id;
  vehicleId: Id;
  trailerId?: Id;
  legs: TripLeg[];
  legIndex: number;
  /** gefahrene km auf aktuellem Leg */
  progressKm: number;
  phase: TripPhase;
  activity: TripActivity;
  /** Restdauer der aktuellen stationären Tätigkeit in Minuten */
  activityLeft: number;
  /** aktuelle Geschwindigkeit km/h (für Anzeige) */
  speedKmh: number;
  startedAt: GameTime;
  finishedAt?: GameTime;
  costs: { fuel: Money; toll: Money };
  kmEmpty: number;
  kmLoaded: number;
  /** geschätzte Ankunft am Ziel bei Dispositionszeitpunkt */
  plannedArrival: GameTime;
  log: { t: GameTime; text: string }[];
}

/** factored = an Factoring-Gesellschaft verkauft (Geld bereits erhalten, Ausfallrisiko abgegeben) */
export type InvoiceStatus = 'open' | 'paid' | 'overdue' | 'defaulted' | 'factored';

export interface Invoice {
  id: Id;
  orderId: Id;
  customerId: Id;
  amount: Money;
  issued: GameTime;
  due: GameTime;
  /** vorab ausgewürfelter Zahlungszeitpunkt (deterministisch) */
  willPayAt: GameTime | null;
  paid?: GameTime;
  status: InvoiceStatus;
  reminders: number;
}

export type LogLevel = 'info' | 'success' | 'warning' | 'danger';

export interface LogEntry {
  id: number;
  t: GameTime;
  level: LogLevel;
  category: 'order' | 'trip' | 'finance' | 'personnel' | 'fleet' | 'company' | 'market' | 'multiplayer' | 'private';
  text: string;
  ref?: { kind: 'order' | 'trip' | 'vehicle' | 'driver' | 'invoice'; id: Id };
}

export interface ChatMessage {
  id: number;
  t: GameTime;
  playerId: Id;
  text: string;
}

export interface Market {
  /** Dieselpreis netto in Cent pro Liter */
  diesel: number;
  /** Allgemeiner Nachfrageindex ~1.0 */
  demand: number;
  dieselHistory: { t: GameTime; v: number }[];
}

export interface DailyStat {
  day: number;
  balance: Money;
  revenue: Money;
  costs: Money;
}

export interface GameState {
  format: 'spedsim-state';
  version: number;
  seed: number;
  rng: number;
  nextId: number;
  time: GameTime;
  speed: number;
  paused: boolean;
  difficulty: Difficulty;
  company: Company;
  players: Record<Id, Player>;
  drivers: Record<Id, Driver>;
  applicants: Record<Id, Applicant>;
  vehicles: Record<Id, Vehicle>;
  trailers: Record<Id, Trailer>;
  vehicleOffers: Record<Id, VehicleOffer>;
  customers: Record<Id, Customer>;
  orders: Record<Id, Order>;
  trips: Record<Id, Trip>;
  invoices: Record<Id, Invoice>;
  ledger: LedgerEntry[];
  log: LogEntry[];
  chat: ChatMessage[];
  market: Market;
  stats: DailyStat[];
  /** Tagesumsatz/-kosten laufend (für stats) */
  today: { revenue: Money; costs: Money };
}
