// The result screen: when typing stops, the text window shows what just
// happened instead of the text. The layout follows monkeytype, but is our
// own (owner, 2026-10-16, variant "A"): on top, the two main numbers big on
// the left (speed, accuracy) and a wide chart of each word's speed on the
// right; under them one row of smaller facts (consistency, time, the
// characters) and, at its right end, what happened (a new letter, letters
// mastered, the test verdict); then the words themselves, coloured by speed,
// each with its own speed on hover or tap. No jokes or tips: the owner wants
// plain results here (2026-10-16); fun lines may come back later on their word.
// It sits in the same fixed window as the text, so the page never moves.
// The "next round" button has its own row at the bottom, centred (full width
// on a phone), under everything else.
//
// showResult(r) shows it and resolves when it is closed, and only on purpose
// (as on monkeytype): Enter, Tab or the "new round" button. There is no
// timer and typing a letter does not close it, so a round that ends in the
// middle of a word never skips the result (owner, 2026-10-16). It does not care WHY typing stopped (the end
// of the round, or Esc): the caller passes what to show.
// compareStats() works out what a learning round changed, for that screen.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports the bottom layer and tools.js (tooltips).
// Called by: typing.js (showResult, compareStats at the end of a round),
// input.js (resultOpen, closeResult: Enter / Esc / Tab go on).
// To add a fact: another cell in the row in showResult, its text in i18n.js.

import { t } from "./i18n.js";
import { $, el, isTouch } from "./state.js";
import { showTip } from "./tools.js";


const box = $("result");
let done = null;           // resolves the promise of the open result

export const resultOpen = () => done !== null;

