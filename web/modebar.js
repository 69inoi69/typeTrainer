// The round bar above the text.

import { t } from "./i18n.js";
import { $, S, listLabel, levelWords, listless } from "./state.js";
import { LENGTHS, LEARN_LENGTHS, lengthOf, lengthLabel } from "./settings.js";
import { hasCustomText } from "./customtext.js";

const bar = $("mode-bar"), learnBar = $("round-switch");

const btn = (data, label, on, tip = "") =>
  `<button type="button" ${data} aria-pressed="${on}"${tip ? ` data-tip-text="${tip}"` : ""}>${label}</button>`;
const group = (label, buttons) => `<span class="mb-group" role="group" aria-label="${label}">${buttons.join("")}</span>`;

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
    parts.push(group(t("climb.level"), [`<span class="mb-lbl" aria-hidden="true">${t("climb.level")}</span>`,
      ...S.climb.levels.map((_, i) => btn(`data-level="${i + 1}"`, String(i + 1), i + 1 === at, t("climb.levelTip", { words: levelWords(i + 1) })))]));
  }
  if (S.mode === "freetype") {
    const v = S.freetypeVariant;
    const kinds = ["long", ...(S.freetype?.sentences ? ["sentences"] : []), "custom"].map((k) =>
      btn(`data-toggle="${k}"`, t(`ft.${k}`), v === k, t(`ft.${k}Tip`)));
    if (v === "custom" && hasCustomText()) kinds.push(btn(`data-edit="1"`, t("ft.edit"), false, t("ft.editTip")));
    parts.push(group(t("ft.kind"), kinds));
    if (!listless(v)) parts.push(group(t("freetype.list"), (S.freetype?.lists ?? []).map((n) =>
      btn(`data-list="${n}"`, listLabel(n), n === S.freetypeList, t("freetype.listN", { n })))));
  }
  const kind = lengthOf(cur).kind;
  parts.push(group(t("bar.kind"), ["words", "time"].map((k) =>
    btn(`data-length="${k}-30"`, t(k === "words" ? "settings.words" : "settings.time"), k === kind))));
  parts.push(group(t("bar.length"), LENGTHS.filter((id) => lengthOf(id).kind === kind).map((id) =>
    btn(`data-length="${id}"`, String(lengthOf(id).n), id === cur, lengthLabel(id)))));
  bar.innerHTML = parts.join("");
}

let pickListener = () => {};
export function onBarPick(fn) { pickListener = fn; }
const onClick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  b.blur();
  if (b.dataset.toggle) return pickListener({ toggle: b.dataset.toggle });
  if (b.dataset.edit) return pickListener({ edit: true });
  if (b.getAttribute("aria-pressed") === "true") return;
  if (b.dataset.list) pickListener({ list: Number(b.dataset.list) });
  else if (b.dataset.level) pickListener({ level: Number(b.dataset.level) });
  else if (b.dataset.length) pickListener({ length: b.dataset.length });
};
bar.addEventListener("click", onClick);
learnBar.addEventListener("click", onClick);
