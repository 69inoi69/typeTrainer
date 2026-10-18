// The quiet background (owner, 2026-10-18): in the empty fields left and
// right of the page, outlines of keycaps with the open letters drift slowly
// down and turn, while you type too (owner, 2026-10-18: holding it still
// during a round made no difference to smoothness, the hands did). After a
// minute with no key and no mouse the page dims a little and the background
// grows a little stronger: a screen saver, any key or mouse move ends it.
// Decoration only, like fx.js: it never changes what is measured.
// Layer: middle. Imports only the bottom layer.
// Called by: app.js (buildAmbient once the letters are known) and input.js
// (buildAmbient on a resize).
//
// Speed: every piece is one element moved by a CSS animation of transform
// and opacity, which the browser runs on the graphics card; no JavaScript
// runs per frame.

import { reducedMotion } from "./state.js";

const COUNT = 16;          // keycaps on the screen at once, at most
const AFK_MS = 60000;      // no key and no mouse for this long: the screen saver
const SIZE = [30, 58];     // px: the smallest and the largest keycap
const DRIFT = 10;          // px: how far a keycap slides sideways on its way down
const PER_LANE = 2;        // keycaps falling one after another in one lane
// One lane holds the largest keycap turned 45 degrees (its diagonal) plus its
// drift and a gap, so neighbouring lanes can never touch.
const LANE = Math.ceil(SIZE[1] * Math.SQRT2 + 2 * DRIFT + 8);
const MIN_SIDE = LANE;     // px: narrower empty fields get no background

const layer = document.createElement("div");
layer.className = "ambient";
layer.setAttribute("aria-hidden", "true");
document.body.prepend(layer);

const rand = (a, b) => a + Math.random() * (b - a);
// the letters of the bar above the text that are open (a fallback before it is drawn)
function openLetters() {
  const open = [...document.querySelectorAll("#letters .chip:not(.locked)")].map((c) => c.textContent.trim()[0]).filter(Boolean);
  return open.length ? open : [..."typetrainer"];
}

// (Re)builds the pieces for the current window: only in the empty fields
// next to the header's width, none if those fields are too narrow.
// The keycaps never run into each other (owner, 2026-10-18: overlapping ones
// looked messy): each field is cut into lanes as wide as the largest turned
// keycap, every lane has its own speed, and the keycaps of one lane fall at
// that same speed an equal share of the way apart, so they keep their
// distance all the way down.
export function buildAmbient() {
  layer.replaceChildren();
  if (reducedMotion()) return;
  const top = document.querySelector(".top")?.getBoundingClientRect();
  if (!top) return;
  const left = top.left - 24, right = innerWidth - top.right - 24;
  if (Math.min(left, right) < MIN_SIDE) return;
  // the lanes of both fields, taken in turn from the left and the right
  const perSide = Math.min(Math.floor(left / LANE), Math.floor(right / LANE), Math.floor(COUNT / PER_LANE / 2));
  const lanes = [];
  for (let i = 0; i < perSide; i++) {
    lanes.push((left - perSide * LANE) / 2 + i * LANE);                      // centred in the left field
    lanes.push(top.right + 24 + (right - perSide * LANE) / 2 + i * LANE);    // and in the right one
  }
  const letters = openLetters();
  for (const x0 of lanes) {
    const dur = rand(24, 46);            // seconds for one fall, the same for the whole lane
    const phase = rand(0, dur);
    for (let k = 0; k < PER_LANE; k++) {
      const p = document.createElement("i");
      const size = rand(SIZE[0], SIZE[1]);
      const x = x0 + (LANE - size) / 2;  // in the middle of its lane
      p.style.cssText = `--x:${x.toFixed(0)}px;--size:${size.toFixed(1)}px;--dur:${dur.toFixed(1)}s;` +
        `--delay:${(-(phase + k * dur / PER_LANE)).toFixed(1)}s;--drift:${rand(-DRIFT, DRIFT).toFixed(0)}px;--rot:${rand(-45, 45).toFixed(0)}deg;--o:${rand(.35, 1).toFixed(2)}`;
      p.textContent = letters[Math.floor(Math.random() * letters.length)];
      layer.appendChild(p);
    }
  }
}

// ---------- the screen saver ----------
let afkTimer = 0;
function awake() {
  if (document.body.classList.contains("afk")) document.body.classList.remove("afk");
  clearTimeout(afkTimer);       // a timer as a wait, not an animation
  afkTimer = setTimeout(() => document.body.classList.add("afk"), AFK_MS);
}
for (const ev of ["keydown", "pointermove", "pointerdown", "wheel"]) addEventListener(ev, awake, { passive: true });
awake();
