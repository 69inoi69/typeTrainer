// The falling keycaps background.

import { t } from "./i18n.js";
import { reducedMotion, S } from "./state.js";

const COUNT = 16;
const AFK_MS = 60000;
const SIZE = [34, 66];
const DRIFT = 10;
const PER_LANE = 2;
const FALL = [24, 46];
const TURN = 45;
const WIDE = 0.2;
const WIDE_W = [1.5, 2];
const WIDE_TURN = 10;
const FILL = 0.3;
const WIDE_NAMES = ["key.tab", "key.caps", "key.shift", "key.enter", "key.space"];
const LANE = Math.ceil(SIZE[1] * Math.SQRT2 + 2 * DRIFT + 8);
const MIN_SIDE = LANE;

const layer = document.createElement("div");
layer.className = "ambient";
layer.setAttribute("aria-hidden", "true");
document.body.prepend(layer);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
function openLetters() {
  const open = [...document.querySelectorAll("#letters .chip:not(.locked)")].map((c) => c.textContent.trim()[0]).filter(Boolean);
  return open.length ? open : [..."typetrainer"];
}

function keycap(size, letters) {
  const b = document.createElement("b");
  let turn = TURN;
  if (Math.random() < WIDE) {
    const w = Math.min(rand(...WIDE_W), (LANE - 2 * DRIFT - 8) / size);
    b.className = "wide";
    b.textContent = t(pick(WIDE_NAMES));
    b.style.setProperty("--w", w.toFixed(2));
    turn = WIDE_TURN;
  } else {
    b.textContent = pick(letters);
    if (b.textContent === "f" || b.textContent === "j") b.classList.add("bump");
  }
  if (Math.random() < FILL) b.classList.add("fill");
  return { b, turn };
}

export function buildAmbient() {
  layer.replaceChildren();
  const kind = S.settings.bg;
  layer.dataset.kind = kind;
  if (reducedMotion() || kind === "off") return;
  const top = document.querySelector(".top")?.getBoundingClientRect();
  if (!top) return;
  const left = top.left - 24, right = innerWidth - top.right - 24;
  if (Math.min(left, right) < MIN_SIDE) return;
  const perSide = Math.min(Math.floor(left / LANE), Math.floor(right / LANE), Math.floor(COUNT / PER_LANE / 2));
  const lanes = [];
  for (let i = 0; i < perSide; i++) {
    lanes.push((left - perSide * LANE) / 2 + i * LANE);
    lanes.push(top.right + 24 + (right - perSide * LANE) / 2 + i * LANE);
  }
  const letters = openLetters();
  for (const x0 of lanes) {
    const dur = rand(...FALL) * 1000;
    const phase = rand(0, dur);
    for (let k = 0; k < PER_LANE; k++) {
      const size = rand(...SIZE);
      const p = document.createElement("i");
      p.style.cssText = `left:${x0.toFixed(0)}px;width:${LANE}px;--size:${size.toFixed(1)}px;--o:${rand(.35, 1).toFixed(2)}`;
      const { b, turn } = keycap(size, letters);
      p.appendChild(b);
      layer.appendChild(p);
      const deg = rand(-turn, turn).toFixed(0);
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
  clearTimeout(afkTimer);
  afkTimer = setTimeout(() => document.body.classList.add("afk"), AFK_MS);
}
for (const ev of ["keydown", "pointermove", "pointerdown", "wheel"]) addEventListener(ev, awake, { passive: true });
awake();
