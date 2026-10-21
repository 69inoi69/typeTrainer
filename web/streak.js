// The streak: clean words in a row, a bolt and a number riding on the caret.
// Freetype only, and only when turned on in the settings (owner, 2026-10-20:
// it says little, and typing comes first); Learn and Climb never show it.
// Shown from 3 words (owner, 2026-10-18: in the numbers line it covered the
// status line, and its flicker, zapping bolt, shake and confetti were too
// loud). Its colour warms at each tier (layout.css .streak[data-tier]):
// gold from the start, since 3 clean words already deserve to feel good
// (owner, 2026-10-18: grey read as "nothing"). At 10, 25, 50 and every 50
// after, the badge gives one small bump, no text (owner: the notes were too
// long). Every clean word after that makes the number hop once
// (FEEL.streakHop*; owner, 2026-10-20: it only changed, with nothing to
// see). Visual only, nothing is measured or sent.
// Layer: middle. Imports the bottom layer only. Called by: typing.js (a word
// ends clean, a mistake breaks it, placeCaret puts the badge over the caret).

import { FEEL } from "./feel.js";
import { FX } from "./fx.js";
import { el, S, reducedMotion } from "./state.js";

const STREAK_SHOW = 3;
const STREAK_TIERS = [10, 25, 50];   // clean words where the colour changes
const streakTier = (n) => STREAK_TIERS.filter((x) => n >= x).length;
// px: how far above the caret's top the badge sits: close over it, away from
// the line above (owner, 2026-10-18: twice "a little lower")
export const STREAK_RISE = 14;
const isMilestone = (n) => n === 10 || n === 25 || (n > 0 && n % 50 === 0);
export const streakOn = () => S.settings.streak && S.mode === "freetype";

let streak = 0;            // words in a row typed without a single mistake

// A word was typed without a mistake: one more.
export function cleanWord() {
  streak++;
  renderStreak();
  if (isMilestone(streak)) popStreak();
  else if (streak > STREAK_SHOW) hopStreak();
}
// A mistake: the streak starts again from 0.
export function breakStreak() {
  streak = 0;
  renderStreak();
}
function renderStreak() {
  el.streakN.textContent = streak;
  el.streak.dataset.tier = streakTier(streak);
  el.streak.classList.toggle("show", streakOn() && streak >= STREAK_SHOW);
}
// A milestone: the badge gives one small bump.
function popStreak() {
  if (!streakOn()) return;
  FX.bump(el.streak, 1.2);
}
// One more clean word: the number hops up a little and settles. Once a word,
// never per key; only "transform" of the number, so nothing is laid out or
// painted again. One Web Animation, kept and rewound (as caret.js kickCaret).
let hopAnim = null;
function hopStreak() {
  if (!streakOn() || !FEEL.streakHopMs || !el.streakN.animate || reducedMotion()) return;
  const frames = [{ transform: `translateY(${-FEEL.streakHopPx}px) scale(${FEEL.streakHopScale})` }, { transform: "none" }];
  hopAnim ??= el.streakN.animate(frames, { duration: FEEL.streakHopMs, easing: "cubic-bezier(.2,.8,.2,1)" });
  hopAnim.effect.setKeyframes(frames);
  hopAnim.effect.updateTiming({ duration: FEEL.streakHopMs });
  hopAnim.currentTime = 0; hopAnim.play();
}
