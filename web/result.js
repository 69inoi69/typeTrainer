// The result screen: when typing stops, the text window shows what just
// happened instead of the text. First the numbers (speed, accuracy,
// consistency), big, like on the live line; then one plain line when
// something happened (a new letter, a record, mastered letters); then which
// letters got faster or slower, as "before -> now" in milliseconds per press
// (a percentage was not clear). No jokes or tips: the owner wants plain
// results here (2026-10-16); fun lines may come back later on their word.
// It sits in the same fixed window as the text, so the page never moves.
//
// showResult(r) shows it and resolves when it is closed, and only on purpose
// (as on monkeytype): Enter, Esc or Tab, or the "next" button. There is no
// timer and typing a letter does not close it, so a round that ends in the
// middle of a word never skips the result (owner, 2026-10-16). It does not care WHY typing stopped (the end
// of the round, Esc or a long pause): the caller passes what to show.
// compareStats() works out what a learning round changed, for that screen.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports only the bottom layer.
// Called by: typing.js (showResult, compareStats at the end of a round),
// input.js (resultOpen, closeResult: Enter / Esc / Tab go on).
// To add a line: push another <p> in showResult, its text in i18n.js.

import { t } from "./i18n.js";
import { $, el, isTouch } from "./state.js";


const box = $("result");
let done = null;           // resolves the promise of the open result

export const resultOpen = () => done !== null;

// r: { wpm, accuracy, consistency (null = too short), newLetter, best, mastered: [chars],
//      faster/slower: [{c, from, to}] (ms per press before and after), test: "pass" | "fail" | "stopped" (the typing test only) }
export function showResult(r) {
  const lines = [];
  // 1. the numbers: value big, a fixed label under it
  const num = (value, unit, label) =>
    `<span class="r-num"><b>${value}<small>${unit}</small></b><span class="lbl-ui">${t(label)}</span></span>`;
  const nums = [num(Math.round(r.wpm), "", "result.wpm"), num(Math.round(r.accuracy), "%", "result.acc")];
  if (r.consistency != null) nums.push(num(Math.round(r.consistency), "%", "result.cons"));
  lines.push(`<p class="r-nums">${nums.join("")}</p>`);

  // 2. one plain line: what happened, the most important thing first
  const mastered = (r.mastered ?? []).join(" ");
  let main = "", cls = "";
  if (r.test) { main = t(`result.test.${r.test}`); cls = r.test === "pass" ? " k-best" : ""; }
  else if (r.newLetter) main = `<span class="r-badge">${r.newLetter}</span>` + t("result.newLetter", { letter: r.newLetter });
  else if (r.best) { main = t("result.best"); cls = " k-best"; }
  else if (mastered) main = t("result.mastered", { letters: mastered });
  if (main) lines.push(`<p class="r-main${cls}">${main}</p>`);

  // 3. letters that changed: time per press before and now, green = faster, red = slower
  const chip = (x, c) => `<span class="r-ch ${c}"><b>${x.c}</b>${x.from}→${x.to}<small>ms</small></span>`;
  const changed = [];
  if (r.faster?.length) changed.push(`<span class="lbl-ui">${t("result.faster")}</span>${r.faster.map((x) => chip(x, "up")).join("")}`);
  if (r.slower?.length) changed.push(`<span class="lbl-ui">${t("result.slower")}</span>${r.slower.map((x) => chip(x, "down")).join("")}`);
  if (changed.length) lines.push(`<p class="r-letters">${changed.join('<span class="r-sep"></span>')}</p>`);

  return open(lines);
}

// Puts the lines into the window and waits until the result is closed.
function open(lines) {
  box.innerHTML = `<div class="r-body">${lines.join("")}</div>` +
    `<button type="button" class="btn r-next">${t("result.nextBtn")}${isTouch() ? "" : " <kbd>enter</kbd>"}</button>`;
  box.querySelector(".r-next").addEventListener("click", (e) => { e.stopPropagation(); closeResult(); });
  box.hidden = false;
  el.textBox.classList.add("resulting");
  return new Promise((resolve) => { done = resolve; });
}

// Closes the result screen; the waiting showResult() resolves and the
// caller starts the next round.
export function closeResult() {
  if (!done) return;
  const resolve = done;
  done = null;
  box.hidden = true;
  el.textBox.classList.remove("resulting");
  resolve();
}

// What one round changed: a new record, letters mastered, and which
// letters got faster or slower (smoothed time per letter, avgMs, before and
// after). Only letters typed in this round count. Display only.
const CHANGE_MIN = 0.03;   // a letter must change by 3 % or more to be named
export function compareStats(before, after, samples) {
  const prev = Object.fromEntries((before?.keys ?? []).map((k) => [k.char, k]));
  const typed = new Set(samples.map((x) => x.char).filter((c) => c !== " "));
  const best = (before?.sessionCount ?? 0) > 0 &&
    (after.sessions[0]?.wpm ?? 0) > Math.max(0, ...before.sessions.map((x) => x.wpm));   // /stats: newest first
  const mastered = after.keys.filter((k) => k.mastered && !prev[k.char]?.mastered).map((k) => k.char);
  const change = after.keys
    .filter((k) => typed.has(k.char) && prev[k.char]?.count > 0 && prev[k.char].avgMs > 0)
    .map((k) => ({ c: k.char, from: Math.round(prev[k.char].avgMs), to: Math.round(k.avgMs),
      pct: Math.round((1 - k.avgMs / prev[k.char].avgMs) * 100) }))
    .filter((x) => Math.abs(x.pct) >= CHANGE_MIN * 100);
  const faster = change.filter((x) => x.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const slower = change.filter((x) => x.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 2);
  return { best, mastered, faster, slower };
}
