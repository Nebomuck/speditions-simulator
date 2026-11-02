// Startpunkt des Multiplayer-Servers.
//   PORT=8787 DB=apps/server/data/spedsim.db npm run server
// Als Begleitprogramm der Desktop-App wird er gebündelt (tools/build-server.ts) und mit
// --port/--db aufgerufen; die App startet und beendet ihn automatisch.

import { join } from 'node:path';
import { startServer } from './server.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const port = Number(arg('port') ?? process.env.PORT ?? 8787);
const dbPath = arg('db') ?? process.env.DB ?? join(process.cwd(), 'apps/server/data/spedsim.db');

let server: ReturnType<typeof startServer>;
try {
  server = startServer({ port, dbPath });
} catch (e) {
  console.error(JSON.stringify({ msg: 'start_failed', error: (e as Error).message }));
  process.exit(1);
}

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ msg: 'shutdown' }));
  try {
    await server.close();
  } catch (e) {
    console.error(JSON.stringify({ msg: 'shutdown_failed', error: (e as Error).message }));
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Steuerung durch die Desktop-App: Zeile "quit" auf stdin → speichern und beenden
if (process.argv.includes('--parent-stdin')) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buf += chunk;
    if (/(^|\n)quit\r?\n/.test(buf)) shutdown();
  });
  process.stdin.on('end', shutdown);
}
