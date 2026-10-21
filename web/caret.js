// The caret's own movements, apart from where it goes (typing.js
// placeCaret decides that): the flinch on a mistake, the kick and trail on a
// right key, the breathing while a round waits for a key, and the scroll of
// the text window to the next line.
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

// A right key: the caret starts a little bigger and settles (FEEL.caretKick*),
// and a short trail from where it was shrinks into it (FEEL.caretTrail*),
// both in the same frame as the glide. dx: how far the caret moved, px;
// sameLine: it stayed on its line (no trail across a line break or going
// back). One Web Animation for each, kept for the whole page: a key only
// gives the trail its new length and rewinds both (a new animation on every
// key costs the browser more). Only "scale" and "opacity" move, on layers of
// their own, so nothing is laid out or painted again.
let kickAnim = null, trailAnim = null;
export function kickCaret(dx, sameLine) {
  if (!el.caret.animate || reducedMotion()) return;
  if (FEEL.caretKickMs && FEEL.caretKickScale !== 1) {
    const k = FEEL.caretKickScale;
    const frames = [{ scale: `${k} ${k}` }, { scale: "1 1" }];
    kickAnim ??= el.caret.animate(frames, { duration: FEEL.caretKickMs, easing: "ease-out" });
    kickAnim.effect.setKeyframes(frames);
    kickAnim.effect.updateTiming({ duration: FEEL.caretKickMs });
    kickAnim.currentTime = 0; kickAnim.play();
  }
  const trail = el.caret.firstElementChild;
  if (!FEEL.caretTrailMs || !FEEL.caretTrailAlpha || !sameLine || dx <= 0 || !trail) return;
  // the trail is drawn 100 px long (typing.css .caret-trail) and scaled to dx
  const frames = [{ scale: `${dx / 100} 1`, opacity: FEEL.caretTrailAlpha }, { scale: "0 1", opacity: 0 }];
  trailAnim ??= trail.animate(frames, { duration: FEEL.caretTrailMs, easing: "ease-out" });
  trailAnim.effect.setKeyframes(frames);
  trailAnim.effect.updateTiming({ duration: FEEL.caretTrailMs });
  trailAnim.currentTime = 0; trailAnim.play();
}

// While a round waits for the next key, the caret breathes (fades out and in)
// after FEEL.caretBreathDelayMs of quiet; every key starts the wait again, so
// it stays solid while you type. One Web Animation for the whole round: a key
// only rewinds it to its start (placeCaret, once per frame at most); making a
// new one on every key cost the browser a new animation each time. It
// animates "filter", not "opacity": a hidden caret (opacity 0, text not in
// focus) stays hidden. Outside a round the CSS animation (typing.css, .caret)
// does the same.
let breath = null;
export function breathe(on) {
  if (!on || !FEEL.caretBreathMs || !el.caret.animate || reducedMotion()) {
    breath?.cancel();
    breath = null;
    return;
  }
  if (breath) { breath.currentTime = 0; return; }
  breath = el.caret.animate([{ filter: "opacity(1)" }, { filter: "opacity(.3)" }, { filter: "opacity(1)" }],
    { duration: FEEL.caretBreathMs, delay: FEEL.caretBreathDelayMs, iterations: Infinity, easing: "ease-in-out" });
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
