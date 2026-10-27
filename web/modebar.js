// The round bar above the text.

import { t } from "./i18n.js";
import { $, S, listLabel, levelWords, listless } from "./state.js";
import { LENGTHS, LEARN_LENGTHS, lengthOf, lengthLabel, setSetting } from "./settings.js";
import { hasCustomText } from "./customtext.js";
import { ring, ringBtn } from "./minipop.js";

const bar = $("mode-bar"), learnBar = $("round-switch");

export function renderModeBar() {
  const cur = S.settings.length;
  const parts = [];
  const learn = S.mode === "learn";
  bar.hidden = learn;
  learnBar.hidden = !learn;
  if (learn) {
    bar.innerHTML = "";
    learnBar.innerHTML = ring(t("bar.round"), LEARN_LENGTHS.map((id) =>
      ringBtn(`data-length="${id}"`, lengthLabel(id), id === cur)));
    return;
  }
  learnBar.innerHTML = "";
  if (S.mode === "climb" && S.climb?.levels) {
    const at = S.climbLevel ?? S.climb.place?.level;
    parts.push(ring(t("climb.level"), [`<span class="ring-lbl" aria-hidden="true">${t("climb.level")}</span>`,
      ...S.climb.levels.map((_, i) => ringBtn(`data-level="${i + 1}"`, String(i + 1), i + 1 === at, t("climb.levelTip", { words: levelWords(i + 1) })))]));
  }
  if (S.mode === "freetype") {
    const v = S.freetypeVariant;
    const kinds = ["long", ...(S.freetype?.sentences ? ["sentences"] : []), "custom"].map((k) =>
      ringBtn(`data-toggle="${k}"`, t(`ft.${k}`), v === k, t(`ft.${k}Tip`)));
    if (v === "custom" && hasCustomText()) kinds.push(ringBtn(`data-edit="1"`, t("ft.edit"), false, t("ft.editTip")));
    parts.push(ring(t("ft.kind"), kinds));
    if (!listless(v)) parts.push(ring(t("freetype.list"), (S.freetype?.lists ?? []).map((n) =>
      ringBtn(`data-list="${n}"`, listLabel(n), n === S.freetypeList, t("freetype.listN", { n })))));
  }
  const kind = lengthOf(cur).kind;
  const end = [];
  end.push(ring(t("bar.kind"), ["words", "time"].map((k) =>
    ringBtn(`data-length="${k}-30"`, t(k === "words" ? "settings.words" : "settings.time"), k === kind))));
  end.push(ring(t("bar.length"), LENGTHS.filter((id) => lengthOf(id).kind === kind).map((id) =>
    ringBtn(`data-length="${id}"`, String(lengthOf(id).n), id === cur, lengthLabel(id)))));
  if (S.mode === "freetype") end.push(ring(t("settings.streak"), [ringBtn(`data-streak="1"`, t("settings.streak"), S.settings.streak, t("settings.streakDesc"))]));
  bar.innerHTML = `<span class="bar-side">${parts.join("")}</span><span class="bar-side">${end.join("")}</span>`;
}

let pickListener = () => {};
export function onBarPick(fn) { pickListener = fn; }
const onClick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  b.blur();
  if (b.dataset.toggle) return pickListener({ toggle: b.dataset.toggle });
  if (b.dataset.edit) return pickListener({ edit: true });
  if (b.dataset.streak) { setSetting("streak", S.settings.streak ? "" : "1"); return renderModeBar(); }
  if (b.getAttribute("aria-pressed") === "true") return;
  if (b.dataset.list) pickListener({ list: Number(b.dataset.list) });
  else if (b.dataset.level) pickListener({ level: Number(b.dataset.level) });
  else if (b.dataset.length) pickListener({ length: b.dataset.length });
};
bar.addEventListener("click", onClick);
learnBar.addEventListener("click", onClick);
