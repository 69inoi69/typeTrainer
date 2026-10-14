// The on-screen keyboard and the two hands above it: drawing them from the
// layout data, lighting the next key and its finger, the size switch, and
// fitting the keyboard into the window.
// Layer: middle. Imports only the bottom layer.

import { t } from "./i18n.js";
import { FX } from "./fx.js";
import { el, S, store, isTouch } from "./state.js";

// ---------- keyboard ----------
let fingerOf = {};         // char -> finger id

export function makeKey(k) {
  const finger = S.layout.fingers[k.finger];
  const key = document.createElement("div");
  key.className = "key" + (k.home ? " home" : "");
  key.style.setProperty("--fc", finger.color);
  if (k.width) key.style.width = `calc(var(--u) * ${k.width} + var(--u) * .12 * ${k.width - 1})`;
  key.innerHTML = `<span class="lbl"></span>`;
  key.querySelector(".lbl").textContent = k.char === " " ? t("key.space") : (k.label || k.char);
  if (k.alt) {                         // second letter, typed with AltGr
    const alt = document.createElement("span");
    alt.className = "alt";
    alt.textContent = k.alt;
    key.appendChild(alt);
  }
  if (k.modifier) key.classList.add("mod");
  key.title = t(`fingerName.${k.finger}`);
  return key;
}

export function drawKeyboard() {
  el.keyboard.innerHTML = "";
  S.keyEls = {}; fingerOf = {}; S.altBase = {}; S.altgrEl = null; nextKeyEl = null;
  S.layout.rows.forEach((row, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row";
    rowEl.style.paddingLeft = `calc(var(--u) * ${S.layout.offsets?.[i] ?? 0})`;
    for (const k of row) {
      const key = makeKey(k);
      rowEl.appendChild(key);
      if (k.modifier) { S.altgrEl = key; continue; }
      S.keyEls[k.char] = key;
      fingerOf[k.char] = k.finger;
      if (k.alt) S.altBase[k.alt] = k.char;
    }
    el.keyboard.appendChild(rowEl);
  });
  // the hands take the finger colors of this layout (both thumbs: "th")
  handFingers = {};
  for (const f of el.hands.querySelectorAll("[data-f]")) {
    const id = f.dataset.f;
    f.style.setProperty("--fc", S.layout.fingers[id.startsWith("th") ? "th" : id].color);
    handFingers[id] = f;
  }
}

// The key that types ch: its own key, or the base key for an AltGr letter.
const keyFor = (ch) => S.keyEls[ch] || S.keyEls[S.altBase[ch]] || null;

// Which finger presses the next key: that finger lights up on the two
// hands above the keyboard. Space = both thumbs; an AltGr letter = the right
// thumb (holding AltGr) plus the finger of the base key. The same thing is
// also written as a sentence, but only for screen readers.
let nextKeyEl = null;
let handFingers = {};      // finger id ("lp", ..., "thl", "thr") -> <i> on the hands
let litFingers = [];       // fingers that are lit now
export function highlightNextKey() {
  if (nextKeyEl) nextKeyEl.classList.remove("next");
  if (S.altgrEl) S.altgrEl.classList.remove("next");
  for (const f of litFingers) f.classList.remove("on");
  litFingers = [];
  const ch = S.text[S.pos];
  const base = S.altBase[ch] ?? ch;      // "ą" is typed on the "a" key
  nextKeyEl = S.keyEls[base] || null;
  if (!nextKeyEl) { el.hint.innerHTML = "&nbsp;"; return; }
  nextKeyEl.classList.add("next");
  const fingerId = fingerOf[base];
  let ids = fingerId === "th" ? ["thl", "thr"] : [fingerId];
  const vars = { key: ch === " " ? t("key.space") : ch, base, finger: t(`finger.${fingerId}`) };
  if (S.altBase[ch]) {
    if (S.altgrEl) S.altgrEl.classList.add("next");
    ids = [...ids, "thr"];
    el.hint.innerHTML = t("hint.alt", vars);
  } else {
    el.hint.innerHTML = t("hint.press", vars);
  }
  for (const id of ids) {
    const f = handFingers[id];
    if (f) { f.classList.add("on"); litFingers.push(f); }
  }
}

