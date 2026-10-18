// Key sounds: a soft click for every key you type, from real recordings of
// keyboards (web/sounds/, made by tools/sounds/build.py; who recorded each
// file is in web/sounds/CREDITS.md). Off unless chosen in the settings. Like
// the visual rewards in fx.js, a sound never changes what is measured or
// sent to the server: it is played after the time of the press is taken.
// Layer: middle. Imports only the bottom layer.
// Called by: settings.js (setSound: at start and when the choice changes)
// and typing.js (keySound on every typed key and Backspace).
//
// Web Audio, not <audio>: the files are decoded once, and each press only
// starts a ready buffer (a few microseconds), so typing stays light and the
// click comes at once. Browsers start sound muted until the first key or
// click on the page; the first key resumes it.
// To add a pack: its files from tools/sounds/build.py, an entry in PACKS,
// its id in SOUNDS and its name in i18n.js ("sound.<id>").

import { FEEL } from "./feel.js";
import { S } from "./state.js";

// The choices in the settings, in their order ("off" first).
export const SOUNDS = ["off", "deep", "tactile", "classic"];

// dir: the folder in web/sounds/; keys: how many key-NN.wav files it has;
// space / back: whether it has its own space.wav / back.wav (otherwise a
// key sound stands in: lower for the space, as is for Backspace).
// rate, lowpass, gain: how the pack is played. "deep" is the tactile
// recordings played slower and with the highs cut: a darker "thock".
const PACKS = {
  deep: { dir: "tactile", keys: 10, space: true, back: true, rate: 0.8, lowpass: 2600, gain: 1.3 },
  tactile: { dir: "tactile", keys: 10, space: true, back: true, rate: 1, gain: 1 },
  classic: { dir: "classic", keys: 10, rate: 1, gain: 1 },
};
const SPACE_RATE = 0.88, SPACE_GAIN = 1.1;   // a key sound standing in for the space bar

let ctx = null;          // the AudioContext, made once
let out = null;          // the volume of everything (FEEL.soundVolume)
const banks = {};        // dir -> Promise of its decoded buffers
let pack = null, bank = null, input = null;   // the chosen pack, its buffers, where its sounds go
let lastKey = -1;        // the recording played last: never the same one twice in a row

function context() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;    // a browser without Web Audio: no sound, the rest works
  ctx = new AC({ latencyHint: "interactive" });
  out = ctx.createGain();
  out.gain.value = FEEL.soundVolume;
  out.connect(ctx.destination);
  return ctx;
}

async function buffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ": " + r.status);
  return ctx.decodeAudioData(await r.arrayBuffer());
}
// Loads the files of one folder once; the second pack on the same files
// ("deep" and "tactile") gets the same buffers.
function load(p) {
  const base = `sounds/${p.dir}/`;
  banks[p.dir] ??= Promise.all([
    Promise.all(Array.from({ length: p.keys }, (_, i) => buffer(`${base}key-${String(i + 1).padStart(2, "0")}.wav`))),
    p.space ? buffer(base + "space.wav") : null,
    p.back ? buffer(base + "back.wav") : null,
  ]).then(([keys, space, back]) => ({ keys, space, back }));
  return banks[p.dir];
}

// Picks the pack (an id from SOUNDS; "off" or an unknown id: silence). Its
// files load in the background; until they are there, presses are silent.
// preview: play one key once it is loaded (the choice was just clicked, so
// the browser lets the sound start).
export function setSound(id, preview = false) {
  pack = PACKS[id] ?? null;
  bank = null;
  if (!pack || !context()) return;
  input = out;
  if (pack.lowpass) {
    input = ctx.createBiquadFilter();
    input.type = "lowpass";
    input.frequency.value = pack.lowpass;
    input.connect(out);
  }
  const chosen = pack;
  load(pack).then((b) => {
    if (pack !== chosen) return;   // another pack was chosen meanwhile
    bank = b;
    if (preview) keySound("key");
  }, (e) => console.warn("key sounds:", e));
}

// One press: kind is "key", "space" or "back".
export function keySound(kind) {
  if (!bank || S.settings.sound === "off") return;
  if (ctx.state !== "running") ctx.resume();   // the first key unlocks sound
  let buf = kind === "space" ? bank.space : kind === "back" ? bank.back : null;
  let rate = pack.rate, gain = pack.gain;
  if (!buf) {
    let i = Math.floor(Math.random() * (bank.keys.length - 1));
    if (lastKey >= 0 && i >= lastKey) i++;   // skip the one played last
    lastKey = i;
    buf = bank.keys[i];
    if (kind === "space") { rate *= SPACE_RATE; gain *= SPACE_GAIN; }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * FEEL.soundPitchJitter);
  const g = ctx.createGain();
  g.gain.value = gain * (1 - Math.random() * FEEL.soundGainJitter);
  src.connect(g).connect(input);
  src.start();
}
