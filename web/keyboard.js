// The on-screen keyboard and the two hands above it: drawing them from the
// layout data, lighting the next key and its finger, the on / off button, and
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

// A letter just opened: its key glows once with a soft ring in the accent
// colour (--accent), ~380 ms. One animation, no confetti.
export function glowKey(ch) {
  const k = keyFor(ch);
  if (!k || !k.animate) return;
  k.animate([{ boxShadow: "0 0 0 0 rgba(226, 183, 20, .75)" }, { boxShadow: "0 0 0 10px rgba(226, 183, 20, 0)" }],
    { duration: 380, easing: "ease-out" });
}

// Keyboard on / off (the button in the bottom bar, or Alt+K): keyboard and
// hands together. Its size is not a setting: it is always the largest that
// fits the window (fitKeyboard below). Remembered in localStorage, separately
// for learning (tt.kbHidden) and for free practice and the test
// (tt.kbHidden.free): someone who comes to free practice can already type
// without looking, so there the keyboard starts hidden.
const kbKey = () => (S.mode === "learn" ? "tt.kbHidden" : "tt.kbHidden.free");

// Read the saved choice of the current mode and show / hide the keyboard.
// Never chosen yet: learning hides it only on phones (no physical keys to
// look up), free practice always hides it.
// animate = true when the user switches the mode: it folds away smoothly.
export function restoreKb(animate = false) {
  const saved = store.get(kbKey());
  const was = S.kbHidden;
  if (S.mode === "learn") S.kbHidden = saved === null ? isTouch() : saved === "1";
  else S.kbHidden = saved === null || saved === "1";
  applyKb(animate && was !== S.kbHidden);
}

// animate = true on a click: the keyboard folds away / unfolds smoothly
export function applyKb(animate = false) {
  if (animate) {   // measure again once the fold is over (fitKeyboard skips it while it runs)
    Promise.all([FX.collapse(el.keyboard, S.kbHidden), FX.collapse(el.hands, S.kbHidden)]).then(requestFit);
  } else {
    el.keyboard.classList.toggle("off", S.kbHidden);
    el.hands.classList.toggle("off", S.kbHidden);
  }
  el.btnKb.setAttribute("aria-pressed", String(!S.kbHidden));
  document.body.classList.toggle("kb-hidden", S.kbHidden);   // phone CSS centres the text then
  store.set(kbKey(), S.kbHidden ? "1" : "");
  requestFit();
}

// Fit to the window: keyboard and hands grow with the key unit --u, and they
// must never push the page below the bottom of the window (no scrolling).
// Everything else is measured once (it does not depend on --u), and --u-fit
// caps the unit so the rest fits. Runs on load, resize, a new text and when
// the keyboard is switched on: never on a keypress.
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
  // while the keyboard folds / unfolds its height and the margins of the hands
  // are half-way: a measure now would give a wrong (too big) size
  if (el.keyboard.getAnimations().length || el.hands.getAnimations().length) return;
  const rest = document.querySelector(".top").offsetHeight + el.viewType.offsetHeight
    - el.hands.offsetHeight - el.keyboard.offsetHeight
    + document.querySelector(".bottom").offsetHeight + 12;   // 12 = bottom padding of .views
  const fit = Math.max(24, Math.floor((innerHeight - rest - 4) / HANDS_KB_PER_U));
  root.setProperty("--u-fit", fit + "px");
}
