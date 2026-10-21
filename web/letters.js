// The letters bar above the text: learning's progress, made plain for a
// beginner (owner, 2026-10-19: no stats in learning, but the user must see
// what is mastered, what still needs work, and why). One chip per letter
// of the language: open (its colour goes from red to green as it gets
// closer to mastered, as on keybr; owner, 2026-10-20), mastered (green,
// with a tick), the focus of the portion being typed (gold), still locked
// (crossed out);
// each chip's tooltip says its numbers and what it still needs. On the
// keyboard, the keys of locked letters are dimmed and the letters you have
// mastered fade from their keys: the fingers know them, the eyes need not
// look (touch typing is not looking down). The status line before the
// first key says how many letters are open.
// In Climb and Freetype there are no letters to learn: the bar is hidden
// and every key is open; in Climb the status line shows the level, how far
// the typist is on it, and which words it draws. (Freetype's word lists are in the round bar, modebar.js.)
// Layer: middle. Imports the bottom layer and modes.js.
// Called by: typing.js (renderLetters when a portion or round changes the
// letters, or Climb's level; markNewLetter / markMastered just before),
// learnpanel.js (letterProgress, rule: the gold letter's line).

import { t } from "./i18n.js";
import { el, S, levelWords } from "./state.js";
import { learning } from "./modes.js";

// One-time animations for the next render (set by typing.js)
let popLetter = null;         // letter that was just unlocked: its chip pops
let justMastered = new Set(); // letters just mastered: their chips shine

// A letter just opened: its chip pops at the next render.
export function markNewLetter(l) { popLetter = l; }
// Letters mastered in the round that just ended: their chips shine once.
export function markMastered(list) { justMastered = new Set(list); }

const STAT_ICONS = {
  open: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  // Climb's level: a mountain with a flag on top
  level: '<path d="M3 19l6.5-10 4 6 2.5-3.5L21 19z"/><path d="M9.5 9V4l3.5 1.4-3.5 1.4"/>',
};
// Draws the bar, the status line and the dimmed keys from S.exercise (the
// portion being typed) and S.lastStats. Runs on a portion change, never per
// key. The chips are built again only when the set of letters changes (a
// letter opened or mastered); a new focus only moves one class, and the
// status line is rewritten only when what it says changes: rebuilding the
// 26 chips on every portion cost a layout of the whole bar while typing.
let builtFor = "", captionFor = "";
let chipOf = {};              // letter -> its chip, from the last build
export function renderLetters() {
  if (!learning()) {
    builtFor = captionFor = "";
    renderFreeLetters();
    return;
  }
  if (!S.exercise) return;
  const info = {};
  for (const k of S.lastStats?.keys ?? []) info[k.char] = k;
  // The focus is shown as soon as the portion has one, data or not: it
  // used to wait for data about the letter, so a letter just opened (the
  // next focus, with no presses yet) lit up, went out and came back only
  // after the next portion was sent (owner, 2026-10-18: "it shows late").
  const focus = S.exercise.focus;
  const started = (S.lastStats?.keys ?? []).some((k) => k.count > 0);   // anything typed yet

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
      if (c === popLetter) chip.classList.add("pop");
      if (justMastered.has(c)) chip.classList.add("shine");
      chipOf[c] = chip;
      frag.appendChild(chip);
    };
    for (const c of S.exercise.unlocked) add(c, info[c]?.mastered ? "mastered" : "");
    // the letter that opens next: marked in the row itself (owner,
    // 2026-10-18: no "next letter" line under it)
    for (const c of S.exercise.locked) add(c, c === S.exercise.locked[0] ? "locked next" : "locked");
    el.letters.replaceChildren(frag);

    // every key you do not need yet is dimmed on the keyboard, and the
    // letter of a key you have mastered fades from it
    const open = new Set([...S.exercise.unlocked, " "]);
    const known = new Set(S.exercise.unlocked.filter((c) => info[c]?.mastered));
    const altOf = Object.fromEntries(Object.entries(S.altBase).map(([a, b]) => [b, a]));
    for (const [c, key] of Object.entries(S.keyEls)) {
      key.classList.toggle("locked", !open.has(c) && !open.has(altOf[c]));
      key.classList.toggle("known", known.has(c) && (!altOf[c] || known.has(altOf[c])));
    }
    if (S.altgrEl) S.altgrEl.classList.toggle("locked", !S.exercise.unlocked.some((c) => S.altBase[c]));
  }
  // how close every open letter is, and what it needs (the tooltip): read
  // from the newest numbers on every portion, no rebuild
  const needs = [];
  for (const c of S.exercise.unlocked) {
    const k = info[c], chip = chipOf[c];
    if (!chip) continue;
    chip.style.setProperty("--p", k?.mastered ? 1 : letterProgress(k).toFixed(3));
    chip.classList.toggle("fresh", !k?.count);   // not typed yet: no colour, nothing is known
    chip.dataset.tipText = letterTip(c, k);
    if (!k?.mastered) needs.push(c);
  }
  const next = chipOf[S.exercise.locked[0]];
  if (next) {
    next.dataset.tipText = needs.length
      ? t("tip.nextNeeds", { l: S.exercise.locked[0], list: needs.join(" ") })
      : t("tip.next");
  }
  // the focus letter (gold): one class, moved
  for (const c of S.exercise.unlocked) {
    chipOf[c]?.classList.toggle("focus", c === focus);
  }

  // status line: only before anything is typed, how many letters are open
  // and how to begin. No "focus" and no "next letter" once you type (owner,
  // 2026-10-18): the row above shows both, the focus in gold (and in the
  // text), the next letter marked; and no "mastered": its ticks.
  const openCount = S.exercise.unlocked.length;
  const all = openCount + S.exercise.locked.length;
  const caption = JSON.stringify([S.lang, t("stat.open"), started, openCount, all]);
  if (caption !== captionFor) {
    captionFor = caption;
    const parts = [];
    if (!started) {
      parts.push(pill("open", "", "tip.open", t("stat.open"), `<b>${openCount}/${all}</b>`));
      parts.push(`<span class="begin">${t("stat.begin")}</span>`);
    }
    el.lettersCaption.innerHTML = parts.join("");
  }
  popLetter = null;
  justMastered = new Set();
}

