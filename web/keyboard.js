// The on-screen keyboard and the small hand over its next key: drawing them
// from the layout data (data/layouts/*.json, from /api/v1/layout), lighting
// the next key and its finger, showing the keyboard only while Learn is
// still opening letters, and fitting the keyboard into the window.
// Layer: middle. Imports only the bottom layer.
// Called by: typing.js (highlightNextKey, pulseKey, glowKey on keys),
// languages.js (drawKeyboard for a new layout), intro.js (makeKey),
// modes.js, app.js and typing.js (autoKb), input.js (requestFit).

import { FEEL } from "./feel.js";
import { t } from "./i18n.js";
import { el, S, isTouch, themeColor, reducedMotion } from "./state.js";

// ---------- keyboard ----------
let fingerOf = {};         // char -> finger id
const KEY_GAP = 0.12;      // the gap between keys, in keys (typing.css .kb-row)

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
    let x = S.layout.offsets?.[i] ?? 0;      // in keys, from the left of the row
    rowEl.style.paddingLeft = `calc(var(--u) * ${x})`;
    for (const k of row) {
      const key = makeKey(k);
      addLit(key);
      // the middle of the key, in keys from the row's left edge (a wide
      // key is w keys and the gaps between them): where the hand stands
      const w = (k.width ?? 1) * (1 + KEY_GAP) - KEY_GAP;
      key.dataset.x = String(x + w / 2);
      x += w + KEY_GAP;
      rowEl.appendChild(key);
      if (k.modifier) { S.altgrEl = key; continue; }
      S.keyEls[k.char] = key;
      fingerOf[k.char] = k.finger;
      if (k.alt) S.altBase[k.alt] = k.char;
    }
    el.keyboard.appendChild(rowEl);
  });
  el.keyboard.appendChild(el.hands);
  // the hands take the finger colors of this layout (both thumbs: "th")
  for (const f of el.hands.querySelectorAll("[data-f]")) {
    const id = f.dataset.f;
    f.style.setProperty("--fc", S.layout.fingers[id.startsWith("th") ? "th" : id].color);
  }
  for (const url of handPics.values()) if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  handPics.clear();
  for (const hand of el.hands.querySelectorAll(".hand")) {
    if (!hand.querySelector("img")) hand.appendChild(Object.assign(document.createElement("img"), { alt: "" }));
  }
}

// ---------- the hand as pictures ----------
// The hand over the keyboard is not a live drawing: for every finger (or
// fingers) to light, one picture of the whole hand is drawn once, with
// that finger already lifted and in its colour, and a keypress only swaps
// the picture of an <img>. The live hand (ten fingers, each a layer that
// lifts) cost the browser ~1 ms of restyling on every key (#148). The
// drawing stays in index.html: it is the model the pictures are made from
// (and the intro's moving copy). The pictures follow the theme and the
// layout's finger colours; a new keyboard (drawKeyboard) draws them again.
const handPics = new Map();   // "theme side ids" -> data: URL
const PIC_TOP = 12;           // room above the drawing for a lifted finger, in its units
let colorProbe = null;
function solidColor(css) {   // a colour as the browser resolves it (color-mix, variables)
  if (!colorProbe) { colorProbe = document.createElement("i"); colorProbe.hidden = true; document.body.appendChild(colorProbe); }
  colorProbe.style.color = css;
  return getComputedStyle(colorProbe).color;
}
// The picture of one hand ("l" or "r") with the fingers ids lit.
function handPicture(side, ids) {
  const theme = document.documentElement.dataset.theme || "dark";
  const key = `${theme} ${side} ${ids.join(",")}`;
  let url = handPics.get(key);
  if (url) return url;
  const hand = el.hands.querySelector(side === "l" ? ".hand.left" : ".hand.right");
  const lift = FEEL.fingerLiftPx;
  let body = "";
  for (const f of hand.querySelectorAll("[data-f]")) {
    const p = f.querySelector("path");
    const lit = ids.includes(f.dataset.f);
    const st = getComputedStyle(f);
    const fill = lit ? solidColor(st.getPropertyValue("--fcd").trim() || st.getPropertyValue("--fc")) : getComputedStyle(p).fill;
    const move = lit ? ` transform="translate(${(-parseFloat(f.style.getPropertyValue("--dx")) * lift).toFixed(2)} ${(-parseFloat(f.style.getPropertyValue("--dy")) * lift).toFixed(2)})"` : "";
    body += `<g${move}><path transform="${p.getAttribute("transform")}" d="${p.getAttribute("d")}" fill="${fill}"/></g>`;
  }
  const palm = hand.querySelector(".palm");
  body += `<path transform="${palm.getAttribute("transform")}" d="${palm.getAttribute("d")}" fill="${getComputedStyle(palm).fill}"/>`;
  // the wrist fades out at the bottom (the last quarter of the drawing)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-PIC_TOP} 100 ${84 + PIC_TOP}">` +
    `<defs><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="0" y1="62" x2="0" y2="84"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<mask id="m"><rect x="0" y="${-PIC_TOP}" width="100" height="${84 + PIC_TOP}" fill="url(#f)"/></mask></defs>` +
    `<g mask="url(#m)">${body}</g></svg>`;
  url = "data:image/svg+xml," + encodeURIComponent(svg);
  handPics.set(key, url);
  toPixels(key, url, side);
  return url;
}
// The picture turned into plain pixels once (a PNG at three times the
// hand's size, so zoom and sharp screens stay crisp): an SVG picture is
// drawn again each time an <img> switches to it, a PNG is only shown.
// Until it is ready the SVG picture stands in.
const PIC_SCALE = 3;
function toPixels(key, svgUrl, side) {
  const hand = el.hands.querySelector(side === "l" ? ".hand.left" : ".hand.right");
  const w = Math.round((parseFloat(getComputedStyle(hand).width) || 60) * PIC_SCALE * (devicePixelRatio || 1));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = w; c.height = Math.round(w * (84 + PIC_TOP) / 100);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob || handPics.get(key) !== svgUrl) return;   // a new keyboard drew its own meanwhile
      const png = URL.createObjectURL(blob);
      handPics.set(key, png);
      new Image().src = png;   // decoded now, so the first switch to it shows at once
      for (const shown of el.hands.querySelectorAll(".hand > img")) if (shown.getAttribute("src") === svgUrl) shown.src = png;
    });
  };
  img.src = svgUrl;
}
// Shows the picture of a hand; nothing is touched when it is the same.
// The first time after a new keyboard or theme, the pictures of every
// single finger are made at once, so they are pixels by the next keys.
function showHandPic(side, ids) {
  const theme = document.documentElement.dataset.theme || "dark";
  if (![...handPics.keys()].some((k) => k.startsWith(theme + " "))) {
    for (const f of el.hands.querySelectorAll("[data-f]")) {
      const id = f.dataset.f;
      handPicture(id === "thl" || id[0] === "l" ? "l" : "r", [id]);
    }
  }
  const img = el.hands.querySelector(side === "l" ? ".hand.left > img" : ".hand.right > img");
  const url = handPicture(side, ids);
  if (img && img.getAttribute("src") !== url) { img.src = url; img.dataset.f = ids.join(" "); }
}

