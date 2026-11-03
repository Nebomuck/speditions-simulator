// Selbst erzeugte Klänge per Web Audio API (keine fremden Sounddateien, keine Lizenzfragen):
// Effekte, generative Hintergrundmusik, Büroatmosphäre und Telefonklingeln.

import { getUi } from '../game/store.ts';

let ac: AudioContext | null = null;
let buses: { sfx: GainNode; music: GainNode; ambience: GainNode; reverb: ConvolverNode } | null = null;

type SoundName = 'click' | 'success' | 'warning' | 'alert' | 'error' | 'notice';

const PATTERNS: Record<Exclude<SoundName, 'notice'>, [number, number, number][]> = {
  // [Frequenz Hz, Start s, Dauer s]
  click: [[880, 0, 0.05]],
  success: [[659, 0, 0.12], [880, 0.1, 0.18]],
  warning: [[520, 0, 0.15], [440, 0.16, 0.2]],
  alert: [[740, 0, 0.12], [740, 0.18, 0.12], [740, 0.36, 0.18]],
  error: [[220, 0, 0.18]],
};

/** Lautstärke 0–100 → Verstärkung (leicht logarithmisch) */
const gainOf = (v: number) => (v <= 0 ? 0 : Math.pow(v / 100, 1.6));

function audio() {
  if (!ac) {
    ac = new AudioContext();
    const sfx = ac.createGain();
    const music = ac.createGain();
    const ambience = ac.createGain();
    const reverb = ac.createConvolver();
    reverb.buffer = impulse(ac, 3.2);
    const wet = ac.createGain();
    wet.gain.value = 0.35;
    music.connect(ac.destination);
    music.connect(reverb).connect(wet).connect(ac.destination);
    sfx.connect(ac.destination);
    ambience.connect(ac.destination);
    buses = { sfx, music, ambience, reverb };
    applyVolumes();
  }
  if (ac.state === 'suspended') void ac.resume();
  return { ac, buses: buses! };
}

/** Nachhall: abklingendes Rauschen */
function impulse(ctx: AudioContext, seconds: number) {
  const len = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

export function applyVolumes() {
  if (!ac || !buses) return;
  const u = getUi();
  const t = ac.currentTime;
  buses.sfx.gain.setTargetAtTime(u.sound ? 1 : 0, t, 0.05);
  buses.music.gain.setTargetAtTime(gainOf(u.music) * 0.55, t, 0.3);
  buses.ambience.gain.setTargetAtTime(gainOf(u.ambience) * 0.5, t, 0.3);
}

export function playSound(name: SoundName) {
  if (!getUi().sound) return;
  try {
    const { ac: ctx, buses: b } = audio();
    const now = ctx.currentTime;
    if (name === 'notice') {
      // weicher Zweiklang für neue Angebote/Marktereignisse
      for (const [f, st] of [[784, 0], [1175, 0.09]]) tone(ctx, b.sfx, f, now + st, 0.5, 0.05, 'sine');
      return;
    }
    for (const [f, start, dur] of PATTERNS[name]) tone(ctx, b.sfx, f, now + start, dur, 0.06, name === 'error' ? 'sawtooth' : 'sine');
  } catch {
    /* Audio nicht verfügbar */
  }
}

function tone(ctx: AudioContext, out: AudioNode, f: number, at: number, dur: number, peak: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = f;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Bürotelefon: zweimal kurz klingeln (für Kundenanrufe) */
export function playPhone() {
  if (!getUi().sound) return;
  try {
    const { ac: ctx, buses: b } = audio();
    const now = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.connect(b.sfx);
    for (const start of [0, 1.4]) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(lp);
      // Klingeln = zwei Töne, mit 22 Hz an- und abgeschaltet
      for (const f of [1046, 1318]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.connect(g);
        o.start(now + start);
        o.stop(now + start + 0.95);
      }
      for (let k = 0; k < 20; k++) {
        const t = now + start + k / 22;
        g.gain.setValueAtTime(0.035, t);
        g.gain.setValueAtTime(0.0, t + 0.5 / 22);
      }
    }
  } catch {
    /* Audio nicht verfügbar */
  }
}

// ---------------------------------------------------------------- Hintergrundmusik

// ruhige Akkordfolge (MIDI-Noten): Cmaj9 – Am7 – Fmaj7 – G6sus
const CHORDS = [
  [48, 55, 59, 62, 64],
  [45, 52, 55, 60, 64],
  [41, 48, 52, 57, 60],
  [43, 50, 55, 57, 62],
];
const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79];
const BAR = 8;
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let musicTimer: number | null = null;
let nextBar = 0;
let barNo = 0;

