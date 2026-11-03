// Server-Konfiguration: Kommandozeile > Umgebungsvariablen > Konfigurationsdatei > Standardwerte.
// Die Konfigurationsdatei (JSON) wird per --config <Datei> angegeben oder als cargovia-server.json
// im Arbeitsverzeichnis gefunden.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface ServerConfig {
  /** TCP-Port für WebSocket und /health */
  port: number;
  /** Netzwerkadresse, an die der Server bindet ('0.0.0.0' = alle, '127.0.0.1' = nur dieser PC, z. B. hinter einem Reverse Proxy) */
  host: string;
  /** SQLite-Datenbank mit allen Multiplayer-Firmen */
  db: string;
  /** automatisches Speichern geänderter Firmen (Sekunden) */
  saveSeconds: number;
  /** Abstand zwischen zwei Sicherungskopien je Firma (Minuten) */
  backupMinutes: number;
  /** so viele Sicherungskopien je Firma behalten */
  backupsKeep: number;
  /** maximale Spieler je Firma */
  maxPlayers: number;
}

export const DEFAULT_CONFIG: ServerConfig = {
  port: 8787,
  host: '0.0.0.0',
  db: 'apps/server/data/spedsim.db',
  saveSeconds: 30,
  backupMinutes: 10,
  backupsKeep: 10,
  maxPlayers: 8,
};

const LIMITS: Record<Exclude<keyof ServerConfig, 'host' | 'db'>, [number, number]> = {
  port: [1, 65535],
  saveSeconds: [5, 3600],
  backupMinutes: [1, 1440],
  backupsKeep: [1, 200],
  maxPlayers: [1, 8],
};

const ENV: Record<keyof ServerConfig, string[]> = {
  port: ['CARGOVIA_PORT', 'PORT'],
  host: ['CARGOVIA_HOST', 'HOST'],
  db: ['CARGOVIA_DB', 'DB'],
  saveSeconds: ['CARGOVIA_SAVE_SECONDS'],
  backupMinutes: ['CARGOVIA_BACKUP_MINUTES'],
  backupsKeep: ['CARGOVIA_BACKUPS_KEEP'],
  maxPlayers: ['CARGOVIA_MAX_PLAYERS'],
};

const FLAG: Record<keyof ServerConfig, string> = {
  port: 'port', host: 'host', db: 'db', saveSeconds: 'save-seconds', backupMinutes: 'backup-minutes', backupsKeep: 'backups-keep', maxPlayers: 'max-players',
};

export class ConfigError extends Error {}

export const USAGE = `Cargovia-Multiplayer-Server

Aufruf: spedsim-server [Optionen]

  --config <Datei>         JSON-Konfigurationsdatei (Standard: ./cargovia-server.json, falls vorhanden)
  --port <Zahl>            Port (Standard 8787)            Umgebung: CARGOVIA_PORT / PORT
  --host <Adresse>         Bind-Adresse (Standard 0.0.0.0) Umgebung: CARGOVIA_HOST
  --db <Datei>             SQLite-Datenbank                Umgebung: CARGOVIA_DB / DB
  --save-seconds <Zahl>    Speicherintervall (30)          Umgebung: CARGOVIA_SAVE_SECONDS
  --backup-minutes <Zahl>  Abstand der Sicherungen (10)    Umgebung: CARGOVIA_BACKUP_MINUTES
  --backups-keep <Zahl>    Sicherungen je Firma (10)       Umgebung: CARGOVIA_BACKUPS_KEEP
  --max-players <Zahl>     Spieler je Firma, 1–8 (8)       Umgebung: CARGOVIA_MAX_PLAYERS
  --help, --version

Zustand prüfen: GET http://<host>:<port>/health`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new ConfigError(`Option --${name} braucht einen Wert.`);
  return v;
}

function coerce(key: keyof ServerConfig, raw: unknown, source: string): string | number {
  if (key === 'host' || key === 'db') {
    if (typeof raw !== 'string' || !raw.trim()) throw new ConfigError(`${source}: „${key}“ muss ein Text sein.`);
    return raw.trim();
  }
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  const [min, max] = LIMITS[key];
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${source}: „${key}“ muss eine ganze Zahl von ${min} bis ${max} sein (ist ${JSON.stringify(raw)}).`);
  return n;
}

/** Konfiguration ermitteln. `cwd` und `env` sind für Tests austauschbar. */
export function loadConfig(argv: string[], env: Record<string, string | undefined> = process.env, cwd = process.cwd()): ServerConfig {
  const cfg: Record<string, unknown> = { ...DEFAULT_CONFIG, db: join(cwd, DEFAULT_CONFIG.db) };
  const explicit = flag(argv, 'config');
  const file = explicit ? resolve(cwd, explicit) : join(cwd, 'cargovia-server.json');
  if (explicit || existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new ConfigError(`Konfigurationsdatei ${file} nicht lesbar: ${(e as Error).message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ConfigError(`Konfigurationsdatei ${file}: JSON-Objekt erwartet.`);
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('$') || k.startsWith('_')) continue; // Kommentare/Schema
      if (!(k in DEFAULT_CONFIG)) throw new ConfigError(`Konfigurationsdatei ${file}: unbekannte Einstellung „${k}“.`);
      const val = coerce(k as keyof ServerConfig, v, file);
      // relative Datenbankpfade beziehen sich auf den Ordner der Konfigurationsdatei
      cfg[k] = k === 'db' && !isAbsolute(val as string) ? resolve(dirname(file), val as string) : val;
    }
  }
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof ServerConfig)[]) {
    const name = ENV[key].find((n) => env[n] !== undefined && env[n] !== '');
    if (name) cfg[key] = coerce(key, env[name], `Umgebungsvariable ${name}`);
    const cli = flag(argv, FLAG[key]);
    if (cli !== undefined) cfg[key] = coerce(key, cli, `--${FLAG[key]}`);
  }
  if (typeof cfg.db === 'string' && !isAbsolute(cfg.db)) cfg.db = resolve(cwd, cfg.db);
  return cfg as unknown as ServerConfig;
}
