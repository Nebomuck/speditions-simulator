// Bündelt den Multiplayer-Server zu einer eigenständigen Windows-EXE (Node.js Single Executable Application)
// und legt sie als Tauri-Begleitprogramm (Sidecar) ab. Der Host braucht dadurch kein installiertes Node.js.
//
// Aufruf: npm run build:server

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/server/dist');
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(root, 'apps/server/src/main.ts')],
  outfile: join(dist, 'server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  // optionale native Beschleuniger von ws – ws funktioniert ohne sie
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});

const exe = join(dist, 'spedsim-server.exe');
const config = join(dist, 'sea-config.json');
writeFileSync(config, JSON.stringify({ main: join(dist, 'server.cjs'), output: exe, disableExperimentalSEAWarning: true, useCodeCache: true }));
execFileSync(process.execPath, ['--build-sea', config], { stdio: 'inherit' });

// Tauri erwartet den Ziel-Triple im Dateinamen
const sidecarDir = join(root, 'apps/desktop/src-tauri/binaries');
mkdirSync(sidecarDir, { recursive: true });
copyFileSync(exe, join(sidecarDir, 'spedsim-server-x86_64-pc-windows-msvc.exe'));
console.log(`Server-EXE: ${exe} (${Math.round(statSync(exe).size / 1e6)} MB) → Sidecar kopiert`);
