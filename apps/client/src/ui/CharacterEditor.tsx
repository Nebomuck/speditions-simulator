// Charakter-Editor: große Vorschau, Merkmale in Gruppen, jede Option als kleines Vorschaubild.

import { useState } from 'react';
import { Dices, RotateCcw } from 'lucide-react';
import { AVATAR_OPTIONS, type AvatarLook } from '@spedsim/core';
import { CLOTH, HAIR, Portrait, SKIN, EYE } from './Portrait.tsx';
import { Modal } from './components.tsx';

type Key = keyof AvatarLook;

interface Feature {
  key: Key;
  label: string;
  names?: string[];
  /** Farbfelder statt Vorschaubildern */
  colors?: string[];
}

const GROUPS: { id: string; label: string; features: Feature[] }[] = [
  {
    id: 'face', label: 'Gesicht', features: [
      { key: 'skin', label: 'Hautton', colors: SKIN },
      { key: 'face', label: 'Gesichtsform', names: ['Rund', 'Oval', 'Kantig'] },
      { key: 'mouth', label: 'Mund', names: ['Lächeln', 'Neutral', 'Strahlen', 'Schmunzeln'] },
    ],
  },
  {
    id: 'eyes', label: 'Augen', features: [
      { key: 'eyes', label: 'Augenform', names: ['Rund', 'Mandelförmig', 'Verschmitzt', 'Entspannt'] },
      { key: 'eyeColor', label: 'Augenfarbe', colors: EYE },
      { key: 'brows', label: 'Augenbrauen', names: ['Gerade', 'Geschwungen', 'Kräftig'] },
      { key: 'glasses', label: 'Brille', names: ['Keine', 'Rund', 'Eckig', 'Sonnenbrille'] },
    ],
  },
  {
    id: 'hair', label: 'Haare', features: [
      { key: 'hair', label: 'Frisur', names: ['Glatze', 'Sehr kurz', 'Seitenscheitel', 'Tolle', 'Locken', 'Bob', 'Lang', 'Zopf', 'Dutt', 'Afro', 'Undercut', 'Geheimratsecken'] },
      { key: 'hairColor', label: 'Haarfarbe', colors: HAIR },
      { key: 'beard', label: 'Bart', names: ['Kein Bart', 'Dreitagebart', 'Schnurrbart', 'Vollbart', 'Kinnbart'] },
    ],
  },
  {
    id: 'style', label: 'Kleidung', features: [
      { key: 'outfit', label: 'Kleidung', names: ['Polohemd', 'Hemd & Krawatte', 'Sakko', 'Kapuzenpullover', 'Arbeitsjacke', 'Warnweste', 'Pullover'] },
      { key: 'shirt', label: 'Farbe', colors: CLOTH },
      { key: 'accessory', label: 'Accessoire', names: ['Keins', 'Kappe', 'Ohrringe', 'Headset', 'Mütze'] },
      { key: 'bg', label: 'Hintergrund', names: ['Schiefer', 'Petrol', 'Violett', 'Oliv', 'Tanne', 'Bordeaux'] },
    ],
  },
];

export const DEFAULT_LOOK: AvatarLook = { skin: 1, hair: 2, hairColor: 1, shirt: 0, face: 0, eyes: 0, eyeColor: 0, brows: 0, mouth: 0, beard: 0, glasses: 0, outfit: 0, accessory: 0, bg: 0 };

export function randomLook(): AvatarLook {
  const r = (k: Key) => Math.floor(Math.random() * AVATAR_OPTIONS[k]);
  const look = Object.fromEntries((Object.keys(AVATAR_OPTIONS) as Key[]).map((k) => [k, r(k)])) as unknown as AvatarLook;
  // nicht zu viele Extras auf einmal
  if (Math.random() < 0.5) look.beard = 0;
  if (Math.random() < 0.6) look.glasses = 0;
  if (Math.random() < 0.6) look.accessory = 0;
  return look;
}

/** Editor im Dialog; `onSave` erhält das gewählte Aussehen */
export function CharacterEditor({ value, onSave, onClose, name }: { value: AvatarLook; onSave: (look: AvatarLook) => void; onClose: () => void; name?: string }) {
  const [look, setLook] = useState<AvatarLook>({ ...DEFAULT_LOOK, ...value });
  const [group, setGroup] = useState(GROUPS[0].id);
  const set = (k: Key, v: number) => setLook((l) => ({ ...l, [k]: v }));
  const g = GROUPS.find((x) => x.id === group)!;
  return (
    <Modal title="Aussehen gestalten" onClose={onClose} width={860}>
      <div className="char-editor">
        <div className="char-preview">
          <Portrait look={look} size={200} title={name} />
          {name && <div className="char-name">{name}</div>}
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn small" onClick={() => setLook(randomLook())}><Dices size={14} />Zufällig</button>
            <button className="btn small" onClick={() => setLook({ ...DEFAULT_LOOK, ...value })}><RotateCcw size={14} />Zurücksetzen</button>
          </div>
        </div>
        <div className="char-options">
          <div className="tabs">
            {GROUPS.map((x) => (
              <button key={x.id} className={`tab ${group === x.id ? 'active' : ''}`} onClick={() => setGroup(x.id)}>{x.label}</button>
            ))}
          </div>
          {g.features.map((f) => (
            <div key={f.key} className="char-feature">
              <label>{f.label}</label>
              <div className="char-swatches">
                {Array.from({ length: AVATAR_OPTIONS[f.key] }, (_, i) => {
                  const active = (look[f.key] ?? 0) === i;
                  return f.colors ? (
                    <button key={i} className={`char-color ${active ? 'active' : ''}`} style={{ background: f.colors[i] }} title={`${f.label} ${i + 1}`} onClick={() => set(f.key, i)} />
                  ) : (
                    <button key={i} className={`char-option ${active ? 'active' : ''}`} title={f.names?.[i]} onClick={() => set(f.key, i)}>
                      <Portrait look={{ ...look, [f.key]: i }} size={50} />
                      <span>{f.names?.[i]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Abbrechen</button>
        <button className="btn primary" onClick={() => (onSave(look), onClose())}>Übernehmen</button>
      </div>
    </Modal>
  );
}
