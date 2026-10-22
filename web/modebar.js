// The round bar above the text: what a round of the current mode is, set
// right where you type (as monkeytype's bar; owner, 2026-10-19: the round
// settings belong to each mode's screen, not to the settings window).
//   learn    - 15 or 30 words: two choices, nothing to weigh up for a
//              beginner. They sit apart, at the right end of the line
//              above the text (#round-switch, next to the word counter they
//              change): above the letters they looked like an extra line
//              with no purpose (owner, 2026-10-22);
//   climb    - the level (1..10; a pick starts the count on it from none),
//              then words or time, and how many;
//   freetype - the kind of text (long words, real sentences or your own
//              text; one at a time, or none: plain words), the word list
//              (the 200 to 25 000 most common words; not with sentences
//              or your own text), then words or time, and how many.
// Each mode remembers its own length (settings.js lengthFor). A click
// starts a new round (input.js onBarPick); while you type the bar steps
// back (typing.css).
// Layer: middle. Imports the bottom layer, settings.js and customtext.js.
// Called by: modes.js (renderModeBar on a mode change), input.js
// (onBarPick, renderModeBar after a pick).
// To add a choice: its buttons in renderModeBar, what a click on it means
// in onBarPick's handler (input.js), its texts in i18n.js.

import { t } from "./i18n.js";
import { $, S, listLabel, levelWords, listless } from "./state.js";
import { LENGTHS, LEARN_LENGTHS, lengthOf, lengthLabel } from "./settings.js";
import { hasCustomText } from "./customtext.js";

const bar = $("mode-bar"), learnBar = $("round-switch");

// one button; "on" is the chosen one
const btn = (data, label, on, tip = "") =>
  `<button type="button" ${data} aria-pressed="${on}"${tip ? ` data-tip-text="${tip}"` : ""}>${label}</button>`;
const group = (label, buttons) => `<span class="mb-group" role="group" aria-label="${label}">${buttons.join("")}</span>`;

// Draws the bar of the current mode. Cheap (a few buttons) and runs only
// on a mode, list or length change, never while typing.
export function renderModeBar() {
  const cur = S.settings.length;
  const parts = [];
  const learn = S.mode === "learn";
  bar.hidden = learn;
  learnBar.hidden = !learn;
  if (learn) {
    bar.innerHTML = "";
    learnBar.innerHTML = group(t("bar.round"), LEARN_LENGTHS.map((id) =>
      btn(`data-length="${id}"`, lengthLabel(id), id === cur)));
    return;
  }
  learnBar.innerHTML = "";
  if (S.mode === "climb" && S.climb?.levels) {
    const at = S.climbLevel ?? S.climb.place?.level;
    // a visible name: "1 2 ... 10" next to the lengths "10 20 30" would read as one more length
    parts.push(group(t("climb.level"), [`<span class="mb-lbl" aria-hidden="true">${t("climb.level")}</span>`,
      ...S.climb.levels.map((_, i) => btn(`data-level="${i + 1}"`, String(i + 1), i + 1 === at, t("climb.levelTip", { words: levelWords(i + 1) })))]));
  }
  if (S.mode === "freetype") {
    // switches: a click turns a kind on (and the others off), or off again
    const v = S.freetypeVariant;
    const kinds = ["long", ...(S.freetype?.sentences ? ["sentences"] : []), "custom"].map((k) =>
      btn(`data-toggle="${k}"`, t(`ft.${k}`), v === k, t(`ft.${k}Tip`)));
    if (v === "custom" && hasCustomText()) kinds.push(btn(`data-edit="1"`, t("ft.edit"), false, t("ft.editTip")));
    parts.push(group(t("ft.kind"), kinds));
    if (!listless(v)) parts.push(group(t("freetype.list"), (S.freetype?.lists ?? []).map((n) =>
      btn(`data-list="${n}"`, listLabel(n), n === S.freetypeList, t("freetype.listN", { n })))));
  }
  const kind = lengthOf(cur).kind;
  // words or time: a click on the other kind picks its 30
  parts.push(group(t("bar.kind"), ["words", "time"].map((k) =>
    btn(`data-length="${k}-30"`, t(k === "words" ? "settings.words" : "settings.time"), k === kind))));
  parts.push(group(t("bar.length"), LENGTHS.filter((id) => lengthOf(id).kind === kind).map((id) =>
    btn(`data-length="${id}"`, String(lengthOf(id).n), id === cur, lengthLabel(id)))));
  bar.innerHTML = parts.join("");
}

// A pick: {list: n}, {level: n}, {length: id}, {toggle: kind} (Freetype's
// kinds of text, on or off) or {edit: true} (your own text). input.js does the rest.
let pickListener = () => {};
export function onBarPick(fn) { pickListener = fn; }
const onClick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  b.blur();
  if (b.dataset.toggle) return pickListener({ toggle: b.dataset.toggle });
  if (b.dataset.edit) return pickListener({ edit: true });
  if (b.getAttribute("aria-pressed") === "true") return;    // already chosen
  if (b.dataset.list) pickListener({ list: Number(b.dataset.list) });
  else if (b.dataset.level) pickListener({ level: Number(b.dataset.level) });
  else if (b.dataset.length) pickListener({ length: b.dataset.length });
};
bar.addEventListener("click", onClick);
learnBar.addEventListener("click", onClick);