// Key feedback with the Web Animations API: runs on the compositor and
// needs no class juggling or layout reads, so it costs almost nothing.
export function pulseKey(ch, ok) {
  const k = keyFor(ch);
  if (!k || !k.animate) return;
  if (ok) {   // a short, soft press
    k.animate([{ transform: "translateY(1px) scale(.95)" }, { transform: "none" }],
      { duration: 110, easing: "cubic-bezier(.2,.8,.2,1)" });
  } else {    // the wrong key flashes red for a moment (the colour of --error)
    k.animate([{ boxShadow: "inset 0 0 0 999px rgba(202, 71, 84, .7)" }, { boxShadow: "inset 0 0 0 999px rgba(202, 71, 84, 0)" }],
      { duration: 260, easing: "ease-out" });
  }
}

// Keyboard size: three presets (S / M / L, in % of the largest size that fits
// the window) and "off" for keyboard + hands, in one switch. Remembered here.
const KB_SIZES = [75, 88, 100];   // current size: S.kbSize, S.kbHidden
// animate = true on a click: the keyboard folds away / unfolds smoothly
export function applyKb(animate = false) {
  document.documentElement.style.setProperty("--kb-scale", S.kbSize / 100); // CSS transitions it
  if (animate) {
    FX.collapse(el.keyboard, S.kbHidden);
    FX.collapse(el.hands, S.kbHidden);
  } else {
    el.keyboard.classList.toggle("off", S.kbHidden);
    el.hands.classList.toggle("off", S.kbHidden);
  }
  const sel = S.kbHidden ? 0 : KB_SIZES.indexOf(S.kbSize) + 1;   // which option is on
  el.kbSwitch.style.setProperty("--i", sel);                 // the yellow thumb slides there
  el.kbSwitch.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-checked", String(i === sel)));
  el.kbSwitch.querySelector('[data-kb="off"]').setAttribute("aria-label", t("kb.off"));
  document.body.classList.toggle("kb-hidden", S.kbHidden);   // phone CSS centres the text then
  store.set("tt.kbSize", S.kbSize);
  store.set("tt.kbHidden", S.kbHidden ? "1" : "");
  requestFit();
}
// the preset closest to a saved size (older versions saved any 70...150)
export const nearestKb = (n) => KB_SIZES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

// Fit to the window: keyboard and hands grow with the key unit --u, and they
// must never push the page below the bottom of the window (no scrolling).
// Everything else is measured once (it does not depend on --u), and --u-fit
// caps the unit so the rest fits. Runs on load, resize, a new text and a size
// change: never on a keypress.
const HANDS_KB_PER_U = 6.04;   // hands 1.68 u (2 u wide, 100:84) + keyboard 4.36 u (4 rows, 3 gaps of .12 u)
let fitFrame = 0;
export function requestFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitKeyboard);
}
function fitKeyboard() {
  const root = document.documentElement.style;
  // phones: the on-screen keyboard of the phone changes the window height all
  // the time, and the page may scroll there; no cap
  if (isTouch()) { root.removeProperty("--u-fit"); return; }
  if (S.kbHidden || S.view !== "type") return;
  const rest = document.querySelector(".top").offsetHeight + el.viewType.offsetHeight
    - el.hands.offsetHeight - el.keyboard.offsetHeight
    + document.querySelector(".hints").offsetHeight + 12;   // 12 = bottom padding of .views
  const fit = Math.max(24, Math.floor((innerHeight - rest - 4) / HANDS_KB_PER_U));
  root.setProperty("--u-fit", fit + "px");
}