function pad(ctx: AudioContext, out: AudioNode, midi: number, at: number, len: number, level: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900 + Math.random() * 400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + 2.2);
  g.gain.setValueAtTime(level, at + len - 2.5);
  g.gain.linearRampToValueAtTime(0.0001, at + len);
  filter.connect(g).connect(out);
  for (const [type, detune] of [['sine', -6], ['triangle', 6]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    o.detune.value = detune;
    o.connect(filter);
    o.start(at);
    o.stop(at + len + 0.1);
  }
}

function pluck(ctx: AudioContext, out: AudioNode, midi: number, at: number) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = hz(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.05, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + 1.7);
}

function scheduleBar(ctx: AudioContext, out: AudioNode, at: number) {
  const chord = CHORDS[barNo % CHORDS.length];
  pad(ctx, out, chord[0] - 12, at, BAR + 1.5, 0.05);
  for (const n of chord.slice(1)) pad(ctx, out, n, at, BAR + 1.5, 0.022);
  // sparsames Arpeggio aus der Pentatonik
  const notes = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < notes; i++) pluck(ctx, out, PENTA[Math.floor(Math.random() * PENTA.length)], at + 1 + Math.floor(Math.random() * 12) * (BAR / 16));
  barNo++;
}

// ---------------------------------------------------------------- Büroatmosphäre

let roomTone: AudioBufferSourceNode | null = null;
let typingTimer: number | null = null;

function startAmbience(ctx: AudioContext, out: AudioNode) {
  if (roomTone) return;
  // Raumklang/Lüftung: braunes Rauschen, tiefpassgefiltert
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  roomTone = ctx.createBufferSource();
  roomTone.buffer = buf;
  roomTone.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.value = 0.35;
  roomTone.connect(lp).connect(g).connect(out);
  roomTone.start();
  // gelegentliches Tippen auf einer Tastatur
  const typing = () => {
    if (!ac || !buses) return;
    const t0 = ac.currentTime + 0.05;
    const keys = 6 + Math.floor(Math.random() * 18);
    let t = t0;
    for (let k = 0; k < keys; k++) {
      const n = ac.createBufferSource();
      const b = ac.createBuffer(1, Math.round(ac.sampleRate * 0.02), ac.sampleRate);
      const x = b.getChannelData(0);
      for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 4);
      n.buffer = b;
      const hp = ac.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 2500 + Math.random() * 1500;
      const kg = ac.createGain();
      kg.gain.value = 0.05 + Math.random() * 0.04;
      n.connect(hp).connect(kg).connect(buses.ambience);
      n.start(t);
      t += 0.07 + Math.random() * 0.13;
    }
    typingTimer = window.setTimeout(typing, 5000 + Math.random() * 16000);
  };
  typingTimer = window.setTimeout(typing, 3000);
}

/** Musik und Atmosphäre im Spiel starten (nach einer Nutzerinteraktion, sonst blockiert der Browser) */
export function startBackground() {
  try {
    const { ac: ctx, buses: b } = audio();
    startAmbience(ctx, b.ambience);
    if (musicTimer !== null) return;
    nextBar = ctx.currentTime + 0.5;
    const tick = () => {
      if (!ac || !buses) return;
      if (getUi().music > 0) while (nextBar - ac.currentTime < 2) {
        scheduleBar(ac, buses.music, nextBar);
        nextBar += BAR;
      }
      else nextBar = Math.max(nextBar, ac.currentTime);
    };
    tick();
    musicTimer = window.setInterval(tick, 1000);
  } catch {
    /* Audio nicht verfügbar */
  }
}

export function stopBackground() {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  if (typingTimer !== null) window.clearTimeout(typingTimer);
  typingTimer = null;
  try {
    roomTone?.stop();
  } catch {
    /* schon beendet */
  }
  roomTone = null;
}
