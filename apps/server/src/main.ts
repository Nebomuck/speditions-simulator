// Startpunkt des Multiplayer-Servers.
//   npm run server -- --port 8787 --db apps/server/data/spedsim.db
//   (Optionen, Umgebungsvariablen und Konfigurationsdatei: siehe config.ts bzw. --help)
// Als Begleitprogramm der Desktop-App wird er gebündelt (tools/build-server.ts) und mit
// --port/--db aufgerufen; die App startet und beendet ihn automatisch.

import pkg from '../package.json' with { type: 'json' };
import { ConfigError, USAGE, loadConfig } from './config.ts';
import { startServer } from './server.ts';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
if (argv.includes('--version')) {
  console.log(pkg.version);
  process.exit(0);
}

const fail = (error: string) => {
  console.error(JSON.stringify({ msg: 'start_failed', error }));
  process.exit(1);
};

let server: ReturnType<typeof startServer>;
try {
  const cfg = loadConfig(argv);
  server = startServer({
    port: cfg.port, host: cfg.host, dbPath: cfg.db, saveMs: cfg.saveSeconds * 1000,
    backupMinutes: cfg.backupMinutes, backupsKeep: cfg.backupsKeep, maxPlayers: cfg.maxPlayers, version: pkg.version,
  });
} catch (e) {
  fail(e instanceof ConfigError ? e.message : `${(e as Error).message}`);
}
server!.ready.catch((e: NodeJS.ErrnoException) =>
  fail(e.code === 'EADDRINUSE' ? `Port ${server.port} ist bereits belegt.` : e.message),
);

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ msg: 'shutdown' }));
  try {
    await server.close();
  } catch (e) {
    console.error(JSON.stringify({ msg: 'shutdown_failed', error: (e as Error).message }));
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
// Unerwarteter Fehler: protokollieren, alle Firmen speichern, mit Fehlercode beenden
const crash = (kind: string) => (e: unknown) => {
  console.error(JSON.stringify({ msg: kind, error: (e as Error)?.message ?? String(e), stack: (e as Error)?.stack }));
  shutdown(1);
};
process.on('uncaughtException', crash('uncaught_exception'));
process.on('unhandledRejection', crash('unhandled_rejection'));
// Steuerung durch die Desktop-App: Zeile "quit" auf stdin → speichern und beenden
if (argv.includes('--parent-stdin')) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buf += chunk;
    if (/(^|\n)quit\r?\n/.test(buf)) shutdown();
  });
  process.stdin.on('end', () => shutdown());
}
