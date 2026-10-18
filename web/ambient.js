// The quiet background (owner, 2026-10-18): in the empty fields left and
// right of the page, outlines of keycaps with the open letters drift slowly
// down and turn. It stays while you type, but holds still until the round
// ends (style.css, body.typing-now): moving, it cost smoothness. After a
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

const COUNT = 16;          // keycaps on the screen at once
const AFK_MS = 60000;      // no key and no mouse for this long: the screen saver
const MIN_SIDE = 110;      // px: narrower empty fields get no background

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
export function buildAmbient() {
  layer.replaceChildren();
  if (reducedMotion()) return;
  const top = document.querySelector(".top")?.getBoundingClientRect();
  if (!top) return;
  const left = top.left - 24, right = innerWidth - top.right - 24;
  if (Math.min(left, right) < MIN_SIDE) return;
  const letters = openLetters();
  for (let i = 0; i < COUNT; i++) {
    const p = document.createElement("i");
    const size = rand(30, 58);
    const onLeft = i % 2 === 0;
    const x = onLeft ? rand(16, left - size) : rand(top.right + 24, innerWidth - 16 - size);
    const dur = rand(24, 46);   // seconds for one fall
    p.style.cssText = `--x:${x.toFixed(0)}px;--size:${size.toFixed(1)}px;--dur:${dur.toFixed(1)}s;` +
      `--delay:${(-rand(0, dur)).toFixed(1)}s;--drift:${rand(-40, 40).toFixed(0)}px;--rot:${rand(-50, 50).toFixed(0)}deg;--o:${rand(.35, 1).toFixed(2)}`;
    p.textContent = letters[Math.floor(Math.random() * letters.length)];
    layer.appendChild(p);
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
