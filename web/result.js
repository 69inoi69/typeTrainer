// The result screen: when typing stops, the text window shows what just
// happened instead of the text. First the numbers (speed, accuracy,
// consistency), each under its label; then one plain line when
// something happened (a new letter, a record, mastered letters); then which
// letters got faster or slower, as "before -> now" in milliseconds per press
// (a percentage was not clear); then the words of the round, coloured by
// speed, each with its own speed on hover or tap. No jokes or tips: the owner wants plain
// results here (2026-10-16); fun lines may come back later on their word.
// It sits in the same fixed window as the text, so the page never moves.
// The "next round" button has its own row at the bottom (full width on a
// phone), under everything else.
//
// showResult(r) shows it and resolves when it is closed, and only on purpose
// (as on monkeytype): Enter, Esc or Tab, or the "new round" button. There is no
// timer and typing a letter does not close it, so a round that ends in the
// middle of a word never skips the result (owner, 2026-10-16). It does not care WHY typing stopped (the end
// of the round, Esc or a long pause): the caller passes what to show.
// compareStats() works out what a learning round changed, for that screen.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports the bottom layer and tools.js (tooltips).
// Called by: typing.js (showResult, compareStats at the end of a round),
// input.js (resultOpen, closeResult: Enter / Esc / Tab go on).
// To add a line: push another <p> in showResult, its text in i18n.js.

import { t } from "./i18n.js";
import { $, el, isTouch } from "./state.js";
import { showTip } from "./tools.js";


const box = $("result");
let done = null;           // resolves the promise of the open result

export const resultOpen = () => done !== null;

// r: { wpm, accuracy, consistency (null = too short), newLetter, best, mastered: [chars],
//      faster/slower: [{c, from, to}] (ms per press before and after), test: "pass" | "fail" | "stopped" (the typing test only),
//      words: [{letters: [{c, bad}], wpm}] (typing.js typedWords) }
export function showResult(r) {
  const lines = [];
  // 1. the numbers: a fixed label on top, the value under it
  const num = (value, unit, label) =>
    `<span class="r-num"><span class="r-lbl">${t(label)}</span><b>${value}<small>${unit}</small></b></span>`;
  const nums = [num(Math.round(r.wpm), "", "result.wpm"), num(Math.round(r.accuracy), "%", "result.acc")];
  if (r.consistency != null) nums.push(num(Math.round(r.consistency), "%", "result.cons"));
  lines.push(`<p class="r-nums">${nums.join("")}</p>`);

  // 2. one plain line: what happened, the most important thing first
  const mastered = (r.mastered ?? []).join(" ");
  let main = "", cls = "";
  if (r.test) { main = `<span>${t(`result.test.${r.test}`)}</span>`; cls = r.test === "pass" ? " k-best" : ""; }
  else if (r.newLetter) { main = `<span>${t("result.newLetter")}</span><span class="r-badge">${r.newLetter}</span>`; cls = " k-letter"; }
  else if (r.best) { main = t("result.best"); cls = " k-best"; }
  else if (mastered) {
    // the same look as the status line above: a green tick, the label, the letters as small keys
    main = `<svg class="r-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>` +
      `<span class="r-lbl">${t("result.masteredLabel")}</span>${r.mastered.map((c) => `<b class="r-key">${c}</b>`).join("")}`;
    cls = " r-mastered";
  }
  if (main) lines.push(`<p class="r-main${cls}">${main}</p>`);

  // 3. letters that changed: time per press before and now, green = faster,
  // red = slower. Two columns side by side, Faster always on the left and
  // Slower on the right (style.css), one letter per line.
  const chip = (x, c) => `<span class="r-ch ${c}"><b>${x.c}</b>${x.from}→${x.to}<small>ms</small></span>`;
  const changed = [];
  if (r.faster?.length) changed.push(`<p class="r-col up"><span class="lbl-ui">${t("result.faster")}</span>${r.faster.map((x) => chip(x, "up")).join("")}</p>`);
  if (r.slower?.length) changed.push(`<p class="r-col down"><span class="lbl-ui">${t("result.slower")}</span>${r.slower.map((x) => chip(x, "down")).join("")}</p>`);
  if (changed.length) lines.push(`<div class="r-letters">${changed.join("")}</div>`);

  // 4. the words of the round as typed (as on monkeytype): each word is
  // coloured by its speed (speedBands), a letter that had a mistake is
  // underlined in red; hover (or tap, on a phone) shows the word's speed
  if (r.words?.length) {
    const bands = speedBands(r.words.map((w) => w.wpm).filter((v) => v != null));
    const word = (w) => {
      const sp = w.wpm != null ? ` s${bands.level(w.wpm)}" tabindex="0" data-tip-text="${t("result.wordWpm", { wpm: w.wpm })}` : "";
      return `<span class="r-w${sp}">` + w.letters.map((x) => x.bad ? `<i>${x.c}</i>` : x.c).join("") + `</span>`;
    };
    const legend = bands.labels.length
      ? `<span class="r-legend" aria-hidden="true">${bands.labels.map((l, i) => `<span class="s${i + 1}">${l}</span>`).join("")}</span>` : "";
    lines.push(`<div class="r-words"><p class="r-words-head"><span class="lbl-ui">${t("result.words")}</span>${legend}</p>` +
      `<p class="r-wordlist">${r.words.map(word).join(" ")}</p></div>`);
  }

  return open(lines);
}

