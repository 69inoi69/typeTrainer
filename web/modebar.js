// The round bar above the text: what a round of the current mode is, set
// right where you type (as monkeytype's bar; owner, 2026-10-19: the round
// settings belong to each mode's screen, not to the settings window).
//   learn    - short (15 words) or normal (30): two choices, nothing to
//              weigh up for a beginner;
//   climb    - the level (1..10; a pick starts the count on it from none),
//              then words or time, and how many;
//   freetype - the word list (the 200 to 25 000 most common words), then
//              words or time, and how many.
// Each mode remembers its own length (settings.js lengthFor). A click
// starts a new round (input.js onBarPick); while you type the bar steps
// back (style.css).
// Layer: middle. Imports the bottom layer and settings.js.
// Called by: modes.js (renderModeBar on a mode change), input.js
// (onBarPick, renderModeBar after a pick).
// To add a choice: its buttons in renderModeBar, what a click on it means
// in onBarPick's handler (input.js), its texts in i18n.js.

import { t } from "./i18n.js";
import { $, S, listLabel, levelWords } from "./state.js";
import { LENGTHS, LEARN_LENGTHS, lengthOf, lengthLabel } from "./settings.js";

const bar = $("mode-bar");

// one button; "on" is the chosen one
const btn = (data, label, on, tip = "") =>
  `<button type="button" ${data} aria-pressed="${on}"${tip ? ` data-tip-text="${tip}"` : ""}>${label}</button>`;
const group = (label, buttons) => `<span class="mb-group" role="group" aria-label="${label}">${buttons.join("")}</span>`;

// Draws the bar of the current mode. Cheap (a few buttons) and runs only
// on a mode, list or length change, never while typing.
export function renderModeBar() {
  const cur = S.settings.length;
  const parts = [];
  if (S.mode === "learn") {
    parts.push(group(t("bar.round"), LEARN_LENGTHS.map((id) =>
      btn(`data-length="${id}"`, t(id === LEARN_LENGTHS[0] ? "bar.short" : "bar.normal"), id === cur, lengthLabel(id)))));
  } else {
    if (S.mode === "climb" && S.climb?.levels) {
      const at = S.climbLevel ?? S.climb.place?.level;
      // a visible name: "1 2 ... 10" next to the lengths "10 20 30" would read as one more length
      parts.push(group(t("climb.level"), [`<span class="mb-lbl" aria-hidden="true">${t("climb.level")}</span>`,
        ...S.climb.levels.map((_, i) => btn(`data-level="${i + 1}"`, String(i + 1), i + 1 === at, t("climb.levelTip", { words: levelWords(i + 1) })))]));
    }
    if (S.mode === "freetype") {
      parts.push(group(t("freetype.list"), (S.freetype?.lists ?? []).map((n) =>
        btn(`data-list="${n}"`, listLabel(n), n === S.freetypeList, t("freetype.listN", { n })))));
    }
    const kind = lengthOf(cur).kind;
    // words or time: a click on the other kind picks its 30
    parts.push(group(t("bar.kind"), ["words", "time"].map((k) =>
      btn(`data-length="${k}-30"`, t(k === "words" ? "settings.words" : "settings.time"), k === kind))));
    parts.push(group(t("bar.length"), LENGTHS.filter((id) => lengthOf(id).kind === kind).map((id) =>
      btn(`data-length="${id}"`, String(lengthOf(id).n), id === cur, lengthLabel(id)))));
  }
  bar.innerHTML = parts.join("");
}

// A pick: {list: n}, {level: n} or {length: id}. input.js does the rest.
let pickListener = () => {};
export function onBarPick(fn) { pickListener = fn; }
bar.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  b.blur();
  if (b.getAttribute("aria-pressed") === "true") return;    // already chosen
  if (b.dataset.list) pickListener({ list: Number(b.dataset.list) });
  else if (b.dataset.level) pickListener({ level: Number(b.dataset.level) });
  else if (b.dataset.length) pickListener({ length: b.dataset.length });
});
