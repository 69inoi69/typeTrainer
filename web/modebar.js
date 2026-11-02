// The round bar above the text.

import { t } from "./i18n.js";
import { $, S, listLabel, levelWords, listless, store } from "./state.js";
import { LENGTHS, lengthOf, lengthLabel } from "./settings.js";
import { hasCustomText } from "./customtext.js";
import { ring, ringBtn } from "./minipop.js";

const bar = $("mode-bar"), note = $("climb-note"), stand = $("stand");

export function renderModeBar() {
  const cur = S.settings.length;
  const parts = [];
  note.hidden = true;
  bar.hidden = S.mode === "learn";
  stand.innerHTML = S.mode === "climb" ? climbStand() : S.mode === "freetype" ? freetypeStand() : "";
  if (bar.hidden) {
    bar.innerHTML = "";
    return;
  }
  if (S.mode === "climb" && S.climb?.levels) parts.push(climbStatus(), climbLevels());
  if (S.mode === "freetype") {
    const v = S.freetypeVariant;
    const kinds = ["", "long", ...(S.freetype?.sentences ? ["sentences"] : []), "custom"].map((k) =>
      ringBtn(`data-variant="${k}"`, t(k ? `ft.${k}` : "ft.words"), v === k, k ? t(`ft.${k}Tip`) : ""));
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
  bar.innerHTML = `<span class="bar-side">${parts.join("")}</span><span class="bar-side">${end.join("")}</span>`;
}

// ---------- Climb: the levels, and where you stand ----------
const kLabel = (n) => n >= 1000 ? `${Math.round(n / 500) / 2}k` : String(n);
function climbLevels() {
  const c = S.climb, at = S.climbLevel ?? c.place?.level;
  return ring(t("climb.level"), c.levels.map((n, i) =>
    ringBtn(`data-level="${i + 1}" aria-label="${t("climb.level")} ${i + 1}"`, kLabel(n), i + 1 === at, t("climb.levelTip", { words: levelWords(i + 1) }))));
}
function climbStand() {
  const c = S.climb;
  if (!c?.levels) return "";
  const at = S.climbLevel ?? c.place?.level, reached = c.place?.level ?? 0;
  const steps = c.levels.map((n, i) => {
    const l = i + 1, cls = l === at ? " on" : l <= reached ? " past" : "";
    return `<span class="step${cls}" style="--i:${i}"><i></i><span>${kLabel(n)}</span></span>`;
  }).join("");
  const weak = c.weak?.length ? `<p class="stand-fact" tabindex="0" data-tip-text="${t("climb.weakTip")}"><small>${t("climb.weak")}</small><b>${c.weak.map((w) => w.pair).join(" ")}</b></p>` : "";
  return `<div class="steps">${steps}</div>${weak}`;
}

// ---------- Freetype: the best and the last rounds of this list and length ----------
const LAST_ROUNDS = 20;
function freetypeStand() {
  const f = S.freetype;
  if (!f) return "";
  const rounds = (f.sessions ?? []).slice(0, LAST_ROUNDS).reverse();
  if (!rounds.length) return `<p class="stand-none">${t("below.none")}</p>`;
  const best = f.bests?.[S.settings.length]?.wpm ?? Math.max(...rounds.map((r) => r.wpm));
  const top = Math.max(best, ...rounds.map((r) => r.wpm));
  const bars = rounds.map((r) => `<i style="height:${Math.max(4, r.wpm / top * 100).toFixed(1)}%" data-tip-text="${t("result.wordWpm", { wpm: Math.round(r.wpm) })}"></i>`).join("");
  return `<p class="stand-fact"><small>${t("below.best")}</small><b>${Math.round(best)}</b></p>` +
    `<div class="stand-chart" role="img" aria-label="${t("below.last", { n: rounds.length })}">${bars}</div>`;
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
  note.hidden = !!store.get(SEEN);
  note.textContent = `${words}. ${rule}`;
  return `<span class="climb-status" tabindex="0" data-tip-text="${tip}">` +
    `<span>${t("climb.level")} <b>${level}</b></span>${pips}</span>`;
}

export function climbAnswer() {
  store.set(SEEN, "1");
  renderModeBar();
}

let pickListener = () => {};
export function onBarPick(fn) { pickListener = fn; }
const onClick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  b.blur();
  if (b.dataset.edit) return pickListener({ edit: true });
  if (b.getAttribute("aria-pressed") === "true") return;
  if (b.dataset.variant !== undefined) pickListener({ variant: b.dataset.variant });
  else if (b.dataset.list) pickListener({ list: Number(b.dataset.list) });
  else if (b.dataset.level) pickListener({ level: Number(b.dataset.level) });
  else if (b.dataset.length) pickListener({ length: b.dataset.length });
};
bar.addEventListener("click", onClick);
