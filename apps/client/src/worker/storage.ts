// Lokale Spielstände in IndexedDB (Einzelspieler). Jeder Spielstand ist eine versionierte,
// prüfsummengeschützte JSON-Datei (siehe core/save.ts). Autosaves rotieren über drei Slots.

import type { SaveMeta } from '../game/protocol.ts';

const DB = 'spedsim';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

interface Stored {
  meta: SaveMeta;
  text: string;
}

export async function writeSave(meta: SaveMeta, text: string): Promise<void> {
  // vorherige Version als Backup behalten (Schutz vor beschädigten Schreibvorgängen)
  const prev = await tx<Stored | undefined>('readonly', (s) => s.get(meta.name));
  if (prev) await tx('readwrite', (s) => s.put(prev, `${meta.name}.bak`));
  await tx('readwrite', (s) => s.put({ meta, text } satisfies Stored, meta.name));
}

export async function readSave(name: string): Promise<{ text: string; backup?: string }> {
  const cur = await tx<Stored | undefined>('readonly', (s) => s.get(name));
  if (!cur) throw new Error('Spielstand nicht gefunden.');
  const bak = await tx<Stored | undefined>('readonly', (s) => s.get(`${name}.bak`));
  return { text: cur.text, backup: bak?.text };
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<Stored[]>('readonly', (s) => s.getAll());
  return all.map((x) => x.meta).filter((m) => !m.name.endsWith('.bak')).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function deleteSave(name: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(name));
  await tx('readwrite', (s) => s.delete(`${name}.bak`));
}