// The lit look of a key (the next key to press), drawn once, under the
// key's own legend, in a layer of its own that stays invisible (typing.css
// .keyboard .key > .lit). Lighting a key only turns that layer's opacity on:
// the graphics card shows it, nothing is painted again. Before, the key
// itself changed colour, glow and height on every keypress, which painted
// the keyboard again and made a layer for the lift every time (measured,
// 2026-10-20: about a third of the work of a keypress with the keyboard on).
// It is a copy of the key's legend because it covers the key.
function addLit(key) {
  const lit = document.createElement("i");
  lit.className = "lit";
  lit.setAttribute("aria-hidden", "true");
  lit.textContent = key.querySelector(".lbl").textContent;
  const alt = key.querySelector(".alt");
  if (alt) lit.appendChild(alt.cloneNode(true));
  key.appendChild(lit);
}

// The key that types ch: its own key, or the base key for an AltGr letter;
// a capital (Climb) is typed on the key of its small letter.
const baseOf = (ch) => { const lc = ch.toLowerCase(); return S.altBase[lc] ?? lc; };
const keyFor = (ch) => S.keyEls[ch] || S.keyEls[baseOf(ch)] || null;

// Which finger presses the next key: a small hand rides along the top edge
// of the keyboard, right above the column of the next key, and that finger
// lights up on it, so the eyes find key and finger in one place (big hands
// above the keyboard draw the eyes to the hands first, then to the keys; a
// hand standing on the key above covers it).
// The hand of that side; both hands when both are used. Three separate
// settings: the lit key, the hand, the letter's colour in the text. Space = both thumbs; an AltGr letter = the right
// thumb (holding AltGr) plus the finger of the base key; a capital (Climb)
// = the finger of its key plus the little finger of the other hand, which
// holds Shift (the touch typing rule). The same thing is also written as a
// sentence, but only for screen readers.
let nextKeyEl = null;
export function highlightNextKey() {
  if (nextKeyEl) nextKeyEl.classList.remove("next");
  if (S.altgrEl) S.altgrEl.classList.remove("next");
  S.nextFc = "";
  const ch = S.text[S.pos];
  const base = ch === undefined ? ch : baseOf(ch);   // "ą" is typed on the "a" key, "A" too
  nextKeyEl = S.keyEls[base] || null;
  if (!nextKeyEl) { el.hint.innerHTML = "&nbsp;"; showHands(""); return; }
  // "Next key" off (a setting): find it from memory; the sentence for
  // screen readers still says it
  const lit = S.settings.nextKey, hand = S.settings.hand;
  if (lit) nextKeyEl.classList.add("next");
  const fingerId = fingerOf[base];
  let ids = fingerId === "th" ? ["thl", "thr"] : [fingerId];
  if (ch !== ch.toLowerCase()) ids.push(fingerId.startsWith("l") ? "rp" : "lp");   // Shift: the other hand
  const vars = { key: ch === " " ? t("key.space") : ch, base, finger: t(`finger.${fingerId}`) };
  if (S.altBase[ch]) {
    if (S.altgrEl && lit) S.altgrEl.classList.add("next");
    ids = [...ids, "thr"];
    el.hint.innerHTML = t("hint.alt", vars);
  } else {
    el.hint.innerHTML = t("hint.press", vars);
  }
  S.nextFc = S.layout.fingers[fingerId].color;   // the next letter in the text (typing.js lightNext)
  if (!hand) { showHands(""); return; }
  // each hand shows the picture with its own fingers lit
  const sideOf = (id) => (id === "thl" || id[0] === "l" ? "l" : "r");
  const sides = [...new Set(ids.map(sideOf))];
  for (const side of sides) showHandPic(side, ids.filter((id) => sideOf(id) === side).sort());
  showHands(sides.length === 2 ? "lr" : sides[0]);
  // above the key's column: a custom property, the hand moves by
  // "translate" (typing.css .keyboard > .hands); no layout is read
  el.hands.style.setProperty("--kx", nextKeyEl.dataset.x);
}
function showHands(show) {
  if (el.hands.dataset.show !== show) el.hands.dataset.show = show;
}

