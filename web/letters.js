// The letters bar above the text: one chip per letter of the language (open,
// mastered, the focus of the portion being typed, still locked), the status
// line (focus, next letter; a quiet row inside the text block, under the
// text), and the keys of locked letters dimmed on the keyboard. In free practice and the test there
// is nothing to learn: the bar is empty and every key is open.
// Layer: middle. Imports the bottom layer and modes.js.
// Called by: typing.js (renderLetters when a portion or round changes the
// letters; markNewLetter / markMastered just before).

import { t } from "./i18n.js";
import { el, S } from "./state.js";
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
  // the typing test: a flag at the finish line
  test: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
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
  if (!learning()) { builtFor = captionFor = ""; renderFreeLetters(); return; }
  if (!S.exercise) return;
  const info = {};
  for (const k of S.lastStats?.keys ?? []) info[k.char] = k;
  const focusHasData = (info[S.exercise.focus]?.count ?? 0) > 0;
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
      if (c === popLetter) chip.classList.add("pop");
      if (justMastered.has(c)) chip.classList.add("shine");
      if (cls.includes("mastered")) chip.dataset.tip = "tip.mastered";   // what the tick means
      chipOf[c] = chip;
      frag.appendChild(chip);
    };
    for (const c of S.exercise.unlocked) add(c, info[c]?.mastered ? "mastered" : "");
    for (const c of S.exercise.locked) add(c, "locked");
    el.letters.replaceChildren(frag);

    // every key you do not need yet is dimmed on the keyboard
    const open = new Set([...S.exercise.unlocked, " "]);
    const altOf = Object.fromEntries(Object.entries(S.altBase).map(([a, b]) => [b, a]));
    for (const [c, key] of Object.entries(S.keyEls)) key.classList.toggle("locked", !open.has(c) && !open.has(altOf[c]));
    if (S.altgrEl) S.altgrEl.classList.toggle("locked", !S.exercise.unlocked.some((c) => S.altBase[c]));
  }
  // the focus letter (gold): one class, moved
  for (const c of S.exercise.unlocked) {
    chipOf[c]?.classList.toggle("focus", c === S.exercise.focus && (focusHasData || c === popLetter));
  }

  // status line: an icon, a label and a value each (details in their tooltips)
  const openCount = S.exercise.unlocked.length;
  const all = openCount + S.exercise.locked.length;
  const caption = JSON.stringify([S.lang, t("stat.open"), started, focusHasData && S.exercise.focus, S.exercise.locked[0], openCount, all]);
  if (caption !== captionFor) {
    captionFor = caption;
    const parts = [];
    if (!started) {
      parts.push(pill("open", "", "tip.open", t("stat.open"), `<b>${openCount}/${all}</b>`));
      parts.push(`<span class="begin">${t("stat.begin")}</span>`);
    } else {
      if (focusHasData) parts.push(pill("focus", "focus", "tip.focus", t("stat.focus"), `<b class="lt">${S.exercise.focus}</b>`));
      // no "mastered" pill: the letters row above already marks every
      // mastered letter with a tick (owner, 2026-10-16: it said the same twice)
      if (S.exercise.locked.length) parts.push(pill("key", "next", "tip.next", t("stat.next"), `<b class="lt">${S.exercise.locked[0]}</b>`));
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

// Free practice and the test: no letters to learn. Every key is open. The
// test's status line says the bar to pass; free practice shows none
// (owner, 2026-10-16: the tab already says where you are).
function renderFreeLetters() {
  el.letters.replaceChildren();
  for (const key of Object.values(S.keyEls)) key.classList.remove("locked");
  if (S.altgrEl) S.altgrEl.classList.remove("locked");
  el.lettersCaption.innerHTML = S.mode === "test"
    ? pill("test", "focus", "", t("mode.test"), `<b>${t("mode.testGoal")}</b>`) + `<span class="begin mode-note">${t("mode.testCaption")}</span>`
    : "";
}