// Splits the speeds of this round's words into SPEED_BANDS equal steps
// between the slowest and the fastest word, as monkeytype does: the colour
// says "slow or fast for this round", not compared with anyone else.
// level(wpm) is 1 (slowest, red) to SPEED_BANDS (fastest, green); labels
// are the ranges for the legend ("<39", "39-57", ..., "93+"). When all
// words have about the same speed there is nothing to compare: every word
// gets the middle colour and there is no legend.
const SPEED_BANDS = 5;
const MIN_SPREAD = 5;   // wpm; a smaller gap between the slowest and fastest word is noise
export function speedBands(speeds) {
  const lo = Math.min(...speeds), hi = Math.max(...speeds);
  if (!speeds.length || hi - lo < MIN_SPREAD) {
    return { level: () => Math.ceil(SPEED_BANDS / 2), labels: [] };
  }
  const step = (hi - lo) / SPEED_BANDS;
  // edges[i] is the first speed of band i+2, rounded to whole wpm
  const edges = Array.from({ length: SPEED_BANDS - 1 }, (_, i) => Math.round(lo + step * (i + 1)));
  const level = (v) => 1 + edges.filter((e) => v >= e).length;
  const labels = [`<${edges[0]}`];
  for (let i = 1; i < edges.length; i++) labels.push(`${edges[i - 1]}-${edges[i] - 1}`);
  labels.push(`${edges[edges.length - 1]}+`);
  return { level, labels };
}

// Puts the lines into the window and waits until the result is closed.
function open(lines) {
  box.innerHTML = `<div class="r-body">${lines.join("")}</div>` +
    `<p class="r-foot"><button type="button" class="btn r-next">${t("result.nextBtn")}${isTouch() ? "" : " <kbd>enter</kbd>"}</button></p>`;
  // phones have no hover: a tap on a word shows its speed (and must not
  // reach the text window, which would open the phone keyboard)
  box.querySelector(".r-wordlist")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const w = e.target.closest("[data-tip-text]");
    if (w) showTip(w);
  });
  box.querySelector(".r-next").addEventListener("click", (e) => {
    e.stopPropagation();
    // the tap itself opens the phone keyboard: the next round can be typed
    // at once, without a second "tap here to start typing"
    el.input.focus({ preventScroll: true });
    el.textBox.classList.remove("blurred");
    closeResult();
  });
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
