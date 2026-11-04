// Zentrale Datenmodelle des Spielzustands.
// Der gesamte Zustand ist ein reines JSON-Objekt: serialisierbar, synchronisierbar, deterministisch.
// Geldbeträge sind immer ganze Euro-Cent (Money), Zeiten immer Spielminuten seit Spielbeginn (GameTime).

import type { AvatarLook } from './avatar.ts';

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
  | 'storage'
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
  /** eigene Einrichtungen am Standort (Werkstatt, Tankstelle, Lager) */
  facilities: FacilityKind[];
  /** Auslastung der Lagerhalle 0–1 */
  warehouseUtil?: number;
}

export type LocationKind = 'office_small' | 'office_yard' | 'depot';

export type FacilityKind = 'workshop' | 'fuel' | 'warehouse';

export type Department = 'dispatch' | 'sales' | 'accounting' | 'fleet';

/** Büro- und Fachpersonal (Abteilungen) */
export interface StaffMember {
  id: Id;
  name: string;
  dept: Department;
  salary: Money;
  hired: GameTime;
  /** Arbeitsplatz (Standort) */
  locationId: Id;
  /** aus dem Fahrerstamm befördert */
  promoted?: boolean;
  /** Fachkompetenz 0–100 (bei Disponenten: Planungsqualität) */
  skill: number;
}

export type StaffGrade = 'junior' | 'regular' | 'senior';

/** manual = alles selbst, assist = Disponent schlägt vor, auto = Disponent plant selbst */
export type DispatchMode = 'manual' | 'assist' | 'auto';

/** Vorgaben des Spielers an die Disposition */
export interface DispatchRules {
  /** Mindestgewinn je Auftrag (gilt für neue Angebote) */
  minProfit: Money;
  /** maximale Leerfahrt bis zur Abholung */
  maxEmptyKm: number;
  /** bevorzugte Ladungsarten (leer = alle) */
  cargoIds: string[];
  /** Einsatzländer (leer = alle) – Abholung und Ziel müssen darin liegen */
  countries: string[];
  /** Stammkunden bevorzugen */
  regularsFirst: boolean;
  /** keine knappen Liefertermine (mind. 2 h Puffer) */
  safeDeadlines: boolean;
  /** nächstgelegenes Fahrzeug statt höchstem Gewinn */
  nearestFirst: boolean;
  /** Folgeaufträge (Rückladungen) für fahrende LKW planen */
  chains: boolean;
  /** LKW ohne Auftrag nach 12 h zum nächsten Standort überführen */
  returnToBase: boolean;
  /** Fahrzeuge, die nur manuell disponiert werden */
  excludedVehicles: Id[];
}

export interface DispatchSuggestion {
  id: Id;
  kind: 'dispatch' | 'queue' | 'relocate';
  orderId?: Id;
  vehicleId: Id;
  driverId: Id;
  trailerId?: Id;
  toCityId?: string;
  profit: Money;
  emptyKm: number;
  staffId: Id;
  reason: string;
  created: GameTime;
  expires: GameTime;
}

export interface AutoDispatchState {
  mode: DispatchMode;
  rules: DispatchRules;
  suggestions: DispatchSuggestion[];
  /** Stunden ohne passenden Auftrag je Fahrzeug */
  idleHours: Record<Id, number>;
  stats: { planned: number; profit: Money; relocations: number };
}

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
  /** Abteilungen: Büro- und Fachpersonal */
  staff: StaffMember[];
  /** Unternehmensstufe 1–6 (steigt nur) */
  level: number;
  /** Bonität bei der Hausbank 0–4 (A … E; fehlt: 2 = C), folgt den Quartalszielen */
  rating?: number;
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
  /** Fahrzeugfinanzierung: das finanzierte Fahrzeug (Sicherheit der Bank) */
  vehicleId?: Id;
  label?: string;
}