// r: { wpm, accuracy, consistency (null = too short), newLetter, best, mastered: [chars],
//      test: "pass" | "fail" | "stopped" (the typing test only),
//      words: [{letters: [{c, bad}], wpm}] (typing.js typedWords),
//      chars: {correct, wrong, extra, missed}, seconds (typing.js roundFacts) }
export function showResult(r) {
  // a number: a fixed label on top, the value under it; size "big" (the
  // two main numbers) or "mid" (the row of facts). Shown as it is: no count
  // up from 0 (owner, 2026-10-19: "just show the result at once").
  const num = (value, unit, label, size, tip) =>
    `<span class="r-num ${size}"${tip ? ` tabindex="0" data-tip-text="${t(tip)}"` : ""}><span class="r-lbl">${t(label)}</span><b>${value}<small>${unit}</small></b></span>`;

  // 1. the top: speed and accuracy big on the left, the speed the biggest
  // ("hero": the one number to see first). No "new best" tag (owner,
  // 2026-10-18: it widened the column and left a gap; a record still gets
  // its confetti, typing.js)
  const hero = `<div class="r-hero">${num(Math.round(r.wpm), "", "result.wpm", "big hero")}` +
    `${num(Math.round(r.accuracy), "%", "result.acc", "big")}</div>`;
  // ... and on the right the speed of each word (as on monkeytype): the
  // label, the legend of the colours, the chart. The words themselves come
  // last; each is coloured by its speed (speedBands), a letter that had a
  // mistake is underlined in red; hover (or tap, on a phone) shows its speed
  let graph = "", list = "";
  if (r.words?.length) {
    const bands = speedBands(r.words.map((w) => w.wpm).filter((v) => v != null));
    const word = (w) => {
      const sp = w.wpm != null ? ` s${bands.level(w.wpm)}" tabindex="0" data-tip-text="${t("result.wordWpm", { wpm: w.wpm })}` : "";
      return `<span class="r-w${sp}">` + w.letters.map((x) => x.bad ? `<i>${x.c}</i>` : x.c).join("") + `</span>`;
    };
    const legend = bands.labels.length
      ? `<span class="r-legend" aria-hidden="true">${bands.labels.map((l, i) => `<span class="s${i + 1}">${l}</span>`).join("")}</span>` : "";
    graph = `<div class="r-graph"><p class="r-words-head"><span class="lbl-ui">${t("result.words")}</span>${legend}</p>${speedChart(r.words, bands)}</div>`;
    list = `<p class="r-wordlist">${r.words.map(word).join(" ")}</p>`;
  }

  // 2. the row of facts: consistency, time, the characters (each number
  // with its word: "97/20/19/4" said nothing; extra and missed are not
  // obvious, a tooltip says what they count)
  const row = [];
  if (r.consistency != null) row.push(num(Math.round(r.consistency), "%", "result.cons", "mid", "result.consTip"));
  if (r.seconds != null) row.push(num(Math.round(r.seconds), "s", "result.time", "mid"));
  if (r.chars) {
    const c = r.chars;
    const part = (n, key, cls, tip) =>
      `<span class="r-cc${cls}"${tip ? ` tabindex="0" data-tip-text="${t(tip)}"` : ""}><b>${n}</b> ${t(key)}</span>`;
    row.push(`<span class="r-num mid"><span class="r-lbl">${t("result.chars")}</span><span class="r-chars">` +
      `${part(c.correct, "result.correct", "")}${part(c.wrong, "result.wrong", c.wrong ? " bad" : "")}` +
      `${part(c.extra, "result.extra", c.extra ? " bad" : "", "result.extraTip")}${part(c.missed, "result.missed", "", "result.missedTip")}</span></span>`);
  }
  // at the row's right end: the test verdict. A new letter and the letters
  // mastered in this round are not repeated here (owner, 2026-10-18): the
  // letters row above the result shows them, the new one pops, the
  // mastered ones shine and get their tick, the next one has its frame.
  if (r.test) row.push(`<p class="r-main${r.test === "pass" ? " k-best" : ""}"><span>${t(`result.test.${r.test}`)}</span></p>`);

  const body = `<div class="r-top${graph ? "" : " solo"}">${hero}${graph}</div>` +
    (row.length ? `<div class="r-row">${row.join("")}</div>` : "") + list;
  // a test that did not pass: the button starts it again
  return open(body, r.test && r.test !== "pass" ? "result.tryAgain" : "result.nextBtn");
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

// The speed of each word in the order typed, as a small line chart (as on
// monkeytype, but per word instead of per second: the same numbers as the
// word tooltips, so the chart and the list below always agree). Each word
// is a dot in its speed colour; a word with a mistake gets a red cross above
// its dot. Two axes: wpm on the left, the words (1 to the last measured)
// along the bottom. The line is an SVG stretched to the width (its stroke keeps its
// thickness); the dots and crosses are HTML placed in percent, so they stay
// round at any width. Fewer than two measured words: no chart.
function speedChart(words, bands) {
  const pts = words.filter((w) => w.wpm != null);
  if (pts.length < 2) return "";
  const top = Math.max(20, Math.ceil(Math.max(...pts.map((w) => w.wpm)) / 20) * 20);   // a round number above the fastest word
  const x = (i) => (i / (pts.length - 1)) * 100;
  const y = (v) => 100 - (v / top) * 100;
  const line = pts.map((w, i) => `${x(i).toFixed(2)},${y(w.wpm).toFixed(2)}`).join(" ");
  const dots = pts.map((w, i) => {
    const text = w.letters.map((l) => l.c).join("");
    const pos = `left:${x(i).toFixed(2)}%;top:${y(w.wpm).toFixed(2)}%`;
    const bad = w.letters.some((l) => l.bad) ? `<i class="r-err" style="${pos}"></i>` : "";
    return `<i class="r-dot s${bands.level(w.wpm)}" style="${pos}" data-tip-text="${t("result.chartTip", { word: text, wpm: w.wpm })}"></i>` + bad;
  }).join("");
  return `<div class="r-chart" role="img" aria-label="${t("result.chartLabel")}">` +
    `<span class="r-axis" aria-hidden="true"><span>${top}</span><span>${top / 2}</span><span>0</span></span>` +
    `<div class="r-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">` +
    `<path class="r-grid" d="M0 0H100M0 50H100"/><path class="r-axisline" d="M0 0V100H100"/>` +
    `<polyline class="r-line" points="${line}"/></svg>${dots}` +
    `<span class="r-xaxis" aria-hidden="true"><span>1</span><span>${pts.length}</span></span></div></div>`;
}

// The button's icon: an arrow for the next round (new words), a circle
// arrow for "Try again" after a failed typing test.
const ICON_NEXT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;
const ICON_AGAIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>`;

// Puts the result into the window and waits until it is closed.
function open(body, btn) {
  box.innerHTML = `<div class="r-body">${body}</div>` +
    `<p class="r-foot"><button type="button" class="btn r-next">${btn === "result.tryAgain" ? ICON_AGAIN : ICON_NEXT}<span>${t(btn)}</span>${isTouch() ? "" : "<kbd>enter</kbd>"}</button></p>`;
  // phones have no hover: a tap on a word, a dot of the chart or the
  // characters shows its tooltip (and must not reach the text window, which would open the phone keyboard)
  box.querySelector(".r-body").addEventListener("click", (e) => {
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
  el.viewType.classList.remove("settled");   // a new result plays its entrance
  el.textBox.classList.add("resulting");
  // phone: the round is over, so its keyboard closes and the whole result
  // is in view (owner, 2026-10-16); "Next round" opens it again
  if (isTouch()) el.input.blur();
  return new Promise((resolve) => { done = resolve; });
}

// The typing screen goes out of sight (the stats): the result and the
// letters row keep their final look, so coming back does not play their
// entrance again (owner, 2026-10-18: the WPM counted up and the chart drew
// itself again). A browser restarts a CSS animation on an element that is
// shown again; .settled turns them off (style.css) until the next result.
export function settleResult() {
  if (done) el.viewType.classList.add("settled");
}

// Closes the result screen; the waiting showResult() resolves and the
// caller starts the next round.
export function closeResult() {
  if (!done) return;
  const resolve = done;
  done = null;
  box.hidden = true;
  el.viewType.classList.remove("settled");
  el.textBox.classList.remove("resulting");
  resolve();
}

// What one round changed: a new record and letters mastered in it.
// Display only.
export function compareStats(before, after) {
  const prev = Object.fromEntries((before?.keys ?? []).map((k) => [k.char, k]));
  const best = (before?.sessionCount ?? 0) > 0 &&
    (after.sessions[0]?.wpm ?? 0) > Math.max(0, ...before.sessions.map((x) => x.wpm));   // /stats: newest first
  const mastered = after.keys.filter((k) => k.mastered && !prev[k.char]?.mastered).map((k) => k.char);
  return { best, mastered };
}
