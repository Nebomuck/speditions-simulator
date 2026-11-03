// Aussehen der Spielfiguren (Porträt). Alle Merkmale sind Indizes in Paletten bzw. Formvarianten,
// die die Oberfläche zeichnet. Neuere Merkmale sind optional, damit alte Spielstände gültig bleiben.

export interface AvatarLook {
  skin: number;
  hair: number;
  hairColor: number;
  /** Farbe der Kleidung */
  shirt: number;
  face?: number;
  eyes?: number;
  eyeColor?: number;
  brows?: number;
  mouth?: number;
  beard?: number;
  glasses?: number;
  outfit?: number;
  accessory?: number;
  bg?: number;
}

/** Anzahl der Varianten je Merkmal */
export const AVATAR_OPTIONS: Record<keyof AvatarLook, number> = {
  skin: 8, hair: 12, hairColor: 9, shirt: 10, face: 3, eyes: 4, eyeColor: 5, brows: 3, mouth: 4, beard: 5, glasses: 4, outfit: 7, accessory: 5, bg: 6,
};

/** Eingaben (Client, Multiplayer) auf gültige Werte begrenzen */
export function sanitizeAvatar(raw: unknown): AvatarLook {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<string, number>;
  for (const [k, n] of Object.entries(AVATAR_OPTIONS)) {
    const v = o[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(n - 1, Math.round(v))) : 0;
  }
  return out as unknown as AvatarLook;
}