export interface Character {
  name: string;
  age: number;
  avatar: AvatarLook;
  privateAccount: Account;
  /** Monatliches Geschäftsführergehalt (brutto ≈ netto im Spielmodell). */
  salary: Money;
  home: HomeKind;
  /** Bedürfnisse 0–100 (hunger = Sättigung, stress: hoch = schlecht) */
  needs: Needs;
  /** Hintergrund bei der Gründung (bestimmt die Startfähigkeiten) */
  background: CharacterBackground;
  /** Fähigkeiten 0–100: Verhandlung (Preise), Führung (Fahrerzufriedenheit), Logistik (eigene Disposition) */
  skills: { negotiation: number; leadership: number; logistics: number };
  /** persönliche Ziele (IDs aus LIFE_GOALS) */
  goals: string[];
  /** wie viel der Charakter selbst arbeitet (Work-Life-Balance) */
  workStyle: WorkStyle;
  /** Wohneigentum: Immobilienkredit */
  mortgage?: { principal: Money; remaining: Money; monthly: Money; ratePa: number };
  holidayHome?: boolean;
  /** Privatwagen (ID aus PRIVATE_CARS) */
  car?: string;
  /** Einrichtung 0–3 */
  furniture: number;
  /** laufende Aktivität oder Urlaub */
  activity?: { id: string; until: GameTime; text: string };
  /** krank (Erschöpfung) bis */
  sickUntil?: GameTime;
  /** aufeinanderfolgende Tage mit Stress ≥ 90 */
  burnoutDays?: number;
  relations: Relation[];
  hobby?: { id: string; level: number };
  /** Familienzuwachs erwartet am */
  babyDue?: GameTime;
  /** Tage, an denen die Aktivitäten zuletzt vergeben wurden (gegen Spam): letzte Aktivität je Art */
  lastActivity?: Record<string, GameTime>;
  /** Wochenroutine: feste Freizeitaktivität je Wochentag (0 = Montag), läuft abends von selbst */
  routine?: { day: number; activity: string }[];
  /** „Fokus Firma“: Freizeit, Kontakte und Urlaub regelt das Spiel selbst */
  autopilot?: boolean;
}

export interface Needs {
  energy: number;
  hunger: number;
  stress: number;
  health: number;
  happiness: number;
  social: number;
  leisure: number;
}

export type HomeKind = 'apartment_small' | 'apartment_large' | 'house' | 'villa';
export type WorkStyle = 'hands_on' | 'key_accounts' | 'strategy' | 'delegate' | 'ceo';
export type CharacterBackground = 'driver' | 'merchant' | 'career_changer';

export interface Relation {
  id: Id;
  name: string;
  kind: 'friend' | 'partner' | 'child';
  /** Nähe 0–100 */
  closeness: number;
  since: GameTime;
  lastContact: GameTime;
  /** Wohnort (für Freundschaften) */
  cityId?: string;
}

export interface Player {
  id: Id;
  name: string;
  isFounder: boolean;
  permissions: Permission[];
  character: Character;
  online?: boolean;
  /** Rolle im Team (Vorlage für die Rechte) */
  role?: TeamRole;
  /** höchste Einzelausgabe vom Firmenkonto in Cent; fehlt = unbegrenzt */
  spendLimit?: Money;
  /** nur diese Standorte verwalten; fehlt/leer = alle */
  locationIds?: Id[];
}

export type TeamRole = 'ceo' | 'dispatcher' | 'fleet_manager' | 'hr_manager' | 'custom';

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

export type DriverStatus = 'idle' | 'on_trip' | 'resting' | 'sick' | 'vacation' | 'training' | 'traveling';

export type TrainingCourse = 'adr' | 'eco' | 'reefer' | 'heavy';

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
  /** Ende von Urlaub, Krankheit, Schulung oder Anreise */
  absentUntil?: GameTime;
  /** Anreise per Bahn (ohne Fahrzeug) zu dieser Stadt */
  travelTo?: string;
  trainingCourse?: TrainingCourse;
  /** verbleibende Urlaubstage im Kalenderjahr */
  vacationLeft?: number;
  /** Ende des letzten Urlaubs (bzw. Einstellung) */
  lastVacation?: GameTime;
  /** letztes Personalgespräch */
  lastTalk?: GameTime;
  /** Tage in Folge mit sehr niedriger Zufriedenheit */
  unhappyDays?: number;
  /** Kündigung eingereicht: verlässt die Firma zu diesem Zeitpunkt */
  leavesAt?: GameTime;
  /** Eigenschaft mit spürbarer Wirkung (nicht jeder Fahrer hat eine) */
  trait?: DriverTrait;
}

export type DriverTrait = 'frugal' | 'punctual' | 'leadfoot' | 'cheerful' | 'tough' | 'talker';

export interface Applicant extends Omit<
  Driver,
  'status' | 'hired' | 'tripId' | 'hos' | 'kmDriven' | 'satisfaction' | 'absentUntil' | 'travelTo' | 'trainingCourse' | 'vacationLeft' | 'lastVacation' | 'lastTalk' | 'unhappyDays' | 'leavesAt'
