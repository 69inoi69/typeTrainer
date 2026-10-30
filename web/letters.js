// The letters row.

import { t } from "./i18n.js";
import { el, S } from "./state.js";
import { learning } from "./modes.js";
import { renderModeBar } from "./modebar.js";

let popLetter = null;
let justMastered = new Set();

export function markNewLetter(l) { popLetter = l; }
export function markMastered(list) { justMastered = new Set(list); }

let builtFor = "";
let chipOf = {};
export function renderLetters() {
  if (!learning()) {
    builtFor = "";
    renderFreeLetters();
    return;
  }
  if (!S.exercise) return;
  const info = {};
  for (const k of S.lastStats?.keys ?? []) info[k.char] = k;
  const focus = S.exercise.focus;

  const set = JSON.stringify([S.lang, S.exercise.unlocked, S.exercise.locked,
    S.exercise.unlocked.filter((c) => info[c]?.mastered), popLetter, [...justMastered]]);
  if (set !== builtFor) {
    builtFor = set;
    chipOf = {};
    const frag = document.createDocumentFragment();
    const add = (c, cls) => {
      const chip = document.createElement("span");
      chip.className = "chip " + cls;
      chip.textContent = c;
      if (!cls.includes("locked")) chip.appendChild(document.createElement("i")).className = "prog";
      if (c === popLetter) {
        chip.classList.add("pop");
        chip.appendChild(document.createElement("i")).className = "ring";
      }
      if (popLetter && c === S.exercise.locked[0]) chip.classList.add("arrive");
      if (justMastered.has(c)) {
        chip.classList.add("shine");
        chip.appendChild(document.createElement("i")).className = "fill";
      }
      chipOf[c] = chip;
      frag.appendChild(chip);
    };
    for (const c of S.exercise.unlocked) add(c, info[c]?.mastered ? "mastered" : "");
    for (const c of S.exercise.locked) add(c, c === S.exercise.locked[0] ? "locked next" : "locked");
    el.letters.replaceChildren(frag);

    const open = new Set([...S.exercise.unlocked, " "]);
    const known = new Set(S.exercise.unlocked.filter((c) => info[c]?.mastered));
    const altOf = Object.fromEntries(Object.entries(S.altBase).map(([a, b]) => [b, a]));
    for (const [c, key] of Object.entries(S.keyEls)) {
      key.classList.toggle("locked", !open.has(c) && !open.has(altOf[c]));
      key.classList.toggle("known", known.has(c) && (!altOf[c] || known.has(altOf[c])));
    }
    if (S.altgrEl) S.altgrEl.classList.toggle("locked", !S.exercise.unlocked.some((c) => S.altBase[c]));
  }
  const needs = [];
  for (const c of S.exercise.unlocked) {
    const k = info[c], chip = chipOf[c];
    if (!chip) continue;
    chip.style.setProperty("--p", k?.mastered ? 1 : letterProgress(k).toFixed(3));
    chip.classList.toggle("fresh", !k?.count);
    chip.dataset.tipText = letterTip(c, k);
    if (!k?.mastered) needs.push(c);
  }
  const next = chipOf[S.exercise.locked[0]];
  if (next) {
    const f = forecastText(S.lastStats?.forecast, false);
    next.dataset.tipText = (needs.length
      ? t("tip.nextNeeds", { l: S.exercise.locked[0], list: needs.join(" ") })
      : t("tip.next")) + (f ? " " + t("tip.nextIn", { when: f.value }) : "");
  }
  for (const c of S.exercise.unlocked) {
    chipOf[c]?.classList.toggle("focus", c === focus);
  }

  popLetter = null;
  justMastered = new Set();
}

function renderFreeLetters() {
  el.letters.replaceChildren();
  for (const key of Object.values(S.keyEls)) key.classList.remove("locked", "known");
  if (S.altgrEl) S.altgrEl.classList.remove("locked");
  if (S.mode === "climb") renderModeBar();
}

// ---------- one letter's progress ----------
export const rule = () => {
  const s = S.lastStats ?? {};
  return { min: s.masteryMin ?? 20, err: (s.masteryErr ?? 5) / 100, ms: 12000 / (s.targetWpm || 30) };
};
export function letterProgress(k) {
  if (!k?.count) return 0;
  const r = rule();
  const presses = Math.min(1, k.count / r.min);
  const clean = k.errorRate <= r.err ? 1 : r.err / k.errorRate;
  const fast = !k.avgMs ? 0 : k.avgMs <= r.ms ? 1 : r.ms / k.avgMs;
  return Math.min(presses, clean, fast);
}
export function letterNeeds(k) {
  if (k?.mastered) return [];
  if (!k?.count) return ["need.start"];
  const r = rule(), out = [];
  if (k.errorRate > r.err) out.push("need.cleaner");
  if (!k.avgMs || k.avgMs > r.ms) out.push("need.faster");
  if (k.count < r.min) out.push("need.more");
  return out;
}
function letterTip(c, k) {
  if (!k?.count) return `${c}: ${t("letter.noData")}.`;
  const parts = [t("heat.count", { n: k.count }), t("letter.err", { e: Math.round(k.errorRate * 100) })];
  if (k.avgMs) parts.push(t("letter.ms", { wpm: Math.round(12000 / k.avgMs) }));
  const needs = letterNeeds(k);
  return `${c}: ${parts.join(", ")}. ${k.mastered ? t("letter.mastered") : t("letter.needs", { list: needs.map((n) => t(n)).join(", ") })}.`;
}

// ---------- the forecast ----------
export function forecastText(f, allOpen) {
  if (!f?.known) return null;
  const label = t(allOpen ? "fc.lap" : "fc.next");
  const value = f.more ? t("fc.more", { n: f.rounds }) : t(f.rounds === 1 ? "fc.one" : "fc.rounds", { n: f.rounds });
  return { label, value, tip: t("fc.tip", { l: f.letter }) };
}
