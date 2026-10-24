// The caret's own movements, apart from where it goes (typing.js
// placeCaret decides that): the flinch on a mistake, the glide's pace, the breathing or
// pulsing while a round waits for a key, and the scroll of the text window
// to the next line.
// Layer: middle. Imports the bottom layer only. Called by: typing.js.
//
// Speed rule (AGENTS.md): every one of these runs on a keypress or in the
// frame after it, so each animates only "scale", "transform", "opacity" or
// "filter" with the Web Animations API (element.animate), kept and rewound
// instead of made anew; no layout is read here.

import { FEEL } from "./feel.js";
import { el, themeColor, reducedMotion } from "./state.js";

// The caret flinches for an instant on a mistake: it shrinks, turns red and
// shakes (knobs: FEEL.caretFlinch*, FEEL.caretShakePx). It animates "scale"
// and "transform" only, so the glide ("translate") is not touched.
export function flinchCaret() {
  if (!FEEL.caretFlinchMs || !el.caret.animate || reducedMotion()) return;
  // see-through, so the block caret (a setting) never hides its letter
  const red = `color-mix(in srgb, ${themeColor("--error")} 75%, transparent)`, px = FEEL.caretShakePx;
  el.caret.animate([
    { scale: `1 ${FEEL.caretFlinchScale}`, transform: "none", backgroundColor: red },
    { transform: `translateX(${-px}px)`, offset: .3 },
    { transform: `translateX(${px}px)`, offset: .6 },
    { scale: "1 1", transform: "none", backgroundColor: red },
  ], { duration: FEEL.caretFlinchMs, easing: "ease-out" });
}

// The glide keeps up with your hands (#141): at a slow pace

// the caret slides in FEEL.caretGlideMs; when keys come faster than that
// it would always be behind the letters, so the glide shrinks to a part
// (FEEL.caretGlidePace) of the time between your last few keys, never below
// FEEL.caretGlideMinMs. Called on every typed key (typing.js handleChar),
// before the frame that moves the caret. It writes the duration only when
// it changes by a whole step, on the caret and the streak badge alone (a
// variable on the text box would restyle every letter). Off when the
// glide is off (body[data-glide="jump"]) or the knob is 0.
let lastKey = 0, gap = 0, glideNow = 0;
export function paceGlide(now) {
  const since = now - lastKey;
  lastKey = now;
  if (!FEEL.caretGlidePace || document.body.dataset.glide === "jump") return;
  // a pause starts the average again: one slow key after a break says
  // nothing about the pace
  gap = since > FEEL.caretPaceResetMs || !gap ? Math.min(since, FEEL.caretPaceResetMs) : gap + (since - gap) / FEEL.caretPaceKeys;
  const step = FEEL.caretGlideStepMs;
  const ms = Math.round(Math.max(FEEL.caretGlideMinMs, Math.min(FEEL.caretGlideMs, gap * FEEL.caretGlidePace)) / step) * step;
  if (ms === glideNow) return;
  glideNow = ms;
  el.caret.style.setProperty("--feel-caret-ms", ms + "ms");
  el.streak.style.setProperty("--feel-caret-ms", ms + "ms");
}
// Back to the full glide (a new round, the glide setting changed).
export function resetGlide() {
  gap = 0; glideNow = 0;
  el.caret.style.removeProperty("--feel-caret-ms");
  el.streak.style.removeProperty("--feel-caret-ms");
}

// While a round waits for the next key, the caret breathes or pulses (a
// setting, body[data-blink]: "off", "breathe", "pulse"; settings.js) after
// FEEL.caretRestDelayMs of quiet; every key starts the wait again, so it
// stays solid while you type. One Web Animation for the whole round: a key
// only rewinds it to its start (placeCaret, once per frame at most); making a
// new one on every key cost the browser a new animation each time. A new
// choice in the settings makes a new one. It animates "filter", not
// "opacity": a hidden caret (opacity 0, text not in focus) stays hidden.
// Outside a round the CSS animations (typing.css, .caret) do the same.
let rest = null, restKind = "";
export function breathe(on) {
  const kind = document.body.dataset.blink || "breathe";
  if (rest && (!on || kind !== restKind)) { rest.cancel(); rest = null; }
  if (!on || kind === "off" || !el.caret.animate || reducedMotion()) return;
  if (rest) { rest.currentTime = 0; return; }
  const low = kind === "pulse" ? FEEL.caretPulseLow : FEEL.caretBreathLow;
  rest = el.caret.animate([{ filter: "opacity(1)" }, { filter: `opacity(${low})` }, { filter: "opacity(1)" }], {
    duration: kind === "pulse" ? FEEL.caretPulseMs : FEEL.caretBreathMs,
    delay: FEEL.caretRestDelayMs, iterations: Infinity, easing: "ease-in-out",
  });
  restKind = kind;
}

// Moves the text window to scrollTop = top in FEEL.lineScrollMs, fast at the
// start, soft at the end. The browser's own smooth scroll cannot be timed and
// takes ~400 ms, which felt like honey. scrollTop cannot be animated by CSS or
// element.animate(), so this one is stepped once per animation frame (the
// same frames the caret uses; no timers). A newer target replaces the old one.
let scrollFrame = 0;
export function scrollText(top, jump) {
  cancelAnimationFrame(scrollFrame);
  const from = el.text.scrollTop, ms = jump ? 0 : FEEL.lineScrollMs;
  if (!ms) { el.text.scrollTop = top; return; }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    el.text.scrollTop = from + (top - from) * (1 - (1 - k) ** 3);   // ease-out
    if (k < 1) scrollFrame = requestAnimationFrame(step);
  };
  scrollFrame = requestAnimationFrame(step);
}
// Stops a scroll on its way (a new text starts at the top at once).
export function stopScroll() {
  cancelAnimationFrame(scrollFrame);
}
