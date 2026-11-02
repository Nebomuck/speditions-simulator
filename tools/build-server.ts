// Bündelt den Multiplayer-Server zu einer eigenständigen Windows-EXE (Node.js Single Executable Application)
// und legt sie als Tauri-Begleitprogramm (Sidecar) ab. Der Host braucht dadurch kein installiertes Node.js.
//
// Aufruf: npm run build:server

import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

// cloudflared für den Internet-Zugang (Cloudflare Quick Tunnel). Feste Version mit geprüfter Prüfsumme.
const CLOUDFLARED_VERSION = '2026.10.0';
const CLOUDFLARED_SHA256 = '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c';
const tunnelExe = join(sidecarDir, 'cloudflared-x86_64-pc-windows-msvc.exe');
const sha256 = (buf: Uint8Array) => createHash('sha256').update(buf).digest('hex');
if (!existsSync(tunnelExe) || sha256(readFileSync(tunnelExe)) !== CLOUDFLARED_SHA256) {
  const url = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`;
  console.log(`Lade cloudflared ${CLOUDFLARED_VERSION} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cloudflared-Download fehlgeschlagen: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (sha256(buf) !== CLOUDFLARED_SHA256) throw new Error('cloudflared: Prüfsumme stimmt nicht – Download verworfen.');
  writeFileSync(tunnelExe, buf);
}
console.log(`cloudflared ${CLOUDFLARED_VERSION}: ${tunnelExe} (Prüfsumme ok)`);
