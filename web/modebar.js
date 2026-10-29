// The round bar above the text.

import { t } from "./i18n.js";
import { $, S, listLabel, levelWords, listless, store } from "./state.js";
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
      ringBtn(`data-length="${id}" aria-label="${lengthLabel(id)}"`, lengthLabel(id).replace(/^(\d+)(.*)$/, `$1<span class="rs-u">$2</span>`), id === cur)));
    return;
  }
  learnBar.innerHTML = "";
  let steps = "";
  if (S.mode === "climb" && S.climb?.levels) {
    steps = climbSteps();
    parts.push(climbStatus());
  }
  if (S.mode === "freetype") {
    const v = S.freetypeVariant;
    const kinds = ["long", ...(S.freetype?.sentences ? ["sentences"] : []), "custom"].map((k) =>
      ringBtn(`data-toggle="${k}"`, t(`ft.${k}`), v === k, t(`ft.${k}Tip`)));
    if (v === "custom" && hasCustomText()) kinds.push(ringBtn(`data-edit="1"`, t("ft.edit"), false));
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
  bar.innerHTML = steps + `<span class="bar-side">${parts.join("")}</span><span class="bar-side">${end.join("")}</span>`;
}

// ---------- Climb: the levels as steps, and where you stand ----------
const kLabel = (n) => n >= 1000 ? `${Math.round(n / 500) / 2}k` : String(n);
function climbSteps() {
  const c = S.climb, at = S.climbLevel ?? c.place?.level, reached = c.place?.level ?? 0;
  return `<div class="steps" role="group" aria-label="${t("climb.level")}">` + c.levels.map((n, i) => {
    const l = i + 1, cls = l === at ? " on" : l <= reached ? " past" : "";
    return `<button type="button" class="step${cls}" data-level="${l}" aria-pressed="${l === at}" style="--i:${i}" ` +
      `aria-label="${t("climb.level")} ${l}" data-tip-text="${t("climb.levelTip", { words: levelWords(l) })}"><i></i>${kLabel(n)}</button>`;
  }).join("") + `</div>`;
}
const SEEN = "tt.climbSeen";
function climbStatus() {
  const c = S.climb, level = S.climbLevel ?? c.place?.level, top = c.levels.length;
  if (!c.place || level == null) return "";
  const own = level === c.place.level;
  const passes = own ? c.place.passes : 0, fails = own ? c.place.fails : 0;
  const slip = fails > 0 && level > 1;
  const pips = `<span class="pips" aria-hidden="true">${Array.from({ length: c.passesUp }, (_, i) => `<i${i < passes ? ' class="on"' : ""}></i>`).join("")}` +
    (slip ? `<i class="slip"></i>` : "") + `</span>`;
  const words = t("climb.levelTip", { words: levelWords(level) });
  const rule = level < top ? t("climb.words", { up: c.passesUp, pass: c.passAccuracy }) : t("climb.top");
  const tip = [words + ".", rule, slip ? t("climb.slip", { fail: c.failAccuracy, prev: level - 1 }) : t("climb.ruleTip", { fail: c.failAccuracy })].join(" ");
  const intro = store.get(SEEN) ? "" : `<span class="climb-words">${words}</span><span class="climb-note">${rule}</span>`;
  return `<span class="climb-status" tabindex="0" data-tip-text="${tip}">` +
    `<span>${t("climb.level")} <b>${level}</b></span>${pips}${intro}</span>`;
}

// ---------- Climb: the bar answers a round with motion ----------
export function climbAnswer(verdict, place) {
  store.set(SEEN, "1");
  renderModeBar();
  const at = (sel) => bar.querySelector(sel);
  let node, cls;
  if (place.moved > 0) [node, cls] = [at(".step.on"), "up"];
  else if (place.moved < 0) [node, cls] = [at(".step.on"), "down"];
  else if (verdict === "pass") [node, cls] = [at(`.pips > i:nth-child(${place.passes})`), "pop"];
  else if (verdict === "hold") [node, cls] = [at(".pips"), "nope"];
  else [node, cls] = [at(".pips > i.slip") ?? at(".pips"), at(".pips > i.slip") ? "pop" : "nope"];
  if (node) node.classList.add(cls);
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
