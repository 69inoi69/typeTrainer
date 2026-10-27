// The clean word streak.

import { FEEL } from "./feel.js";
import { FX } from "./fx.js";
import { el, S, reducedMotion } from "./state.js";

const STREAK_SHOW = 3;
const STREAK_TIERS = [10, 25, 50];
const streakTier = (n) => STREAK_TIERS.filter((x) => n >= x).length;
export const STREAK_RISE = 14;
const isMilestone = (n) => n === 10 || n === 25 || (n > 0 && n % 50 === 0);
export const streakOn = () => S.settings.streak && S.mode === "freetype";

let streak = 0;

export function cleanWord() {
  streak++;
  renderStreak();
  if (isMilestone(streak)) popStreak();
  else if (streak > STREAK_SHOW) hopStreak();
}
export function breakStreak() {
  streak = 0;
  renderStreak();
}
function renderStreak() {
  el.streakN.textContent = streak;
  el.streak.dataset.tier = streakTier(streak);
  el.streak.classList.toggle("show", streakOn() && streak >= STREAK_SHOW);
}
function popStreak() {
  if (!streakOn()) return;
  FX.bump(el.streak, 1.2);
}
let hopAnim = null;
function hopStreak() {
  if (!streakOn() || !FEEL.streakHopMs || !el.streakN.animate || reducedMotion()) return;
  const frames = [{ transform: `translateY(${-FEEL.streakHopPx}px) scale(${FEEL.streakHopScale})` }, { transform: "none" }];
  hopAnim ??= el.streakN.animate(frames, { duration: FEEL.streakHopMs, easing: "cubic-bezier(.2,.8,.2,1)" });
  hopAnim.effect.setKeyframes(frames);
  hopAnim.effect.updateTiming({ duration: FEEL.streakHopMs });
  hopAnim.currentTime = 0; hopAnim.play();
}