// One item of the status line: an icon, a fixed label and the value that
// changes.
const pill = (icon, cls, tip, label, value) =>
  `<span class="stat ${cls}"${tip ? ` data-tip="${tip}"` : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${STAT_ICONS[icon]}</svg>` +
  `<span class="lbl">${label}</span>${value}</span>`;

// Climb and Freetype: no letters to learn, every key is open. In Climb the
// status line shows the level of the round with one dot per pass it needs
// (filled: passed already), so the typist knows while typing what the
// round is worth; before the first key also the words it draws or, after
// a round under FailAccuracy, what one more would do. The rule comes with
// /freeplay/stats (freeplay.Standing).
function renderFreeLetters() {
  el.letters.replaceChildren();
  for (const key of Object.values(S.keyEls)) key.classList.remove("locked", "known");
  if (S.altgrEl) S.altgrEl.classList.remove("locked");
  if (S.mode !== "climb" || S.climbLevel == null || !S.climb?.place) { el.lettersCaption.innerHTML = ""; return; }
  const c = S.climb, level = S.climbLevel, top = c.levels.length;
  // the counts belong to the level the user stands on; a level picked by
  // hand starts from none
  const own = level === c.place.level;
  const passes = own ? c.place.passes : 0, fails = own ? c.place.fails : 0;
  const pips = `<span class="pips" aria-hidden="true">${Array.from({ length: c.passesUp }, (_, i) => `<i${i < passes ? ' class="on"' : ""}></i>`).join("")}</span>`;
  const rule = t(level < top ? "climb.ruleTip" : "climb.ruleTipTop", { up: c.passesUp, pass: c.passAccuracy, fail: c.failAccuracy, next: level + 1 });
  // after a round under the fail line the warning takes the place of the
  // words (both do not fit; the level's button in the round bar names them)
  const slip = fails > 0 && level > 1;
  const note = slip ? t("climb.slip", { fail: c.failAccuracy, prev: level - 1 }) : t("climb.words", { n: levelWords(level) });
  el.lettersCaption.innerHTML =
    `<span class="stat focus" data-tip-text="${rule}"><svg viewBox="0 0 24 24" aria-hidden="true">${STAT_ICONS.level}</svg>` +
    `<span class="lbl">${t("climb.level")}</span><b>${level}</b>${pips}</span>` +
    `<span class="begin mode-note${slip ? " slip" : ""}">${note}</span>`;
}

// ---------- one letter's progress ----------
// The mastery rule (engine.MeetsGoal) has three parts: enough presses, few
// mistakes, enough speed. A letter is as far as its weakest part: the bar
// on its chip is the smallest of the three shares, so it fills up only when
// all three are there. The numbers of the rule come with /stats.
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
// What an open letter still needs, as keys of i18n.js ("need.*"): more
// presses, fewer mistakes, more speed; none once it is mastered.
export function letterNeeds(k) {
  if (k?.mastered) return [];
  if (!k?.count) return ["need.start"];
  const r = rule(), out = [];
  if (k.errorRate > r.err) out.push("need.cleaner");
  if (!k.avgMs || k.avgMs > r.ms) out.push("need.faster");
  if (k.count < r.min) out.push("need.more");
  return out;
}
// The tooltip of a chip: "s · 18 presses · 8% mistakes · 450 ms · needs: fewer mistakes, faster"
function letterTip(c, k) {
  if (!k?.count) return `${c} · ${t("letter.noData")}`;
  const parts = [c, t("heat.count", { n: k.count }), t("letter.err", { e: Math.round(k.errorRate * 100) })];
  if (k.avgMs) parts.push(t("letter.ms", { ms: Math.round(k.avgMs) }));
  const needs = letterNeeds(k);
  parts.push(k.mastered ? t("letter.mastered") : t("letter.needs", { list: needs.map((n) => t(n)).join(", ") }));
  return parts.join(" · ");
}

// ---------- the forecast ----------
// /stats forecast (history.NextForecast) in words: about how many rounds
// until the next letter opens or, with every letter open, until the lap is
// done. { label, value, tip }, or null when there is no honest answer
// (too few rounds of a letter, or one not getting better: then nothing is
// shown rather than a guess; the letter line says what the letter needs)
// or no letter waiting. Used by the Learn panel and the stats screen.
export function forecastText(f, allOpen) {
  if (!f?.known) return null;
  const label = t(allOpen ? "fc.lap" : "fc.next");
  const value = f.more ? t("fc.more", { n: f.rounds }) : t(f.rounds === 1 ? "fc.one" : "fc.rounds", { n: f.rounds });
  return { label, value, tip: t("fc.tip", { l: f.letter }) };
}
