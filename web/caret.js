// Caret motion: flinch, glide pace and line scroll.

import { FEEL } from "./feel.js";
import { el, themeColor, reducedMotion } from "./state.js";

export function flinchCaret() {
  if (!FEEL.caretFlinchMs || !el.caret.animate || reducedMotion()) return;
  const red = `color-mix(in srgb, ${themeColor("--error")} 75%, transparent)`, px = FEEL.caretShakePx;
  el.caret.animate([
    { scale: `1 ${FEEL.caretFlinchScale}`, transform: "none", backgroundColor: red },
    { transform: `translateX(${-px}px)`, offset: .3 },
    { transform: `translateX(${px}px)`, offset: .6 },
    { scale: "1 1", transform: "none", backgroundColor: red },
  ], { duration: FEEL.caretFlinchMs, easing: "ease-out" });
}

let lastKey = 0, gap = 0, glideNow = 0;
export function paceGlide(now) {
  const since = now - lastKey;
  lastKey = now;
  if (!FEEL.caretGlidePace || document.body.dataset.glide === "jump") return;
  gap = since > FEEL.caretPaceResetMs || !gap ? Math.min(since, FEEL.caretPaceResetMs) : gap + (since - gap) / FEEL.caretPaceKeys;
  const step = FEEL.caretGlideStepMs;
  const ms = Math.round(Math.max(FEEL.caretGlideMinMs, Math.min(FEEL.caretGlideMs, gap * FEEL.caretGlidePace)) / step) * step;
  if (ms === glideNow) return;
  glideNow = ms;
  el.caret.style.setProperty("--feel-caret-ms", ms + "ms");
  el.streak.style.setProperty("--feel-caret-ms", ms + "ms");
}
export function resetGlide() {
  gap = 0; glideNow = 0;
  el.caret.style.removeProperty("--feel-caret-ms");
  el.streak.style.removeProperty("--feel-caret-ms");
}

let scrollFrame = 0;
export function scrollText(top, jump) {
  cancelAnimationFrame(scrollFrame);
  const from = el.text.scrollTop, ms = jump ? 0 : FEEL.lineScrollMs;
  if (!ms) { el.text.scrollTop = top; return; }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    el.text.scrollTop = from + (top - from) * (1 - (1 - k) ** 3);
    if (k < 1) scrollFrame = requestAnimationFrame(step);
  };
  scrollFrame = requestAnimationFrame(step);
}
export function stopScroll() {
  cancelAnimationFrame(scrollFrame);
}
