// The letters bar above the text: learning's progress, made plain for a
// beginner (owner, 2026-10-19: no stats in learning, but the user must see
// what is mastered, what still needs work, and why). One chip per letter
// of the language: open (with a thin bar of how close it is to mastered),
// mastered (a tick), the focus of the portion being typed, still locked;
// each chip's tooltip says its numbers and what it still needs. On the
// keyboard, the keys of locked letters are dimmed and the letters you have
// mastered fade from their keys: the fingers know them, the eyes need not
// look (touch typing is not looking down). The status line before the
// first key says how many letters are open.
// In Climb there are no letters to learn: the bar is empty, every key is
// open, and the status line shows the level and what it brings. In
// Freetype the bar holds its word lists instead (200 to 25k most common
// words; a click picks one, input.js onListPick).
// Layer: middle. Imports the bottom layer and modes.js.
// Called by: typing.js (renderLetters when a portion or round changes the
// letters, or Climb's level; markNewLetter / markMastered just before),
// result.js (letterNeeds, for the letters of a learning round), input.js
// (onListPick).

import { t } from "./i18n.js";
import { el, S, levelNumber, listLabel } from "./state.js";
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
  // focus: a crosshair, the trainer has "locked on" this letter
  focus: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  // Climb's level: a mountain with a flag on top
  level: '<path d="M3 19l6.5-10 4 6 2.5-3.5L21 19z"/><path d="M9.5 9V4l3.5 1.4-3.5 1.4"/>',
  // next: a key, the one that opens the next letter
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2.5"/>',
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
    if (S.mode === "climb") { listsFor = ""; renderFreeLetters(); } else renderLists();
    return;
  }
  listsFor = "";                // the row holds letters now, not lists
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

// Climb: no letters to learn, every key is open. The status line shows
// the level of the round and what it brings (the layers of
// freeplay.Portion; their levels come with /freeplay/stats).
function renderFreeLetters() {
  el.letters.replaceChildren();
  for (const key of Object.values(S.keyEls)) key.classList.remove("locked", "known");
  if (S.altgrEl) S.altgrEl.classList.remove("locked");
  if (S.climbLevel == null) { el.lettersCaption.innerHTML = ""; return; }
  const level = S.climbLevel;
  const brings = [t(level < 0.25 ? "climb.common" : level < 0.6 ? "climb.wider" : "climb.rare"),
    ...[[S.climb?.capsFrom, "climb.caps"], [S.climb?.punctFrom, "climb.punct"]].filter(([from]) => from != null && level >= from).map(([, key]) => t(key))];
  el.lettersCaption.innerHTML = pill("level", "focus", "tip.level", t("climb.level"), `<b>${levelNumber(level)}</b>`) +
    `<span class="begin mode-note">${brings.join(" · ")}</span>`;
}

// Freetype: every key is open; the bar holds the word lists, the chosen
// one marked. Nothing to say in the status line: the bar says it.
let listListener = null;
export function onListPick(fn) { listListener = fn; }
// Built again only when the lists or the choice change (this runs on
// every portion).
let listsFor = "";
function renderLists() {
  const lists = S.freetype?.lists ?? [];
  const key = JSON.stringify([S.lang, lists, S.freetypeList, t("freetype.words")]);
  if (key === listsFor && el.letters.firstChild) return;
  listsFor = key;
  for (const k of Object.values(S.keyEls)) k.classList.remove("locked", "known");
  if (S.altgrEl) S.altgrEl.classList.remove("locked");
  el.lettersCaption.innerHTML = "";
  el.letters.innerHTML = `<span class="wl-lbl">${t("freetype.words")}</span>` + lists.map((n) =>
    `<button type="button" class="wl" data-list="${n}" aria-pressed="${n === S.freetypeList}" data-tip-text="${t("freetype.listN", { n })}">${listLabel(n)}</button>`).join("");
}
el.letters.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-list]");
  if (!b) return;
  b.blur();
  listListener?.(Number(b.dataset.list));
});

// ---------- one letter's progress ----------
// The mastery rule (engine.MeetsGoal) has three parts: enough presses, few
// mistakes, enough speed. A letter is as far as its weakest part: the bar
// on its chip is the smallest of the three shares, so it fills up only when
// all three are there. The numbers of the rule come with /stats.
const rule = () => {
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
