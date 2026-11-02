// Update direkt aus dem Startbildschirm (Desktop-App): prüft das neueste GitHub-Release (latest.json),
// lädt den signierten Installer, installiert ihn und startet das Spiel neu.

import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { isDesktop, stopLocalServer, stopTunnel } from './multiplayer.ts';

export type { Update };

export async function appVersion(): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    return await getVersion();
  } catch {
    return null;
  }
}

/** Liefert das verfügbare Update oder null (auch ohne Internet oder im Browser). */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isDesktop()) return null;
  try {
    return await check();
  } catch {
    return null;
  }
}

/** Herunterladen, installieren, neu starten. `onProgress` erhält 0–1 (oder null, solange die Größe unbekannt ist). */
export async function installUpdate(update: Update, onProgress: (p: number | null) => void) {
  // Server und Tunnel beenden, damit der Installer ihre Programmdateien ersetzen kann
  await stopTunnel().catch(() => undefined);
  await stopLocalServer().catch(() => undefined);
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((ev) => {
    if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
    else if (ev.event === 'Progress') {
      done += ev.data.chunkLength;
      onProgress(total ? done / total : null);
    } else if (ev.event === 'Finished') onProgress(1);
  });
  await relaunch();
}
