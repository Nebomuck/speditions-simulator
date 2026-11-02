// Selbst erzeugte Klänge per Web Audio API (keine fremden Sounddateien, keine Lizenzfragen).

import { getUi } from '../game/store.ts';

let ac: AudioContext | null = null;

type SoundName = 'click' | 'success' | 'warning' | 'alert' | 'error';

const PATTERNS: Record<SoundName, [number, number, number][]> = {
  // [Frequenz Hz, Start s, Dauer s]
  click: [[880, 0, 0.05]],
  success: [[659, 0, 0.12], [880, 0.1, 0.18]],
  warning: [[520, 0, 0.15], [440, 0.16, 0.2]],
  alert: [[740, 0, 0.12], [740, 0.18, 0.12], [740, 0.36, 0.18]],
  error: [[220, 0, 0.18]],
};

export function playSound(name: SoundName) {
  if (!getUi().sound) return;
  try {
    ac ??= new AudioContext();
    const now = ac.currentTime;
    for (const [f, start, dur] of PATTERNS[name]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = name === 'error' ? 'sawtooth' : 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.06, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
  } catch {
    /* Audio nicht verfügbar */
  }
}
