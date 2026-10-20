// The quiet background (owner, 2026-10-18): in the empty fields left and
// right of the page, outlines of keycaps with the open letters move slowly.
// How they move is picked anew on every page load (owner, 2026-10-20), and
// never the same way twice in a row: they fall and turn, rise, or float in
// place. They keep moving while you type (owner, 2026-10-20); that is cheap
// because only a light wrapper is animated (see the speed note below). After
// a minute with no key and no mouse the page dims a little and the background
// grows a little stronger: a screen saver, any key or mouse move ends it.
// Decoration only, like fx.js: it never changes what is measured.
// Layer: middle. Imports only the bottom layer.
// Called by: app.js (buildAmbient once the letters are known) and input.js
// (buildAmbient on a resize).
//
// Speed: every piece is an <i> moved by an animation of transform (and, for
// floating, opacity) started once with element.animate, which the browser
// runs on the graphics card; no JavaScript runs per frame. The browser still updates the style of a
// running animation's element on each frame it draws, and during a round it
// draws one per key; so the animated <i> carries no look of its own and the
// keycap's heavy look (shadows, colour mixes) sits on the <b> inside, which
// is left alone (measured, 2026-10-20: see style.css).
//
// To add a way of moving: a name in KINDS, its start position in style.css
// (.ambient[data-kind=...]) and its keyframes in buildAmbient.

import { reducedMotion, store } from "./state.js";

const COUNT = 16;          // keycaps on the screen at once, at most
const AFK_MS = 60000;      // no key and no mouse for this long: the screen saver
const SIZE = [30, 58];     // px: the smallest and the largest keycap
const DRIFT = 10;          // px: how far a keycap slides sideways on its way down
const PER_LANE = 2;        // keycaps falling (or rising) one after another in one lane
const BOB = [8, 16];       // px: how far a floating keycap moves up and down
// The ways of moving and the seconds one fall, rise or float swing takes.
const KINDS = { fall: [24, 46], rise: [26, 48], float: [6, 12] };
// One lane holds the largest keycap turned 45 degrees (its diagonal) plus its
// drift and a gap, so neighbouring lanes can never touch.
const LANE = Math.ceil(SIZE[1] * Math.SQRT2 + 2 * DRIFT + 8);
const MIN_SIDE = LANE;     // px: narrower empty fields get no background

const layer = document.createElement("div");
layer.className = "ambient";
layer.setAttribute("aria-hidden", "true");
document.body.prepend(layer);

// this load's way of moving: any but the last load's
const kind = (() => {
  const last = store.get("tt.ambient");
  const names = Object.keys(KINDS).filter((k) => k !== last);
  const k = names[Math.floor(Math.random() * names.length)];
  store.set("tt.ambient", k);
  return k;
})();
layer.dataset.kind = kind;

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
  // One keycap: a bare <i> that moves, the look on the <b> inside. The
  // movement is given with plain numbers (element.animate), not CSS
  // variables in keyframes, which the browser would resolve on every frame.
  const add = ({ x, y = 0, size, o }, frames, timing) => {
    const p = document.createElement("i");
    p.style.cssText = `left:${x.toFixed(0)}px;--y:${y.toFixed(0)}px;--size:${size.toFixed(1)}px;--o:${o.toFixed(2)}`;
    const cap = document.createElement("b");
    cap.textContent = letters[Math.floor(Math.random() * letters.length)];
    p.appendChild(cap);
    layer.appendChild(p);
    p.animate(frames, { iterations: Infinity, ...timing });
  };
  const turn = (dx, dy, deg) => `translate3d(${dx.toFixed(0)}px, ${dy}, 0) rotate(${deg.toFixed(0)}deg)`;
  const [d0, d1] = KINDS[kind];
  if (kind === "float") {
    // Floating keycaps stay at their spot: each lane is cut into rows high
    // enough for the largest keycap and its swing, and a keycap moves up or
    // down in its row only by the room left over, so they never touch (and
    // do not stand in a straight line across the lanes).
    const rowH = LANE + 2 * BOB[1];
    const rows = Math.min(Math.floor(innerHeight / rowH), Math.floor(COUNT / lanes.length));
    const step = innerHeight / rows, room = Math.max(0, (step - rowH) / 2);
    for (const x0 of lanes) {
      for (let r = 0; r < rows; r++) {
        const size = rand(SIZE[0], SIZE[1]);
        const dur = rand(d0, d1) * 1000;
        add({ x: x0 + (LANE - size) / 2, y: (r + .5) * step + rand(-room, room) - size / 2, size, o: rand(.35, 1) },
          [{ transform: turn(0, "0px", 0), opacity: .4 },
            { transform: turn(rand(-DRIFT, DRIFT), `${rand(BOB[0], BOB[1]).toFixed(0)}px`, rand(-20, 20)), opacity: 1 }],
          { duration: dur, delay: -rand(0, dur), direction: "alternate", easing: "ease-in-out" });
      }
    }
    return;
  }
  const dy = kind === "fall" ? "125vh" : "-125vh";
  for (const x0 of lanes) {
    const dur = rand(d0, d1) * 1000;     // one fall or rise, the same for the whole lane
    const phase = rand(0, dur);
    for (let k = 0; k < PER_LANE; k++) {
      const size = rand(SIZE[0], SIZE[1]);
      add({ x: x0 + (LANE - size) / 2, size, o: rand(.35, 1) },   // in the middle of its lane
        [{ transform: turn(0, "0px", 0) }, { transform: turn(rand(-DRIFT, DRIFT), dy, rand(-45, 45)) }],
        { duration: dur, delay: -(phase + k * dur / PER_LANE), easing: "linear" });
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
