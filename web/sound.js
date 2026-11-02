// Key and mistake sounds.

import { S } from "./state.js";

export const KEY_SOUNDS = ["off", "click", "thock", "typewriter", "soft"];
export const MISS_SOUNDS = ["off", "thud", "beep", "buzz"];

const PEAK = { key: .55, miss: .4 };
const SPACE_RATE = .8;
const JITTER = .08;

const TAU = Math.PI * 2;
const decay = (t, ms) => Math.exp(-t * 1000 / ms);
const fade = (t, len, ms = 3) => Math.min(1, (len - t) * 1000 / ms, t * 1000 / .3);
const sweep = (from, to) => {
  let phase = 0;
  return (t, len, sr) => (phase += TAU * (from * Math.pow(to / from, t / len)) / sr);
};

// Every sound: [length in ms, (time, noise, state, length, sample rate) => sample].
const KEY = {
  click: [14, (t, n, s) => {
    s.hp = n - (s.prev ?? 0);
    s.prev = n;
    return s.hp * decay(t, 2.5) + .35 * Math.sin(TAU * 4200 * t) * decay(t, 1.2);
  }],
  thock: [70, (t, n, s) => {
    s.lp = (s.lp ?? 0) + .08 * (n - (s.lp ?? 0));
    return 1.6 * Math.sin(TAU * 150 * t) * decay(t, 18) + 3 * s.lp * decay(t, 9) + .25 * n * decay(t, 1);
  }],
  typewriter: [90, (t, n) =>
    .6 * n * decay(t, 1.5) + .5 * Math.sin(TAU * 1900 * t) * decay(t, 22) + .3 * Math.sin(TAU * 2950 * t) * decay(t, 14)
    + .7 * Math.sin(TAU * 95 * t) * decay(t, 12)],
  soft: [45, (t, n, s, len, sr) => {
    s.ph ??= sweep(820, 420);
    s.lp = (s.lp ?? 0) + .15 * (n - (s.lp ?? 0));
    return Math.sin(s.ph(t, len / 1000, sr)) * decay(t, 9) + .8 * s.lp * decay(t, 4);
  }],
};
const MISS = {
  thud: [140, (t, n, s, len, sr) => {
    s.ph ??= sweep(230, 150);
    return Math.sin(s.ph(t, len / 1000, sr)) * decay(t, 45);
  }],
  beep: [110, (t) => (Math.sin(TAU * 520 * t) + .25 * Math.sin(TAU * 1040 * t)) * fade(t, .11, 25)],
  buzz: [170, (t, n, s) => {
    const saw = 2 * ((t * 110) % 1) - 1;
    s.lp = (s.lp ?? 0) + .2 * (saw - (s.lp ?? 0));
    return s.lp * fade(t, .17, 40);
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

function play(kind, name, rate) {
  if (!name || name === "off") return;
  const a = audio();
  if (!a) return;
  const src = a.createBufferSource();
  src.buffer = buffer(kind, name);
  src.playbackRate.value = rate;
  src.connect(out);
  src.start();
}

export function keySound(space = false, name = S.settings.keySound) {
  play("key", name, (space ? SPACE_RATE : 1) * (1 - JITTER / 2 + Math.random() * JITTER));
}
export function missSound(name = S.settings.missSound) {
  play("miss", name, 1);
}
