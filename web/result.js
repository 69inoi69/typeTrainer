// The result screen: when typing stops, the text window shows what just
// happened instead of the text: one main line (a new letter, a record,
// mastered letters, or a short verdict on accuracy), which letters got
// faster or slower, and now and then a tip. It sits in the same fixed window
// as the text, so the page never moves.
//
// showResult(r) shows it and resolves when it is closed: Space, Enter, any
// letter, a click, or when its time bar is full (hover pauses the bar, so a
// beginner can read in peace). It does not care WHY typing stopped (end of a
// text, or a pause in an endless text): the caller passes what to show.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports only the bottom layer.

import { t, tPick, hasText } from "./i18n.js";
import { $, el } from "./state.js";

const RESULT_MS = 6000;    // time on screen before the next text comes by itself
const ADVICE_CHANCE = 0.4; // chance of a tip when no letter changed noticeably

const box = $("result");
let done = null;           // resolves the promise of the open result

export const resultOpen = () => done !== null;

// r: { wpm, accuracy, newLetter, best, mastered: [chars], resisted,
//      faster: [{c, pct}], slower: [{c, pct}] }
export function showResult(r) {
  const lines = [];
  // 1. the main line: the most important thing that happened
  const wpm = Math.round(r.wpm);
  const mastered = (r.mastered ?? []).join(" ");
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
  if (facts.length) lines.push(`<p class="r-facts">${facts.join(" · ")}</p>`);
  else if (!changed.length && Math.random() < ADVICE_CHANCE) lines.push(`<p class="r-facts">${tPick("advice")}</p>`);

  box.innerHTML = `<div class="r-body">${lines.join("")}</div>` +
    `<p class="r-next">${t("result.next")}</p><i class="r-bar" style="--ms:${RESULT_MS}ms"></i>`;
  box.querySelector(".r-bar").addEventListener("animationend", closeResult);
  box.hidden = false;
  el.textBox.classList.add("resulting");
  return new Promise((resolve) => { done = resolve; });
}

export function closeResult() {
  if (!done) return;
  const resolve = done;
  done = null;
  box.hidden = true;
  el.textBox.classList.remove("resulting");
  resolve();
}
box.addEventListener("click", closeResult);
