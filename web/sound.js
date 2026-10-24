// Key sounds (a setting, off by default; after keybr):
// a soft click on every key, and a low tone on a mistake. Made by the
// browser's Web Audio on the spot, so there are no sound files to load: a
// click is 12 ms of noise through a band filter (it sounds like a key, not
// a beep), a mistake a short falling sine. One sound is three small audio
// nodes that the browser plays on its own audio thread and frees when they
// stop; a keypress spends a few microseconds here.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports only the bottom layer.
// Called by: typing.js (keySound on every key), input.js (keySound for the
// sample when a sound is chosen in the settings).
// To add a sound theme: another pair of makers below and a choice in
// settings.js (CHOICES.sound).

import { S } from "./state.js";

const CLICK_MS = 12, CLICK_HZ = 2600, CLICK_GAIN = .5;            // the click of a right key
const MISS_MS = 140, MISS_HZ = 230, MISS_TO_HZ = 150, MISS_GAIN = .35;   // the tone of a mistake

let ctx = null, noise = null;
// The audio context, made at the first sound (browsers allow it only after
// a key or a click, which is when the first sound comes).
function audio() {
  if (!ctx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * CLICK_MS / 1000), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);   // fading noise
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// A key was pressed: ok = the right one. Plays what the setting asks for:
// "keys" a click on every right key and the tone on a mistake, "errors"
// only the tone, "off" nothing.
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
    band.frequency.value = CLICK_HZ * (0.9 + Math.random() * 0.2);   // no two clicks quite the same
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
