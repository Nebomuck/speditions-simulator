// Namensbausteine für prozedural erzeugte Personen und Firmen (frei erfunden).

export const FIRST_NAMES: Record<string, string[]> = {
  DE: ['Thomas', 'Sabine', 'Michael', 'Andrea', 'Stefan', 'Katrin', 'Jürgen', 'Nicole', 'Markus', 'Sandra', 'Dirk', 'Jana', 'Uwe', 'Melanie', 'Sven', 'Tobias'],
  PL: ['Piotr', 'Anna', 'Krzysztof', 'Magdalena', 'Tomasz', 'Agnieszka', 'Paweł', 'Marek', 'Ewa', 'Łukasz'],
  CZ: ['Jan', 'Petra', 'Tomáš', 'Lucie', 'Martin', 'Jana', 'Pavel', 'Hana'],
  FR: ['Julien', 'Camille', 'Nicolas', 'Sophie', 'Mathieu', 'Claire', 'Antoine', 'Élodie'],
  IT: ['Marco', 'Giulia', 'Luca', 'Francesca', 'Matteo', 'Chiara', 'Davide', 'Sara'],
  ES: ['Javier', 'Lucía', 'Carlos', 'Marta', 'Sergio', 'Elena', 'Pablo', 'Laura'],
  NL: ['Daan', 'Sanne', 'Jeroen', 'Femke', 'Bram', 'Lotte', 'Ruud', 'Eva'],
  RO: ['Andrei', 'Ioana', 'Mihai', 'Elena', 'Bogdan', 'Cristina', 'Florin', 'Alina'],
  HU: ['Gábor', 'Eszter', 'Zoltán', 'Katalin', 'László', 'Anna'],
  XX: ['Alex', 'Robin', 'Sam', 'Kim', 'Chris', 'Jo', 'Mika', 'Nico', 'Luka', 'Ana', 'Ivan', 'Nina'],
};

export const LAST_NAMES: Record<string, string[]> = {
  DE: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Koch', 'Richter', 'Wolf', 'Neumann', 'Krüger', 'Lange', 'Brandt'],
  PL: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański'],
  CZ: ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Procházka', 'Kučera'],
  FR: ['Martin', 'Bernard', 'Dubois', 'Laurent', 'Moreau', 'Lefèvre', 'Girard'],
  IT: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo'],
  ES: ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Romero'],
  NL: ['de Jong', 'Jansen', 'de Vries', 'van Dijk', 'Bakker', 'Visser'],
  RO: ['Popescu', 'Ionescu', 'Popa', 'Dumitru', 'Stan', 'Stoica'],
  HU: ['Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga'],
  XX: ['Petrović', 'Jovanović', 'Andersen', 'Nielsen', 'Johansson', 'Berg', 'Kask', 'Ozols', 'Kazlauskas', 'Ivanov', 'Dimitrov', 'Papadopoulos'],
};

export const COMPANY_PREFIX = ['Nord', 'Süd', 'West', 'Ost', 'Euro', 'Alpen', 'Rhein', 'Donau', 'Baltic', 'Iber', 'Atlas', 'Delta', 'Terra', 'Nova', 'Vita', 'Helio', 'Kron', 'Stern', 'Falk', 'Linden'];
export const COMPANY_CORE: Record<string, string[]> = {
  port: ['Hafen-Terminal', 'Port Services', 'Container Hub', 'Maritime'],
  chemical: ['Chemie', 'Chemicals', 'Polymer', 'Kunststoffe'],
  automotive: ['Automotive', 'Fahrzeugwerk', 'Autoteile', 'Motorenwerk'],
  food: ['Lebensmittel', 'Feinkost', 'Molkerei', 'Backwaren', 'Frischdienst'],
  agriculture: ['Agrar', 'Landhandel', 'Saatgut', 'Getreide'],
  steel: ['Stahl', 'Walzwerk', 'Metallbau', 'Stahlhandel'],
  retail: ['Handel', 'Markt', 'Retail', 'Warenhaus'],
  logistics: ['Logistik', 'Distribution', 'Lager & Logistik'],
  electronics: ['Elektronik', 'Electronics', 'Halbleiter', 'Technik'],
  pharma: ['Pharma', 'Medizintechnik', 'Life Sciences'],
  machinery: ['Maschinenbau', 'Anlagenbau', 'Industrietechnik'],
  timber: ['Holz', 'Sägewerk', 'Forst'],
  construction: ['Baustoffe', 'Bau', 'Beton'],
};

export const LEGAL_FORM: Record<string, string> = {
  DE: 'GmbH', AT: 'GmbH', CH: 'AG', FR: 'SAS', IT: 'S.p.A.', ES: 'S.L.', PT: 'Lda.', NL: 'B.V.', BE: 'NV', LU: 'S.à r.l.',
  GB: 'Ltd', PL: 'Sp. z o.o.', CZ: 's.r.o.', SK: 's.r.o.', HU: 'Kft.', SI: 'd.o.o.', HR: 'd.o.o.', RS: 'd.o.o.', BA: 'd.o.o.',
  MK: 'DOOEL', RO: 'S.R.L.', BG: 'OOD', GR: 'A.E.', DK: 'A/S', SE: 'AB', NO: 'AS', LT: 'UAB', LV: 'SIA', EE: 'OÜ', FI: 'Oy', ME: 'd.o.o.', AL: 'sh.p.k.',
};
