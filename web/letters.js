// The letters bar above the text: one chip per letter of the language (open,
// mastered, the focus of the portion being typed, still locked), the status
// line under it (small pills: focus, mastered, next letter), and the keys of
// locked letters dimmed on the keyboard. In free practice and the test there
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
  // freetype: the same infinity sign as its tab
  free: '<path d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4z"/>',
  // next: a key, the one that opens the next letter
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2.5"/>',
};
// Draws the bar, the status line and the dimmed keys from S.exercise (the
// portion being typed) and S.lastStats. Runs on a portion change, never per key.
export function renderLetters() {
  if (!learning()) { renderFreeLetters(); return; }
  if (!S.exercise) return;
  const info = {};
  for (const k of S.lastStats?.keys ?? []) info[k.char] = k;
  const focusHasData = (info[S.exercise.focus]?.count ?? 0) > 0;

  const frag = document.createDocumentFragment();
  const add = (c, cls) => {
    const chip = document.createElement("span");
    chip.className = "chip " + cls;
    chip.textContent = c;
    if (c === popLetter) chip.classList.add("pop");
    if (justMastered.has(c)) chip.classList.add("shine");
    frag.appendChild(chip);
  };
  for (const c of S.exercise.unlocked) {
    let cls = info[c]?.mastered ? "mastered" : "";
    if (c === S.exercise.focus && (focusHasData || c === popLetter)) cls += " focus";
    add(c, cls);
  }
  for (const c of S.exercise.locked) add(c, "locked");
  el.letters.replaceChildren(frag);

  // every key you do not need yet is dimmed on the keyboard
  const open = new Set([...S.exercise.unlocked, " "]);
  const altOf = Object.fromEntries(Object.entries(S.altBase).map(([a, b]) => [b, a]));
  for (const [c, key] of Object.entries(S.keyEls)) key.classList.toggle("locked", !open.has(c) && !open.has(altOf[c]));
  if (S.altgrEl) S.altgrEl.classList.toggle("locked", !S.exercise.unlocked.some((c) => S.altBase[c]));

  // status line: small pills with an icon each (details in their tooltips)
  const openCount = S.exercise.unlocked.length;
  const all = openCount + S.exercise.locked.length;
  const mastered = S.exercise.unlocked.filter((c) => info[c]?.mastered).length;
  const started = (S.lastStats?.keys ?? []).some((k) => k.count > 0);   // anything typed yet
  const parts = [];
  if (!started) {
    parts.push(pill("open", "", "tip.open", t("stat.open"), `<b>${openCount}/${all}</b>`));
    parts.push(`<span class="begin">${t("stat.begin")}</span>`);
  } else {
    if (focusHasData) parts.push(pill("focus", "focus", "tip.focus", t("stat.focus"), `<b class="lt">${S.exercise.focus}</b>`));
    const pct = openCount ? Math.round((mastered / openCount) * 100) : 0;
    parts.push(pill("check", "ok", "tip.mastered", t("stat.mastered"),
      `<span class="mini"><i style="width:${pct}%"></i></span><b>${mastered}/${openCount}</b>`));
    if (S.exercise.locked.length) parts.push(pill("key", "next", "tip.next", t("stat.next"), `<b class="lt">${S.exercise.locked[0]}</b>`));
  }
  el.lettersCaption.innerHTML = parts.join("");
  popLetter = null;
  justMastered = new Set();
}

// One pill of the status line: an icon, a fixed label (small capitals) and
// the value that changes (monospace).
const pill = (icon, cls, tip, label, value) =>
  `<span class="stat ${cls}"${tip ? ` data-tip="${tip}"` : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${STAT_ICONS[icon]}</svg>` +
  `<span class="lbl">${label}</span>${value}</span>`;

// Free practice and the test: no letters to learn. Every key is open, and the
// status line says what this round is: the mode, and for the test the bar
// to pass.
function renderFreeLetters() {
  el.letters.replaceChildren();
  for (const key of Object.values(S.keyEls)) key.classList.remove("locked");
  if (S.altgrEl) S.altgrEl.classList.remove("locked");
  el.lettersCaption.innerHTML = S.mode === "test"
    ? pill("test", "focus", "", t("mode.test"), `<b>${t("mode.testGoal")}</b>`) + `<span class="begin">${t("mode.testCaption")}</span>`
    : pill("free", "", "", t("mode.free"), "") + `<span class="begin">${t("mode.freeCaption")}</span>`;
}
