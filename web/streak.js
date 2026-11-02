// The clean word streak.

import { el, S } from "./state.js";

const STREAK_SHOW = 3;
const STREAK_TIERS = [10, 25, 50];
const streakTier = (n) => STREAK_TIERS.filter((x) => n >= x).length;
export const STREAK_RISE = 14;
export const streakOn = () => S.settings.streak && S.mode === "freetype";

let streak = 0;

export function cleanWord() {
  streak++;
  renderStreak();
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
