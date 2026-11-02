// Europäische Städte der Spielwelt.
// Koordinaten: WGS84. Einwohner: grobe Ballungsraum-Größe in Tausend (gerundet, für Spielbalance).
// Branchen-Tags steuern das Warenflussmodell (welche Güter hier erzeugt bzw. benötigt werden).

export type Industry =
  | 'port'
  | 'chemical'
  | 'automotive'
  | 'food'
  | 'agriculture'
  | 'steel'
  | 'retail'
  | 'logistics'
  | 'electronics'
  | 'pharma'
  | 'machinery'
  | 'timber'
  | 'construction';

export interface CityDef {
  id: string;
  name: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lon: number;
  pop: number; // Tausend
  industries: Industry[];
  /** Landmasse für die Straßennetz-Erzeugung; Verbindungen zwischen Landmassen nur über definierte Übergänge. */
  land?: 'gb';
}

const c = (
  id: string,
  name: string,
  country: string,
  lat: number,
  lon: number,
  pop: number,
  industries: Industry[],
  land?: 'gb',
): CityDef => ({ id, name, country, lat, lon, pop, industries, ...(land ? { land } : {}) });

export const CITIES: CityDef[] = [
  // Deutschland
  c('berlin', 'Berlin', 'DE', 52.52, 13.405, 3700, ['retail', 'electronics', 'logistics']),
  c('hamburg', 'Hamburg', 'DE', 53.551, 9.994, 1900, ['port', 'retail', 'food']),
  c('muenchen', 'München', 'DE', 48.137, 11.575, 1500, ['automotive', 'electronics', 'retail']),
  c('koeln', 'Köln', 'DE', 50.938, 6.96, 1090, ['chemical', 'retail']),
  c('frankfurt', 'Frankfurt am Main', 'DE', 50.11, 8.682, 760, ['logistics', 'pharma', 'retail']),
  c('stuttgart', 'Stuttgart', 'DE', 48.776, 9.183, 630, ['automotive', 'machinery']),
  c('duesseldorf', 'Düsseldorf', 'DE', 51.227, 6.774, 620, ['retail', 'chemical']),
  c('duisburg', 'Duisburg', 'DE', 51.434, 6.762, 500, ['port', 'steel', 'logistics']),
  c('dortmund', 'Dortmund', 'DE', 51.514, 7.468, 590, ['logistics', 'machinery']),
  c('leipzig', 'Leipzig', 'DE', 51.34, 12.375, 600, ['automotive', 'logistics']),
  c('dresden', 'Dresden', 'DE', 51.05, 13.738, 560, ['electronics', 'construction']),
  c('hannover', 'Hannover', 'DE', 52.375, 9.732, 540, ['automotive', 'machinery']),
  c('nuernberg', 'Nürnberg', 'DE', 49.452, 11.077, 520, ['machinery', 'logistics']),
  c('bremen', 'Bremen', 'DE', 53.079, 8.802, 570, ['port', 'food', 'automotive']),
  c('mannheim', 'Mannheim', 'DE', 49.487, 8.466, 310, ['chemical', 'machinery']),
  c('wolfsburg', 'Wolfsburg', 'DE', 52.423, 10.787, 125, ['automotive']),
  c('ingolstadt', 'Ingolstadt', 'DE', 48.766, 11.425, 140, ['automotive']),
  c('kassel', 'Kassel', 'DE', 51.312, 9.479, 200, ['logistics', 'automotive']),
  c('erfurt', 'Erfurt', 'DE', 50.978, 11.029, 215, ['logistics', 'food']),
  c('rostock', 'Rostock', 'DE', 54.092, 12.099, 210, ['port', 'agriculture']),
  c('kiel', 'Kiel', 'DE', 54.323, 10.123, 245, ['port', 'food']),
  c('saarbruecken', 'Saarbrücken', 'DE', 49.24, 6.997, 180, ['steel', 'automotive']),
  c('regensburg', 'Regensburg', 'DE', 49.013, 12.102, 155, ['automotive', 'electronics']),
  c('magdeburg', 'Magdeburg', 'DE', 52.131, 11.64, 237, ['machinery', 'agriculture']),
  c('muenster', 'Münster', 'DE', 51.961, 7.626, 315, ['agriculture', 'food']),
  c('freiburg', 'Freiburg', 'DE', 47.999, 7.842, 230, ['pharma', 'timber']),
  c('augsburg', 'Augsburg', 'DE', 48.371, 10.898, 300, ['machinery', 'construction']),
  c('wuerzburg', 'Würzburg', 'DE', 49.792, 9.953, 127, ['food', 'logistics']),
  c('osnabrueck', 'Osnabrück', 'DE', 52.279, 8.047, 165, ['food', 'agriculture']),
  // Österreich
  c('wien', 'Wien', 'AT', 48.208, 16.373, 1900, ['retail', 'logistics']),
  c('linz', 'Linz', 'AT', 48.306, 14.286, 210, ['steel', 'chemical']),
  c('graz', 'Graz', 'AT', 47.07, 15.439, 290, ['automotive', 'timber']),
  c('salzburg', 'Salzburg', 'AT', 47.809, 13.055, 155, ['food', 'timber']),
  c('innsbruck', 'Innsbruck', 'AT', 47.269, 11.404, 130, ['logistics', 'construction']),
  // Schweiz
  c('zuerich', 'Zürich', 'CH', 47.377, 8.541, 1400, ['pharma', 'retail']),
  c('basel', 'Basel', 'CH', 47.56, 7.588, 175, ['pharma', 'chemical', 'port']),
  c('bern', 'Bern', 'CH', 46.948, 7.447, 135, ['retail', 'food']),
  c('genf', 'Genf', 'CH', 46.204, 6.143, 200, ['retail', 'electronics']),
  // Frankreich
  c('paris', 'Paris', 'FR', 48.857, 2.352, 11000, ['retail', 'food', 'logistics']),
  c('lyon', 'Lyon', 'FR', 45.764, 4.836, 2300, ['chemical', 'pharma']),
  c('marseille', 'Marseille', 'FR', 43.297, 5.381, 1800, ['port', 'chemical']),
  c('lille', 'Lille', 'FR', 50.629, 3.057, 1200, ['retail', 'logistics']),
  c('strassburg', 'Straßburg', 'FR', 48.573, 7.752, 500, ['logistics', 'food']),
  c('bordeaux', 'Bordeaux', 'FR', 44.838, -0.579, 1000, ['food', 'agriculture']),
  c('toulouse', 'Toulouse', 'FR', 43.605, 1.444, 1000, ['machinery', 'electronics']),
  c('nantes', 'Nantes', 'FR', 47.218, -1.554, 970, ['food', 'agriculture']),
  c('lehavre', 'Le Havre', 'FR', 49.494, 0.108, 240, ['port', 'chemical']),
  c('rennes', 'Rennes', 'FR', 48.117, -1.678, 730, ['agriculture', 'food', 'automotive']),
  c('nancy', 'Nancy', 'FR', 48.692, 6.184, 430, ['steel', 'construction']),
  c('dijon', 'Dijon', 'FR', 47.322, 5.041, 390, ['food', 'agriculture']),
  c('reims', 'Reims', 'FR', 49.258, 4.032, 300, ['agriculture', 'food']),
  c('orleans', 'Orléans', 'FR', 47.903, 1.909, 450, ['logistics', 'pharma']),
  c('clermont', 'Clermont-Ferrand', 'FR', 45.778, 3.087, 480, ['automotive']),
  c('montpellier', 'Montpellier', 'FR', 43.611, 3.877, 600, ['agriculture']),
  c('nizza', 'Nizza', 'FR', 43.71, 7.262, 950, ['retail']),
  c('calais', 'Calais', 'FR', 50.951, 1.858, 75, ['port', 'logistics']),
  // Benelux
  c('amsterdam', 'Amsterdam', 'NL', 52.368, 4.904, 2400, ['retail', 'food', 'logistics']),
  c('rotterdam', 'Rotterdam', 'NL', 51.924, 4.478, 1000, ['port', 'chemical']),
  c('utrecht', 'Utrecht', 'NL', 52.091, 5.122, 650, ['logistics', 'retail']),
  c('eindhoven', 'Eindhoven', 'NL', 51.441, 5.47, 750, ['electronics', 'automotive']),
  c('venlo', 'Venlo', 'NL', 51.37, 6.172, 100, ['logistics', 'agriculture']),
  c('antwerpen', 'Antwerpen', 'BE', 51.219, 4.402, 1050, ['port', 'chemical']),
  c('bruessel', 'Brüssel', 'BE', 50.85, 4.352, 2100, ['retail', 'pharma']),
  c('gent', 'Gent', 'BE', 51.054, 3.717, 560, ['steel', 'port']),
  c('luettich', 'Lüttich', 'BE', 50.633, 5.567, 750, ['steel', 'logistics']),
  c('luxemburg', 'Luxemburg', 'LU', 49.612, 6.13, 130, ['steel', 'logistics']),
  // Vereinigtes Königreich
  c('london', 'London', 'GB', 51.507, -0.128, 9500, ['retail', 'food'], 'gb'),
  c('birmingham', 'Birmingham', 'GB', 52.486, -1.89, 2900, ['automotive', 'machinery'], 'gb'),
  c('manchester', 'Manchester', 'GB', 53.481, -2.243, 2800, ['retail', 'logistics'], 'gb'),
  c('leeds', 'Leeds', 'GB', 53.8, -1.549, 1900, ['retail', 'food'], 'gb'),
  c('glasgow', 'Glasgow', 'GB', 55.864, -4.252, 1800, ['food', 'machinery'], 'gb'),
  c('bristol', 'Bristol', 'GB', 51.455, -2.588, 700, ['machinery', 'retail'], 'gb'),
  c('newcastle', 'Newcastle', 'GB', 54.978, -1.618, 800, ['machinery', 'chemical'], 'gb'),
  c('southampton', 'Southampton', 'GB', 50.91, -1.404, 250, ['port', 'automotive'], 'gb'),
  c('felixstowe', 'Felixstowe', 'GB', 51.963, 1.351, 25, ['port', 'logistics'], 'gb'),
  c('dover', 'Dover', 'GB', 51.127, 1.313, 40, ['port', 'logistics'], 'gb'),
  // Spanien & Portugal
  c('madrid', 'Madrid', 'ES', 40.417, -3.704, 6700, ['retail', 'logistics']),
  c('barcelona', 'Barcelona', 'ES', 41.385, 2.173, 5600, ['port', 'automotive', 'chemical']),
  c('valencia', 'Valencia', 'ES', 39.47, -0.376, 1600, ['port', 'agriculture']),
  c('sevilla', 'Sevilla', 'ES', 37.389, -5.984, 1500, ['agriculture', 'food']),
  c('bilbao', 'Bilbao', 'ES', 43.263, -2.935, 1000, ['steel', 'port']),
  c('zaragoza', 'Saragossa', 'ES', 41.649, -0.889, 700, ['logistics', 'automotive']),
  c('murcia', 'Murcia', 'ES', 37.992, -1.131, 650, ['agriculture', 'food']),
  c('valladolid', 'Valladolid', 'ES', 41.652, -4.725, 420, ['automotive', 'agriculture']),
  c('malaga', 'Málaga', 'ES', 36.721, -4.421, 1000, ['agriculture', 'retail']),
  c('vigo', 'Vigo', 'ES', 42.24, -8.721, 480, ['port', 'automotive', 'food']),
  c('lissabon', 'Lissabon', 'PT', 38.722, -9.139, 2900, ['port', 'retail']),
  c('porto', 'Porto', 'PT', 41.158, -8.629, 1700, ['food', 'timber']),
  // Italien
  c('mailand', 'Mailand', 'IT', 45.464, 9.19, 4300, ['retail', 'machinery', 'pharma']),
  c('turin', 'Turin', 'IT', 45.07, 7.687, 2200, ['automotive', 'machinery']),
  c('rom', 'Rom', 'IT', 41.903, 12.496, 4300, ['retail', 'food']),
  c('neapel', 'Neapel', 'IT', 40.852, 14.268, 3100, ['port', 'food']),
  c('genua', 'Genua', 'IT', 44.405, 8.946, 820, ['port', 'steel']),
  c('venedig', 'Venedig-Mestre', 'IT', 45.49, 12.242, 850, ['port', 'chemical']),
  c('bologna', 'Bologna', 'IT', 44.494, 11.343, 1000, ['machinery', 'food', 'automotive']),
  c('verona', 'Verona', 'IT', 45.438, 10.992, 920, ['logistics', 'food']),
  c('florenz', 'Florenz', 'IT', 43.77, 11.256, 1000, ['retail', 'construction']),
  c('bari', 'Bari', 'IT', 41.117, 16.872, 1200, ['agriculture', 'port']),
  c('brescia', 'Brescia', 'IT', 45.541, 10.211, 1200, ['steel', 'machinery']),
  c('triest', 'Triest', 'IT', 45.65, 13.777, 230, ['port', 'logistics']),
  c('padua', 'Padua', 'IT', 45.407, 11.877, 930, ['logistics', 'machinery']),
  c('ancona', 'Ancona', 'IT', 43.616, 13.519, 470, ['port', 'machinery']),
  c('pescara', 'Pescara', 'IT', 42.461, 14.214, 320, ['food', 'agriculture']),
  // Polen
  c('warschau', 'Warschau', 'PL', 52.23, 21.012, 3100, ['retail', 'logistics']),
  c('krakau', 'Krakau', 'PL', 50.065, 19.945, 1400, ['electronics', 'retail']),
  c('breslau', 'Breslau', 'PL', 51.108, 17.039, 1200, ['automotive', 'electronics']),
  c('posen', 'Posen', 'PL', 52.407, 16.93, 1000, ['logistics', 'food']),
  c('danzig', 'Danzig', 'PL', 54.352, 18.646, 1100, ['port', 'chemical']),
  c('lodz', 'Łódź', 'PL', 51.759, 19.456, 1000, ['logistics', 'retail']),
  c('kattowitz', 'Kattowitz', 'PL', 50.264, 19.024, 2700, ['steel', 'automotive']),
  c('stettin', 'Stettin', 'PL', 53.429, 14.553, 700, ['port', 'chemical']),
  c('lublin', 'Lublin', 'PL', 51.246, 22.568, 660, ['agriculture', 'food']),
  c('bialystok', 'Białystok', 'PL', 53.133, 23.169, 450, ['food', 'timber']),
  // Tschechien & Slowakei
  c('prag', 'Prag', 'CZ', 50.075, 14.438, 2700, ['retail', 'automotive']),
  c('bruenn', 'Brünn', 'CZ', 49.195, 16.608, 700, ['machinery', 'construction']),
  c('ostrau', 'Ostrau', 'CZ', 49.82, 18.262, 1100, ['steel', 'chemical']),
  c('pilsen', 'Pilsen', 'CZ', 49.738, 13.373, 300, ['automotive', 'food']),
  c('mladaboleslav', 'Mladá Boleslav', 'CZ', 50.411, 14.903, 45, ['automotive']),
  c('bratislava', 'Bratislava', 'SK', 48.148, 17.107, 700, ['automotive', 'chemical']),
  c('kosice', 'Košice', 'SK', 48.716, 21.261, 360, ['steel']),
  c('zilina', 'Žilina', 'SK', 49.223, 18.739, 160, ['automotive', 'timber']),
  // Ungarn
  c('budapest', 'Budapest', 'HU', 47.498, 19.04, 3000, ['retail', 'pharma']),
  c('gyoer', 'Győr', 'HU', 47.687, 17.65, 130, ['automotive']),
  c('debrecen', 'Debrecen', 'HU', 47.531, 21.627, 200, ['pharma', 'agriculture']),
  c('szeged', 'Szeged', 'HU', 46.253, 20.141, 160, ['agriculture', 'food']),
  // Westbalkan
  c('ljubljana', 'Ljubljana', 'SI', 46.056, 14.506, 550, ['pharma', 'retail']),
  c('koper', 'Koper', 'SI', 45.548, 13.73, 25, ['port', 'automotive']),
  c('zagreb', 'Zagreb', 'HR', 45.815, 15.982, 1100, ['food', 'retail']),
  c('rijeka', 'Rijeka', 'HR', 45.327, 14.442, 200, ['port']),
  c('split', 'Split', 'HR', 43.508, 16.44, 350, ['port', 'construction']),
  c('belgrad', 'Belgrad', 'RS', 44.787, 20.457, 1700, ['retail', 'logistics']),
  c('novisad', 'Novi Sad', 'RS', 45.267, 19.833, 400, ['agriculture', 'food']),
  c('sarajevo', 'Sarajevo', 'BA', 43.856, 18.413, 550, ['timber', 'retail']),
  c('skopje', 'Skopje', 'MK', 41.998, 21.425, 600, ['steel', 'retail']),
  // Rumänien & Bulgarien & Griechenland
  c('bukarest', 'Bukarest', 'RO', 44.426, 26.103, 2300, ['retail', 'logistics']),
  c('cluj', 'Cluj-Napoca', 'RO', 46.771, 23.624, 410, ['electronics', 'food']),
  c('timisoara', 'Timișoara', 'RO', 45.748, 21.209, 330, ['automotive', 'electronics']),
  c('constanta', 'Constanța', 'RO', 44.16, 28.635, 300, ['port', 'agriculture']),
  c('pitesti', 'Pitești', 'RO', 44.856, 24.869, 155, ['automotive']),
  c('brasov', 'Brașov', 'RO', 45.658, 25.601, 290, ['machinery', 'timber']),
  c('sofia', 'Sofia', 'BG', 42.698, 23.322, 1300, ['retail', 'machinery']),
  c('plowdiw', 'Plowdiw', 'BG', 42.135, 24.745, 550, ['agriculture', 'food']),
  c('varna', 'Warna', 'BG', 43.214, 27.915, 330, ['port', 'chemical']),
  c('athen', 'Athen', 'GR', 37.984, 23.728, 3700, ['retail', 'port']),
  c('thessaloniki', 'Thessaloniki', 'GR', 40.64, 22.944, 1000, ['port', 'food']),
  // Skandinavien
  c('kopenhagen', 'Kopenhagen', 'DK', 55.676, 12.568, 2000, ['retail', 'pharma']),
  c('aarhus', 'Aarhus', 'DK', 56.163, 10.203, 360, ['port', 'food']),
  c('odense', 'Odense', 'DK', 55.403, 10.402, 200, ['machinery', 'food']),
  c('stockholm', 'Stockholm', 'SE', 59.329, 18.069, 2400, ['retail', 'electronics']),
  c('goeteborg', 'Göteborg', 'SE', 57.709, 11.975, 1100, ['port', 'automotive']),
  c('malmoe', 'Malmö', 'SE', 55.605, 13.004, 750, ['logistics', 'food']),
  c('joenkoeping', 'Jönköping', 'SE', 57.783, 14.161, 140, ['logistics', 'timber']),
  c('oerebro', 'Örebro', 'SE', 59.275, 15.213, 160, ['logistics', 'retail']),
  c('sundsvall', 'Sundsvall', 'SE', 62.39, 17.31, 100, ['timber', 'chemical']),
  c('oslo', 'Oslo', 'NO', 59.913, 10.752, 1600, ['retail', 'food']),
  c('bergen', 'Bergen', 'NO', 60.391, 5.322, 420, ['port', 'food']),
  c('trondheim', 'Trondheim', 'NO', 63.431, 10.395, 210, ['food', 'timber']),
  // Baltikum
  c('kaunas', 'Kaunas', 'LT', 54.899, 23.904, 400, ['logistics', 'food']),
  c('vilnius', 'Vilnius', 'LT', 54.687, 25.28, 700, ['retail', 'electronics']),
  c('riga', 'Riga', 'LV', 56.95, 24.105, 900, ['port', 'timber']),
  c('tallinn', 'Tallinn', 'EE', 59.437, 24.754, 600, ['port', 'electronics']),
];

/** Manuell definierte Übergänge zwischen Landmassen (Fähre / Tunnel). */
export const CROSSINGS: [string, string][] = [['calais', 'dover']];

export const CITY_BY_ID: Record<string, CityDef> = Object.fromEntries(CITIES.map((x) => [x.id, x]));
