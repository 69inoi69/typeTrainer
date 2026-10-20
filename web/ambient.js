// The quiet background (owner, 2026-10-18): in the empty fields left and
// right of the page, things fall slowly from the top to the bottom, turning
// a little. What falls is a setting (owner, 2026-10-20; settings.js
// S.settings.bg): outlines of keycaps with the open letters ("keys", the
// default), the open letters alone ("letters"), short words of the current
// text ("words"), or nothing ("off"). They keep moving while you type
// (owner, 2026-10-20: about 2 ms of a keypress, "that is nothing"). After a
// minute with no key and no mouse the page dims a little and the background
// grows a little stronger: a screen saver, any key or mouse move ends it.
// Decoration only, like fx.js: it never changes what is measured.
// Layer: middle. Imports only the bottom layer.
// Called by: app.js (buildAmbient once the letters are known) and input.js
// (buildAmbient on a resize and when the setting changes).
//
// Speed: every piece is an <i> moved by an animation of transform started
// once with element.animate, which the browser runs on the graphics card; no
// JavaScript runs per frame. The browser still updates the style of a
// running animation's element on each frame it draws, and during a round it
// draws one per key; so the animated <i> carries no look of its own and the
// heavy look (shadows, colour mixes) sits on the <b> inside, which is left
// alone (measured, 2026-10-20: see style.css).
//
// To add something that falls: its id in S.settings.bg (settings.js BGS and
// its name in i18n.js), what each piece shows in TEXTS below, and its look
// in style.css (.ambient[data-kind=...] > i > b).

import { reducedMotion, S } from "./state.js";

const COUNT = 16;          // pieces on the screen at once, at most
const AFK_MS = 60000;      // no key and no mouse for this long: the screen saver
const SIZE = [30, 58];     // px: the smallest and the largest keycap
const DRIFT = 10;          // px: how far a piece slides sideways on its way down
const PER_LANE = 2;        // pieces falling one after another in one lane
const FALL = [24, 46];     // seconds one fall takes (each lane its own)
const TURN = { keys: 45, letters: 45, words: 12 };   // degrees a piece turns at most on its way down (a word only a little: it stays readable)
// One lane holds the largest keycap turned 45 degrees (its diagonal) plus its
// drift and a gap, so neighbouring lanes can never touch.
const LANE = Math.ceil(SIZE[1] * Math.SQRT2 + 2 * DRIFT + 8);
const MIN_SIDE = LANE;     // px: narrower empty fields get no background

const layer = document.createElement("div");
layer.className = "ambient";
layer.setAttribute("aria-hidden", "true");
document.body.prepend(layer);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// the letters of the bar above the text that are open (a fallback before it is drawn)
function openLetters() {
  const open = [...document.querySelectorAll("#letters .chip:not(.locked)")].map((c) => c.textContent.trim()[0]).filter(Boolean);
  return open.length ? open : [..."typetrainer"];
}
// short words of the text on the screen (they fit a lane), a few fixed ones
// before the first text is there
function textWords() {
  const words = (document.getElementById("text")?.textContent ?? "").split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 7 && /^\p{L}+$/u.test(w));
  return words.length >= 4 ? [...new Set(words)] : ["type", "train", "words", "keys", "flow"];
}
// what one piece shows, for each kind
const TEXTS = { keys: openLetters, letters: openLetters, words: textWords };

// (Re)builds the pieces for the current window and the current setting: only
// in the empty fields next to the header's width, none if those fields are
// too narrow or the setting is "off".
// The pieces never run into each other (owner, 2026-10-18: overlapping ones
// looked messy): each field is cut into lanes as wide as the largest turned
// keycap, every lane has its own speed, and the pieces of one lane fall at
// that same speed an equal share of the way apart, so they keep their
// distance all the way down.
export function buildAmbient() {
  layer.replaceChildren();
  const kind = S.settings.bg;
  layer.dataset.kind = kind;
  if (reducedMotion() || !TEXTS[kind]) return;
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
  const texts = TEXTS[kind]();
  for (const x0 of lanes) {
    const dur = rand(...FALL) * 1000;    // one fall, the same for the whole lane
    const phase = rand(0, dur);
    for (let k = 0; k < PER_LANE; k++) {
      // One piece: a bare <i> that moves, the look on the <b> inside. The
      // movement is given with plain numbers (element.animate), not CSS
      // variables in keyframes, which the browser would resolve on every frame.
      const size = rand(...SIZE);
      const p = document.createElement("i");
      p.style.cssText = `left:${x0.toFixed(0)}px;width:${LANE}px;--size:${size.toFixed(1)}px;--o:${rand(.35, 1).toFixed(2)}`;
      const b = document.createElement("b");
      b.textContent = pick(texts);
      p.appendChild(b);
      layer.appendChild(p);
      const deg = rand(-TURN[kind], TURN[kind]).toFixed(0);
      p.animate([{ transform: "translate3d(0, 0, 0)" },
        { transform: `translate3d(${rand(-DRIFT, DRIFT).toFixed(0)}px, 125vh, 0) rotate(${deg}deg)` }],
      { duration: dur, delay: -(phase + k * dur / PER_LANE), easing: "linear", iterations: Infinity });
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
