// Key and mistake sounds.

import { S } from "./state.js";

export const KEY_SOUNDS = ["off", "deep", "crisp"];
export const MISS_SOUNDS = ["off", "thud", "knock", "hush"];

const PEAK = { key: .55, miss: .4 };
const SPACE_RATE = .8, BACK_RATE = .85, WORD_RATE = .65, BACK_GAIN = .6;
const JITTER = .08;

const TAU = Math.PI * 2;
const decay = (t, ms) => Math.exp(-t * 1000 / ms);
const sweep = (from, to) => {
  let phase = 0;
  return (t, len, sr) => (phase += TAU * (from * Math.pow(to / from, t / len)) / sr);
};

// Every sound: [length in ms, (time, noise, state, length, sample rate) => sample].
const KEY = {
  deep: [70, (t, n, s) => {
    s.lp = (s.lp ?? 0) + .08 * (n - (s.lp ?? 0));
    return 1.6 * Math.sin(TAU * 150 * t) * decay(t, 18) + 3 * s.lp * decay(t, 9) + .25 * n * decay(t, 1);
  }],
  crisp: [90, (t, n) =>
    .6 * n * decay(t, 1.5) + .5 * Math.sin(TAU * 1900 * t) * decay(t, 22) + .3 * Math.sin(TAU * 2950 * t) * decay(t, 14)
    + .7 * Math.sin(TAU * 95 * t) * decay(t, 12)],
};
const MISS = {
  thud: [140, (t, n, s, len, sr) => {
    s.ph ??= sweep(230, 150);
    return Math.sin(s.ph(t, len / 1000, sr)) * decay(t, 45);
  }],
  knock: [60, (t, n, s) => {
    s.lp = (s.lp ?? 0) + .2 * (n - (s.lp ?? 0));
    return (Math.sin(TAU * 380 * t) + .6 * Math.sin(TAU * 610 * t)) * decay(t, 11) + 1.5 * s.lp * decay(t, 4);
  }],
  hush: [130, (t, n, s) => {
    s.lp = (s.lp ?? 0) + .05 * (n - (s.lp ?? 0));
    s.lp2 = (s.lp2 ?? 0) + .05 * (s.lp - (s.lp2 ?? 0));
    return s.lp2 * Math.min(1, t * 1000 / 12) * decay(t, 40);
  }],
};

let ctx = null, out = null;
const made = new Map();
function audio() {
  if (!ctx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    out = ctx.createGain();
    out.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  out.gain.value = Number(S.settings.volume) / 100;
  return ctx;
}

// Renders a sound once into a buffer; every later press only plays it.
function buffer(kind, name) {
  const id = kind + name;
  if (made.has(id)) return made.get(id);
  const [ms, fn] = (kind === "key" ? KEY : MISS)[name];
  const sr = ctx.sampleRate, len = Math.ceil(sr * ms / 1000);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), s = {};
  let peak = 0;
  for (let i = 0; i < len; i++) {
    d[i] = fn(i / sr, Math.random() * 2 - 1, s, ms, sr) * Math.min(1, (len - i) / (sr * .002));
    peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak) for (let i = 0; i < len; i++) d[i] *= PEAK[kind] / peak;
  made.set(id, buf);
  return buf;
}

function play(kind, name, rate, gain = 1) {
  if (!name || name === "off") return;
  const a = audio();
  if (!a) return;
  const src = a.createBufferSource();
  src.buffer = buffer(kind, name);
  src.playbackRate.value = rate;
  if (gain === 1) src.connect(out);
  else {
    const g = a.createGain();
    g.gain.value = gain;
    src.connect(g).connect(out);
  }
  src.start();
}

export function keySound(space = false, name = S.settings.keySound) {
  play("key", name, (space ? SPACE_RATE : 1) * (1 - JITTER / 2 + Math.random() * JITTER));
}
// Backspace: the key sound, lower and quieter; a whole word lower still.
export function eraseSound(word = false) {
  play("key", S.settings.keySound, word ? WORD_RATE : BACK_RATE, BACK_GAIN);
}
export function missSound(name = S.settings.missSound) {
  play("miss", name, 1);
}
