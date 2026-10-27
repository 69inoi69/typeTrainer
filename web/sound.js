// Key sounds.

import { S } from "./state.js";

const CLICK_MS = 12, CLICK_HZ = 2600, CLICK_GAIN = .5;
const MISS_MS = 140, MISS_HZ = 230, MISS_TO_HZ = 150, MISS_GAIN = .35;

let ctx = null, noise = null;
function audio() {
  if (!ctx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * CLICK_MS / 1000), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function keySound(ok, mode = S.settings.sound) {
  if (mode === "off" || (ok && mode !== "keys")) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime, vol = Number(S.settings.volume) / 100;
  const g = a.createGain();
  g.connect(a.destination);
  if (ok) {
    const src = a.createBufferSource(), band = a.createBiquadFilter();
    src.buffer = noise;
    band.type = "bandpass";
    band.frequency.value = CLICK_HZ * (0.9 + Math.random() * 0.2);
    g.gain.value = CLICK_GAIN * vol;
    src.connect(band).connect(g);
    src.start(t0);
  } else {
    const osc = a.createOscillator(), end = t0 + MISS_MS / 1000;
    osc.frequency.setValueAtTime(MISS_HZ, t0);
    osc.frequency.exponentialRampToValueAtTime(MISS_TO_HZ, end);
    g.gain.setValueAtTime(MISS_GAIN * vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g);
    osc.start(t0);
    osc.stop(end);
  }
}