> {
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
  /** rented = Kurzzeitmiete (tageweise, jederzeit rückgabefähig) */
  ownership: 'owned' | 'leased' | 'rented';
  leaseRate?: Money; // pro Monat
  /** Mietpreis pro Tag (Kurzzeitmiete) */
  rentPerDay?: Money;
  /** laufende Fahrzeugfinanzierung */
  loanId?: Id;
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
  /** zu diesem Konkurrenten gewechselt (vergibt keine Aufträge mehr an den Spieler) */
  lostTo?: Id;
  lostAt?: GameTime;
  /** letzter Rückgewinnungsversuch */
  winBackAt?: GameTime;
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
  /** Tour aus einem Rahmenvertrag */
  contractId?: Id;
  status: OrderStatus;
  /** von einem Konkurrenten übernommen (Status „expired“) */
  takenBy?: Id;
  /** besonders lukrative Ausschreibung (Ereignis) */
  tender?: boolean;
  /** Premium-Auftrag: nur von Hand disponierbar */
  premium?: PremiumInfo;
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
  | 'blocked'
  | 'ferry'
  | 'breakdown'
  | 'accident'
  | 'ban'
  | 'border'
  | 'done';

export interface TripLeg {
  /** Knotenfolge (Stadt-IDs) im Straßennetz */
  nodes: string[];
  km: number;
  loaded: boolean;
}

export type ContractStatus = 'offered' | 'active' | 'completed' | 'cancelled' | 'expired';

/** Rahmenvertrag: regelmäßige Touren zu festem Preis über mehrere Wochen. */
export interface Contract {
  id: Id;
  customerId: Id;
  cargoId: string;
  fromCityId: string;
  toCityId: string;
  trailerType: TrailerType;
  qualifications: Qualification[];
  weightT: number;
  distanceKm: number;
  /** Abholtage (0 = Montag … 4 = Freitag) */
  weekdays: number[];
  /** Beginn des Ladefensters (Stunde) */
  pickupHour: number;
  paymentPerTour: Money;
  /** Strafe je nicht gefahrener Tour */
  penaltyMissed: Money;
  weeks: number;
  /** Stammkunde (bessere Konditionen) oder Ausschreibung */
  regular: boolean;
  status: ContractStatus;
  offerExpires: GameTime;
  start?: GameTime;
  end?: GameTime;
  /** Touren sind bis einschließlich dieses Tages angelegt */
  scheduledThrough?: number;
  stats: { tours: number; delivered: number; late: number; missed: number };
  /** aus einer Ausschreibung mit Pünktlichkeitsgarantie (Verspätungen kosten eine Strafe) */
  guarantee?: boolean;
}

/** Halt einer Auftragsfahrt. legs[i] führt zu stops[i]. */
export interface TripStop {
  kind: 'pickup' | 'delivery';
  orderId: Id;
  cityId: string;
}

/** Verkehrsstörung auf einer Straßenkante: Sperrung (nicht befahrbar) oder Stau (langsamer). */
export interface Disruption {
  id: Id;
  kind: 'closure' | 'jam';
  /** Kante a–b im Straßennetz */
  a: string;
  b: string;
  cause: string;
  from: GameTime;
  until: GameTime;
  /** Tempofaktor im Stau (0–1) */
  speedFactor: number;
}

export interface Trip {
  id: Id;
  /** Hauptauftrag (erster Auftrag der Fahrt); fehlt bei Überführungsfahrten */
  orderId?: Id;
  /** Lade- und Entladestellen; bei Beiladungen mehrere Aufträge. Fehlt bei Überführungen. */
  stops?: TripStop[];
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
  /** Index der Grenzkante, an der die Kontrolle schon erledigt ist */
  borderEdge?: number;
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

/** Interne Nachricht zwischen Spielern (nur Absender und Empfänger sehen sie). */
export interface InternalMessage {
  id: Id;
  t: GameTime;
  from: Id;
  to: Id[];
  subject: string;
  text: string;
  readBy: Id[];
  ref?: { kind: 'order' | 'trip' | 'vehicle' | 'driver'; id: Id };
}

export type TaskArea = 'dispatch' | 'fleet' | 'personnel' | 'finance' | 'expansion' | 'general';
export type TaskStatus = 'open' | 'doing' | 'done';

/** Aufgabe im Team (Aufgabenverteilung) */
export interface TeamTask {
  id: Id;
  title: string;
  note?: string;
  area: TaskArea;
  createdBy: Id;
  assignee?: Id;
  created: GameTime;
  due?: GameTime;
  status: TaskStatus;
  done?: GameTime;
}

export type JointKind = 'dinner' | 'event' | 'leisure' | 'meeting';

/** Gemeinsame Aktivität mehrerer Spieler (Einladung → Zusage → Durchführung) */
export interface JointActivity {
  id: Id;
  kind: JointKind;
  host: Id;
  invited: Id[];
  accepted: Id[];
  declined: Id[];
  created: GameTime;
  expires: GameTime;
  status: 'pending' | 'done' | 'cancelled' | 'expired';
}

/** Abstimmung über eine Unternehmensentscheidung */
export interface TeamVote {
  id: Id;
  question: string;
  options: string[];
  votes: Record<Id, number>;
  createdBy: Id;
  created: GameTime;
  closes: GameTime;
  status: 'open' | 'closed';
  /** Index der Gewinner-Option nach Abschluss (-1 = Gleichstand/keine Stimmen) */
  result?: number;
}

export type WeatherKind = 'clear' | 'rain' | 'fog' | 'snow' | 'ice' | 'storm' | 'heat';

/** Wetterlage eines Landes */
export interface CountryWeather {
  kind: WeatherKind;
  since: GameTime;
  until: GameTime;
}

export type EconomyPhase = 'normal' | 'boom' | 'crisis';

/** Nachfrage einer Region (Land) relativ zum Normalwert */
export interface RegionalMarket {
  factor: number;
  /** Zielwert, dem sich `factor` täglich nähert */
  target: number;
  reason?: string;
  until?: GameTime;
}

export interface Economy {
  /** Konjunktur 0,75–1,25 (1 = normal) */
  cycle: number;
  phase: EconomyPhase;
  phaseUntil: GameTime;
  lastPhaseChange: GameTime;
  regions: Record<string, RegionalMarket>;
}

export type CompetitorStrategy = 'budget' | 'premium' | 'regional';

/** KI-Spedition: eigene Flotte, Kasse und Standorte; nimmt Aufträge aus der Börse */
export interface Competitor {
  id: Id;
  name: string;
  hqCityId: string;
  cityIds: string[];
  trucks: number;
  cash: Money;
  /** 0–100 */
  reputation: number;
  /** Preisniveau gegenüber dem Markt (0,9 = 10 % günstiger) */
  priceLevel: number;
  strategy: CompetitorStrategy;
  founded: GameTime;
  status: 'active' | 'trouble' | 'bankrupt';
  troubleSince?: GameTime;
  bankruptAt?: GameTime;
  /** angefangene Auftragskapazität (Bruchteil) */
  carry: number;
  /** laufender und letzter Monat; `hours` = belegte LKW-Stunden (Auslastung) */
  month: { revenue: Money; costs: Money; orders: number; hours: number };
  lastMonth: { revenue: Money; costs: Money; orders: number; hours: number };
  totals: { orders: number; revenue: Money };
}

/** Ereignis aus dem Ereignisregelwerk (für die Übersicht „Ereignisse“) */
export interface WorldEvent {
  t: GameTime;
  rule: string;
  title: string;
  text: string;
  category: 'transport' | 'company' | 'market' | 'private';
  tone: 'good' | 'bad' | 'neutral';
}

/** Entscheidungskarte: ein Ereignis, bei dem der Spieler wählt (sonst gilt nach Ablauf die Vorgabe) */
export interface DecisionOption {
  id: string;
  label: string;
  /** kurze Folge, z. B. „+300 €/Monat, Zufriedenheit +18“ */
  hint: string;
}

export interface Decision {
  id: Id;
  rule: string;
  title: string;
  text: string;
  category: 'company' | 'personnel' | 'market' | 'private';
  /** private Entscheidungen gehören einem Spieler */
  playerId?: Id;
  created: GameTime;
  expires: GameTime;
  options: DecisionOption[];
  /** gilt, wenn niemand entscheidet */
  defaultOption: string;
  data: Record<string, string | number>;
}

/** Ausschreibung eines Rahmenvertrags: Spieler und KI-Konkurrenz geben verdeckte Gebote ab */
export interface Tender {
  id: Id;
  customerId: Id;
  cargoId: string;
  fromCityId: string;
  toCityId: string;
  trailerType: TrailerType;
  qualifications: Qualification[];
  weightT: number;
  distanceKm: number;
  weekdays: number[];
  pickupHour: number;
  weeks: number;
  /** marktüblicher Preis je Tour (Orientierung) */
  referencePrice: Money;
  created: GameTime;
  /** Zuschlag zu diesem Zeitpunkt */
  deadline: GameTime;
  status: 'open' | 'won' | 'lost' | 'expired';
  bid?: { price: Money; guarantee: boolean; by: Id; at: GameTime };
  result?: { winner: string; price: Money; bids: { name: string; price: Money; player?: boolean }[]; note?: string };
}

/** Premium-Auftrag: Schwertransport (Genehmigung nötig) oder Messe-Termin (enges Zeitfenster, hohe Strafe) */
export interface PremiumInfo {
  kind: 'heavy' | 'fair';
  /** Bezeichnung der Ladung bzw. Messe */
  title: string;
  /** Schwertransport: Stand der Genehmigung */
  permit?: 'none' | 'pending' | 'granted';
  permitReady?: GameTime;
  permitCost?: Money;
  /** Bearbeitungszeit der Behörde in Stunden */
  permitHours?: number;
  /** Ansehen bei pünktlicher Lieferung */
  reputation: number;
}

export type ScenarioId = 'free' | 'restart' | 'family' | 'reefer' | 'tycoon';

export interface ScenarioState {
  id: ScenarioId;
  started: GameTime;
  deadline: GameTime;
  status: 'running' | 'won' | 'failed';
  finishedAt?: GameTime;
  /** Zählerstände bei Spielbeginn */
  base: Record<string, number>;
}

export interface QuarterGoal {
  kind: 'revenue' | 'deliveries' | 'ontime' | 'empty' | 'reputation' | 'fleet' | 'balance';
  target: number;
  /** Zählerstand zu Quartalsbeginn */
  base: number;
  /** zweiter Zählerstand (Verspätungen bzw. Last-km) */
  base2?: number;
}

export interface QuarterState {
  /** laufende Nummer ab 1 */
  index: number;
  start: GameTime;
  end: GameTime;
  goals: QuarterGoal[];
}

export interface QuarterResult {
  index: number;
  end: GameTime;
  met: number;
  of: number;
  rating: number;
}

/** Erfolge, Rekorde und Zähler für Szenarien und Ziele */
export interface ProgressState {
  /** freigeschaltete Erfolge mit Zeitpunkt */
  achievements: Record<string, GameTime>;
  records: {
    longestKm: number;
    bestPayment: Money;
    bestMonth: Money;
    onTimeStreak: number;
    bestStreak: number;
    maxVehicles: number;
    maxBalance: Money;
  };
  counts: {
    international: number;
    premium: number;
    heavy: number;
    fair: number;
    reefer: number;
    tendersWon: number;
    quartersMet: number;
  };
  /** Zielländer erfolgreicher Lieferungen */
  countries: string[];
}

export interface EventState {
  /** letzter Auslösezeitpunkt je Regel (bei privaten Ereignissen je Spieler: `regel:spieler`) */
  last: Record<string, GameTime>;
  lastBad?: GameTime;
  history: WorldEvent[];
}

/** Zusammenarbeit im Team: Nachrichten, Aufgaben, gemeinsame Aktivitäten, Abstimmungen */
export interface TeamState {
  messages: InternalMessage[];
  tasks: TeamTask[];
  activities: JointActivity[];
  votes: TeamVote[];
  /** Teambesprechung: bessere Abstimmung im Vertrieb bis zu diesem Zeitpunkt */
  meetingBonusUntil?: GameTime;
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
  /** aktive Verkehrsstörungen (Sperrungen, Staus) */
  disruptions: Disruption[];
  /** Rahmenverträge (Angebote, laufende und beendete) */
  contracts: Record<Id, Contract>;
  /** KI-Disposition: Modus, Regeln, Vorschläge */
  autoDispatch: AutoDispatchState;
  /** Multiplayer-Zusammenarbeit */
  team: TeamState;
  /** Wetter je Land (ISO-Code) */
  weather: Record<string, CountryWeather>;
  /** Konjunktur und regionale Nachfrage */
  economy: Economy;
  /** KI-Konkurrenz */
  competitors: Record<Id, Competitor>;
  /** Ereignisregelwerk */
  events: EventState;
  /** offene Entscheidungskarten */
  decisions: Decision[];
  /** bei neuen Entscheidungskarten anhalten (fehlt: an im Einzelspiel, aus im Multiplayer) */
  pauseOnDecision?: boolean;
  /** wegen einer Entscheidung angehalten – nach der letzten Wahl geht es von selbst weiter */
  pausedForDecision?: boolean;
  /** Ausschreibungen von Rahmenverträgen */
  tenders: Record<Id, Tender>;
  /** Szenario mit eigenem Ziel (fehlt: freies Spiel) */
  scenario?: ScenarioState;
  /** Quartalsziele der Hausbank */
  quarter?: QuarterState;
  quarterHistory: QuarterResult[];
  /** Erfolge und Rekorde */
  progress: ProgressState;
}