// A wrong key gets a quick red tint in the theme's --error (FEEL.keyMiss*,
// Web Animations API). A right key needs nothing here: it was the lit one,
// and its light sinks away as the next key lights up (typing.css .lit,
// FEEL.keyPress*). Before, every keypress started 5-7 animations (a dip of
// the key, a tap and a bounce of the finger, lifts): they made the typed
// letter show one or two frames later (measured, 2026-10-20).
// Nothing to do while the keyboard is off.
export function pulseKey(ch, ok) {
  if (ok || S.kbHidden) return;
  const k = keyFor(ch);
  if (!k || !k.animate || reducedMotion()) return;
  const red = `color-mix(in srgb, ${themeColor("--error")} ${Math.round(FEEL.keyMissAlpha * 100)}%, transparent)`;
  k.animate([{ boxShadow: `inset 0 0 0 999px ${red}` }, { boxShadow: "inset 0 0 0 999px transparent" }],
    { duration: FEEL.keyMissMs, easing: "ease-out" });
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

let applied = false;          // the first call always applies

// The keyboard is not a setting (issue #150): it shows in Learn while
// letters are still locked, when you are learning where the keys are, and
// is hidden in Climb and Freetype and once every letter is open: by then
// you type without looking. The hand is inside the keyboard and goes with
// it. Its size is always the largest that fits the window (fitKeyboard
// below). Touch screens never show it: you type with your thumbs on the
// phone's own keyboard, which also covers this part of the screen.
// Called on a mode change and whenever the letters are drawn; does
// nothing unless the answer changes. animate = true: it folds away or in
// smoothly (a mode switch, the last letter opened).
export function autoKb(animate = false) {
  const allOpen = S.exercise?.locked?.length === 0;
  const hide = isTouch() || S.mode !== "learn" || allOpen;
  if (hide === S.kbHidden && applied) return;
  applied = true;
  S.kbHidden = hide;
  document.body.classList.toggle("kb-hidden", S.kbHidden);   // phone CSS centres the text then
  if (animate && !reducedMotion() && el.keyboard.animate) fold(S.kbHidden);
  else {
    el.keyboard.classList.toggle("off", S.kbHidden);
    requestFit();
  }
}

// The keyboard goes or comes with the graphics card only (animating the
// height would lay out the page on every frame and stutter). Going: it
// fades and sinks a little, then
// leaves the page. Coming: it is put in at once at its final size and
// fades in. Either way the letters and the text jump to their new place
// and are moved back by "transform", which then glides to nothing (FLIP),
// so they seem to slide. A newer click cancels the running one.
const FOLD_MS = 220;
const FOLD_EASE = "cubic-bezier(.2, .8, .2, 1)";
let foldRun = 0;
async function fold(hide) {
  const run = ++foldRun;
  const movers = [lettersBar, el.textBox];
  for (const n of [el.keyboard, ...movers]) n.getAnimations().forEach((a) => a.cancel());
  if (hide) {
    const out = el.keyboard.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(14px)" }],
      { duration: FOLD_MS * .7, easing: "ease-in" });
    try { await out.finished; } catch { return; }   // cancelled by a newer click
    if (run !== foldRun) return;
  }
  const before = movers.map((n) => n.getBoundingClientRect().top);
  el.keyboard.classList.toggle("off", hide);
  if (!hide) fitKeyboard();                          // its size before anything is seen
  const after = movers.map((n) => n.getBoundingClientRect().top);
  movers.forEach((n, i) => {
    const dy = before[i] - after[i];
    if (Math.abs(dy) > .5) n.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: FOLD_MS, easing: FOLD_EASE });
  });
  if (!hide) el.keyboard.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
    { duration: FOLD_MS, easing: FOLD_EASE });
  if (hide) requestFit();
}

