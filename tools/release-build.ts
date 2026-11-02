// Baut den signierten Windows-Installer und die Update-Beschreibung latest.json für den In-App-Updater.
//
// Aufruf: npm run release:build
// Voraussetzung: privater Update-Schlüssel unter %USERPROFILE%\.tauri\spedsim-updater.key
// (erzeugt mit `npx tauri signer generate`, gehört NICHT ins Repository – sicher aufbewahren,
// ohne ihn können keine Updates mehr für bestehende Installationen veröffentlicht werden).
//
// Danach latest.json und den Installer an das GitHub-Release hängen; die App fragt
// https://github.com/<repo>/releases/latest/download/latest.json ab.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Nebomuck/speditions-simulator';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ?? join(homedir(), '.tauri', 'spedsim-updater.key');
if (!existsSync(keyPath)) throw new Error(`Update-Schlüssel fehlt: ${keyPath}`);

const conf = JSON.parse(readFileSync(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'));
const version: string = conf.version;

execSync('npm run build -w @spedsim/desktop', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '' },
});

const nsis = join(root, 'apps/desktop/src-tauri/target/release/bundle/nsis');
const installer = `${conf.productName}_${version}_x64-setup.exe`;
const sigPath = join(nsis, `${installer}.sig`);
if (!existsSync(sigPath)) throw new Error(`Signatur fehlt: ${sigPath}`);

const notes = (() => {
  // Abschnitt der aktuellen Version aus dem CHANGELOG als Update-Hinweis
  const log = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const start = log.indexOf(`## ${version}`);
  if (start < 0) return `Version ${version}`;
  const end = log.indexOf('\n## ', start + 4);
  return log.slice(start, end < 0 ? undefined : end).split('\n').slice(1).join('\n').trim();
})();

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(sigPath, 'utf8').trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${installer}`,
    },
  },
};
writeFileSync(join(nsis, 'latest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nFertig: ${join(nsis, installer)}\n        ${join(nsis, 'latest.json')}`);
