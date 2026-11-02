// Startpunkt des Multiplayer-Servers.
//   PORT=8787 DB=apps/server/data/spedsim.db npm run server

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.ts';

const here = dirname(fileURLToPath(import.meta.url));
const server = startServer({
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB ?? join(here, '../data/spedsim.db'),
});

async function shutdown() {
  console.log('Server wird beendet – Spielstände werden gesichert …');
  await server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
