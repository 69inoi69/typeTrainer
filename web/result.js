// The result screen: when typing stops, the text window shows what just
// happened instead of the text: one main line (a new letter, a record,
// mastered letters, or a short verdict on accuracy), which letters got
// faster or slower, and now and then a tip. It sits in the same fixed window
// as the text, so the page never moves.
//
// showResult(r) shows it and resolves when it is closed: Space, Enter, any
// letter, a click, or when its time bar is full (hover pauses the bar, so a
// beginner can read in peace). It does not care WHY typing stopped (the end
// of the round, Esc or a long pause): the caller passes what to show.
// compareStats() works out what a learning round changed, for that screen.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports only the bottom layer.
// Called by: typing.js (showResult, compareStats at the end of a round),
// input.js (resultOpen, closeResult: any key goes on).

import { t, tPick, hasText } from "./i18n.js";
import { $, el } from "./state.js";

const RESULT_MS = 6000;    // time on screen before the next round comes by itself
const ADVICE_CHANCE = 0.4; // chance of a tip when no letter changed noticeably

const box = $("result");
let done = null;           // resolves the promise of the open result

export const resultOpen = () => done !== null;

// r: { wpm, accuracy, consistency (null = too short), newLetter, best, mastered: [chars], resisted,
//      faster: [{c, pct}], slower: [{c, pct}], test: "pass" | "fail" | "stopped" (the typing test only) }
export function showResult(r) {
  const lines = [];
  // 1. the main line: the most important thing that happened
  const wpm = Math.round(r.wpm);
  const mastered = (r.mastered ?? []).join(" ");
  if (r.test) {
    // the typing test: passed or not, and the numbers it was judged on
    lines.push(`<p class="r-main${r.test === "pass" ? " k-best" : ""}">${t(`result.test.${r.test}`)}</p>`);
    lines.push(`<p class="r-facts">${t("result.testScore", { wpm, acc: Math.round(r.accuracy) })}</p>`);
    return open(lines);
  }
  if (r.newLetter) {
    const l = r.newLetter;
    const joke = hasText(`joke.${l}`) ? t(`joke.${l}`) : tPick("joke", { letter: l });
    lines.push(`<p class="r-main k-letter"><span class="r-badge">${l}</span>${t("result.newLetter", { letter: l, joke })}</p>`);
  } else if (r.best) {
    lines.push(`<p class="r-main k-best">${tPick("result.best", { wpm })}</p>`);
  } else if (mastered) {
    lines.push(`<p class="r-main k-mastered">${tPick("result.mastered", { letters: mastered })}</p>`);
  } else {
    const verdict = r.accuracy >= 97 ? "result.clean" : r.accuracy >= 90 ? "result.ok" : "result.messy";
    lines.push(`<p class="r-main">${tPick(verdict)}</p>`);
  }
  // 2. small facts that did not make the main line
  const facts = [];
  if (r.newLetter && r.best) facts.push(tPick("result.best", { wpm }));
  if ((r.newLetter || r.best) && mastered) facts.push(tPick("result.mastered", { letters: mastered }));
  if (r.resisted) facts.push(tPick("result.resisted", { n: r.resisted }));
  // 3. letters that changed: green = faster, red = slower
  const chip = (x, cls) => `<span class="r-ch ${cls}"><b>${x.c}</b>${Math.abs(x.pct)}%</span>`;
  const changed = [];
  if (r.faster?.length) changed.push(`<span class="r-lbl">${t("result.faster")}</span>${r.faster.map((x) => chip(x, "up")).join("")}`);
  if (r.slower?.length) changed.push(`<span class="r-lbl">${t("result.slower")}</span>${r.slower.map((x) => chip(x, "down")).join("")}`);
  if (changed.length) lines.push(`<p class="r-letters">${changed.join('<span class="r-sep"></span>')}</p>`);
  // a tip only when nothing else happened (consistency is always there, so it does not count)
  const advice = !facts.length && !changed.length && Math.random() < ADVICE_CHANCE;
  if (r.consistency != null) facts.push(t("result.consistency", { pct: Math.round(r.consistency) }));
  if (advice) facts.push(tPick("advice"));
  if (facts.length) lines.push(`<p class="r-facts">${facts.join(" · ")}</p>`);

  return open(lines);
}

// Puts the lines into the window and waits until the result is closed.
function open(lines) {
  box.innerHTML = `<div class="r-body">${lines.join("")}</div>` +
    `<p class="r-next">${t("result.next")}</p><i class="r-bar" style="--ms:${RESULT_MS}ms"></i>`;
  box.querySelector(".r-bar").addEventListener("animationend", closeResult);
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
box.addEventListener("click", closeResult);

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
    .map((k) => ({ c: k.char, pct: Math.round((1 - k.avgMs / prev[k.char].avgMs) * 100) }))
    .filter((x) => Math.abs(x.pct) >= CHANGE_MIN * 100);
  const faster = change.filter((x) => x.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const slower = change.filter((x) => x.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 2);
  return { best, mastered, faster, slower };
}
