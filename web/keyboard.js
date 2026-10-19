// The on-screen keyboard and the two hands above it: drawing them from the
// layout data (data/layouts/*.json, from /api/v1/layout), lighting the next
// key and its finger, keyboard on / off, and fitting the keyboard into the
// window.
// Layer: middle. Imports only the bottom layer.
// Called by: typing.js (highlightNextKey, pulseKey, glowKey on keys),
// languages.js (drawKeyboard for a new layout), intro.js (makeKey),
// modes.js and app.js (restoreKb), input.js (applyKb, requestFit).

import { FEEL } from "./feel.js";
import { t } from "./i18n.js";
import { FX } from "./fx.js";
import { el, S, store, isTouch, themeColor, reducedMotion } from "./state.js";

// ---------- keyboard ----------
let fingerOf = {};         // char -> finger id

// One key <div> from one key of the layout data ({char, finger, home,
// width, alt, label, modifier}). Also used by the intro for its small keyboards.
export function makeKey(k) {
  const finger = S.layout.fingers[k.finger];
  const key = document.createElement("div");
  key.className = "key" + (k.home ? " home" : "");
  key.style.setProperty("--fc", finger.color);
  if (k.width) {                       // a wide key (the space bar): a smaller legend
    key.classList.add("wide");
    key.style.width = `calc(var(--u) * ${k.width} + var(--u) * .12 * ${k.width - 1})`;
  }
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

// Draws the whole keyboard of S.layout and fills the lookup tables
// (S.keyEls, S.altBase, fingerOf) used on every keypress, so a keypress
// never has to search the page.
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

// The key that types ch: its own key, or the base key for an AltGr letter;
// a capital (Climb) is typed on the key of its small letter.
const baseOf = (ch) => { const lc = ch.toLowerCase(); return S.altBase[lc] ?? lc; };
const keyFor = (ch) => S.keyEls[ch] || S.keyEls[baseOf(ch)] || null;

// Which finger presses the next key: that finger lights up on the two
// hands above the keyboard. Space = both thumbs; an AltGr letter = the right
// thumb (holding AltGr) plus the finger of the base key; a capital (Climb)
// = the finger of its key plus the little finger of the other hand, which
// holds Shift (the touch typing rule). The same thing is also written as a
// sentence, but only for screen readers.
let nextKeyEl = null;
let handFingers = {};      // finger id ("lp", ..., "thl", "thr") -> <i> on the hands
let litFingers = [];       // fingers that are lit now
export function highlightNextKey() {
  if (nextKeyEl) nextKeyEl.classList.remove("next");
  if (S.altgrEl) S.altgrEl.classList.remove("next");
  for (const f of litFingers) f.classList.remove("on");
  litFingers = [];
  const ch = S.text[S.pos];
  const base = ch === undefined ? ch : baseOf(ch);   // "ą" is typed on the "a" key, "A" too
  nextKeyEl = S.keyEls[base] || null;
  if (!nextKeyEl) { el.hint.innerHTML = "&nbsp;"; return; }
  nextKeyEl.classList.add("next");
  const fingerId = fingerOf[base];
  let ids = fingerId === "th" ? ["thl", "thr"] : [fingerId];
  if (ch !== ch.toLowerCase()) ids.push(fingerId.startsWith("l") ? "rp" : "lp");   // Shift: the other hand
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
// The finger that pressed the key taps down with it (FEEL.fingerTap*), back
// along the way it points (--dx/--dy, in units of the drawing, --hu): it
// animates "transform", so the lift of the finger to use ("translate") is
// not touched.
export function pulseKey(ch, ok) {
  const k = keyFor(ch);
  if (!k || !k.animate || reducedMotion()) return;
  if (ok) {   // a short, soft press (knobs: FEEL.keyPress*)
    k.animate([{ transform: `translateY(1px) scale(${FEEL.keyPressScale})` }, { transform: "none" }],
      { duration: FEEL.keyPressMs, easing: "cubic-bezier(.2,.8,.2,1)" });
  } else {    // the wrong key gets a quick red tint in the theme's --error (FEEL.keyMiss*)
    const red = `color-mix(in srgb, ${themeColor("--error")} ${Math.round(FEEL.keyMissAlpha * 100)}%, transparent)`;
    k.animate([{ boxShadow: `inset 0 0 0 999px ${red}` }, { boxShadow: "inset 0 0 0 999px transparent" }],
      { duration: FEEL.keyMissMs, easing: "ease-out" });
  }
  if (!FEEL.fingerTapPx) return;
  const id = fingerOf[baseOf(ch)];
  for (const f of id === "th" ? [handFingers.thl, handFingers.thr] : [handFingers[id]]) {
    const tap = `translate(calc(var(--dx) * var(--hu) * ${FEEL.fingerTapPx}), calc(var(--dy) * var(--hu) * ${FEEL.fingerTapPx}))`;
    f?.animate([{ transform: "none" }, { transform: tap }, { transform: "none" }],
      { duration: FEEL.fingerTapMs, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
}

// A letter just opened: its key glows once with a soft ring in the theme's
// --accent, ~380 ms. One animation, no confetti.
export function glowKey(ch) {
  const k = keyFor(ch);
  if (!k || !k.animate || reducedMotion()) return;
  const gold = themeColor("--accent");
  k.animate([{ boxShadow: `0 0 0 0 color-mix(in srgb, ${gold} 75%, transparent)` }, { boxShadow: `0 0 0 10px color-mix(in srgb, ${gold} 0%, transparent)` }],
    { duration: 380, easing: "ease-out" });
}

// Keyboard on / off (the choice in the settings panel, or Alt+K; both go
// through input.js): keyboard and hands together. Its size is not a
// setting: it is always the largest that fits the window (fitKeyboard
// below). Remembered in localStorage, separately
// for learning (tt.kbHidden) and for Climb (tt.kbHidden.free): someone who
// comes to Climb can already type without looking, so there the keyboard
// starts hidden.
const kbKey = () => (S.mode === "learn" ? "tt.kbHidden" : "tt.kbHidden.free");

// Read the saved choice of the current mode and show / hide the keyboard.
// Touch screens never show it: you type with your thumbs on the phone's own
// keyboard, which also covers this part of the screen (owner, 2026-10-16).
// Never chosen yet: learning shows it, Climb hides it.
// animate = true when the user switches the mode: it folds away smoothly.
export function restoreKb(animate = false) {
  const saved = store.get(kbKey());
  const was = S.kbHidden;
  if (isTouch()) S.kbHidden = true;
  else if (S.mode === "learn") S.kbHidden = saved === "1";
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
  document.body.classList.toggle("kb-hidden", S.kbHidden);   // phone CSS centres the text then
  if (!isTouch()) store.set(kbKey(), S.kbHidden ? "1" : "");   // a phone never chose it
  requestFit();
}

// Fit to the window: keyboard and hands grow with the key unit --u, and they
// must never push the page below the bottom of the window (no scrolling).
// Everything else is measured once (it does not depend on --u), and --u-fit
// caps the unit so the rest fits. Runs on load, resize, a new text and when
// the keyboard is switched on: never on a keypress.
// hands 1.68 u * handScale (2 u wide, 100:84) + keyboard 4.36 u (4 rows, 3 gaps of .12 u)
// The hands overlap the keyboard's top edge by FEEL.handOverlap keys
// (style.css .hands, a negative margin), so that much less height is used.
const HANDS_KB_PER_U = 1.68 * FEEL.handScale + 4.36 - FEEL.handOverlap;
let fitFrame = 0;
// Asks for fitKeyboard in the next animation frame; several asks in one
// frame give one measure.
export function requestFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitKeyboard);
}
const lettersBar = document.querySelector("#view-type > .letters");   // carries the centring margin
function fitKeyboard() {
  const root = document.documentElement.style;
  // phones: the on-screen keyboard of the phone changes the window height all
  // the time, and the page may scroll there; no cap
  if (isTouch()) { root.removeProperty("--u-fit"); return; }
  if (S.kbHidden || S.view !== "type") return;
  // the result hides the keyboard (style.css): measure again with the next text
  if (el.textBox.classList.contains("resulting")) return;
  // while the keyboard folds / unfolds its height and the margins of the hands
  // are half-way: a measure now would give a wrong (too big) size
  if (el.keyboard.getAnimations().length || el.hands.getAnimations().length) return;
  const centred = getComputedStyle(el.viewType).getPropertyValue("--view-centred").trim() === "1";
  // the keyboard's panel (style.css .keyboard): its padding and border do
  // not grow with --u, so they count as fixed room like everything else
  const kb = getComputedStyle(el.keyboard);
  const kbFrame = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, p) => sum + parseFloat(kb[p]), 0);
  // the overlap of the hands grows with --u too (it is in HANDS_KB_PER_U):
  // add back what the view lost to it now
  const overlap = -parseFloat(getComputedStyle(el.hands).marginBottom) || 0;
  const rest = document.querySelector(".top").offsetHeight + el.viewType.offsetHeight
    - el.hands.offsetHeight - el.keyboard.offsetHeight + kbFrame + overlap
    // desktop (style.css --view-centred): the view takes all the height and
    // centres the letters and the text with two equal auto margins (above
    // the letters, at the end): that is free room. Otherwise the room above
    // the view (not in offsetHeight) is taken.
    + (centred ? -2 * parseFloat(getComputedStyle(lettersBar).marginTop) : parseFloat(getComputedStyle(el.viewType).marginTop))
    + document.querySelector(".bottom").offsetHeight + 12    // 12 = bottom padding of .views
    + parseFloat(getComputedStyle(document.body).paddingBottom);   // the bottom navigation bar (narrow windows)
  const fit = Math.max(24, Math.floor((innerHeight - rest - 4) / HANDS_KB_PER_U));
  root.setProperty("--u-fit", fit + "px");
}