// Fit to the window: the keyboard grows with the key unit --u, and it must
// never push the page below the bottom of the window (no scrolling).
// Everything else is measured once (it does not depend on --u), and --u-fit
// caps the unit so the rest fits. Runs on load, resize, a new text and when
// the keyboard is switched on: never on a keypress.
// keyboard 4.36 u (4 rows, 3 gaps of .12 u) + the room above it for the
// hand (typing.css .keyboard margin-top), kept also while the hand is off:
// a setting never changes the keyboard's size
const KB_PER_U = 4 + 3 * KEY_GAP + FEEL.handRoom;
const KB_MIN_U = 26;       // px: a key smaller than this cannot be read at a glance
let fitFrame = 0;
// Asks for fitKeyboard in the next animation frame; several asks in one
// frame give one measure.
export function requestFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitKeyboard);
}
const lettersBar = document.querySelector("#view-type > .letters");   // carries the centring margin
// The unit fitted at the browser zoom the page was opened at (baseDpr).
// A zoom changes devicePixelRatio, not the window: then the keys keep this
// size in CSS px, so they shrink and grow with the zoom like the text
// does. Fitted again at every zoom, the keyboard grew while zooming out
// (the text above it shrank and left more room) and then shrank (from
// 100 % to 75 % it first grew). Zooming in still makes it
// smaller when it no longer fits.
let baseU = 0, baseDpr = 0;
function fitKeyboard() {
  const root = document.documentElement.style;
  // phones: the on-screen keyboard of the phone changes the window height all
  // the time, and the page may scroll there; no cap
  if (isTouch()) { root.removeProperty("--u-fit"); return; }
  if (S.kbHidden || S.view !== "type") return;
  // the result hides the keyboard (screens.css): measure again with the next text
  if (el.textBox.classList.contains("resulting")) return;
  // while the keyboard folds / unfolds its height and the margins of the hands
  // are half-way: a measure now would give a wrong (too big) size
  if (el.keyboard.getAnimations().length) return;
  const centred = getComputedStyle(el.viewType).getPropertyValue("--view-centred").trim() === "1";
  // the keyboard's panel (typing.css .keyboard): its padding and border do
  // not grow with --u, so they count as fixed room like everything else
  const kb = getComputedStyle(el.keyboard);
  const kbFrame = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, p) => sum + parseFloat(kb[p]), 0);
  // the room above the keyboard grows with --u too (it is in KB_PER_U)
  const away = document.body.classList.contains("kb-nofit");
  const above = away ? 0 : parseFloat(kb.marginTop) || 0;
  // Every mode has the same room above the text (typing.css: the hidden
  // Learn panel keeps its place), so the keyboard is the same size in all
  // three.
  const rest = document.querySelector(".top").offsetHeight + el.viewType.offsetHeight
    - el.keyboard.offsetHeight - above + kbFrame
    // desktop (typing.css --view-centred): the view takes all the height and
    // centres the letters and the text with two equal auto margins (above
    // the letters, at the end): that is free room. Otherwise the room above
    // the view (not in offsetHeight) is taken.
    + (centred ? -2 * parseFloat(getComputedStyle(lettersBar).marginTop) : parseFloat(getComputedStyle(el.viewType).marginTop))
    + document.querySelector(".bottom").offsetHeight + 12    // 12 = bottom padding of .views
    + parseFloat(getComputedStyle(document.body).paddingBottom);   // the bottom navigation bar (narrow windows)
  let fit = Math.floor((innerHeight - rest - 4) / KB_PER_U);
  if (!baseU || devicePixelRatio === baseDpr) { baseU = fit; baseDpr = devicePixelRatio; }
  else fit = Math.min(fit, baseU);   // zoomed: never bigger than at the start
  // too small to be of use (a short window, or the page zoomed far in):
  // the keyboard steps aside and the text keeps the room, as on a
  // phone; they come back when the window has room again
  document.body.classList.toggle("kb-nofit", fit < KB_MIN_U);
  root.setProperty("--u-fit", Math.max(KB_MIN_U, fit) + "px");
}
