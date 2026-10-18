// The settings window (Esc or the gear in the navigation): how long a round
// is, the live numbers on or off, the streak badge on or off, the look of
// the caret, the colour theme, a personal speed goal for the stats screen,
// the on-screen keyboard on or off, and exporting, importing and resetting
// the progress (tools.js does those three). Settings change
// HOW MUCH and HOW IT LOOKS, never WHAT is practised: the words still come
// from the algorithm (learning) or evenly from the list (free practice), so
// they are not difficulty switches. The typing test ignores the round
// length: it is always one full round of 30 words.
// Everything is kept in this browser (localStorage, "tt." keys); when that
// is blocked, the defaults are used and the app works the same.
// Layer: middle. Imports only the bottom layer.
// Called by: app.js (loadSettings at start), input.js (settingsOpen,
// openSettings, closeSettings, onSettingsClose, onLengthChange, onKbToggle),
// typing.js and stats.js (lengthOf, lengthLabel, firstRoundDone).
// To add a setting: a default in S.settings (state.js), reading it in
// loadSettings(), its look in applySettings() (usually a class on <body>
// styled in style.css), an entry in ROWS, a branch in apply(), and its
// texts in i18n.js. A setting may change how much or how
// it looks, never what is practised (AGENTS.md).

import { t } from "./i18n.js";
import { $, S, store, isTouch } from "./state.js";

// Round lengths: "words-N" ends after N words, "time-N" after N seconds.
// Each round keeps its length on the server (storage.Session.Length), and
// the stats screen shows one length at a time.
// (owner, 2026-10-18: 10 to 50 words in steps of 10, and 15 to 90 seconds;
// 60 words went. Rounds of 60 words already played keep their own button on
// the stats screen.)
export const LENGTHS = ["words-10", "words-20", "words-30", "words-40", "words-50", "time-15", "time-30", "time-60", "time-90"];
export const DEFAULT_LENGTH = "words-30";   // the same as storage.DefaultLength
// The caret styles, in the order of the buttons ("line" is the default).
// To add one: its id here, its look in style.css (body[data-caret="id"]
// .caret and a small picture .cs.id) and its name in i18n.js ("settings.id").
const CARETS = ["line", "block", "underline", "outline"];
// A personal speed goal, WPM (0 = none; owner, 2026-10-18). Only the stats
// screen shows it (a tile, the line on the chart): the algorithm never sees
// it, letters open at the trainer's own target as before (AGENTS.md: a
// setting never changes what is practised).
export const GOALS = [0, 50, 75, 100, 125, 150, 200];

// "time-60" -> {kind: "time", n: 60}
export function lengthOf(id) {
  const [kind, n] = id.split("-");
  return { kind, n: Number(n) };
}
// "words-30" -> "30 words", "time-60" -> "60 s" (in the interface language)
export function lengthLabel(id) {
  const { kind, n } = lengthOf(id);
  return t(kind === "time" ? "len.time" : "len.words", { n });
}

// ---------- loading and applying ----------
// Reads the saved choices (anything unknown falls back to the default) and
// applies them. Called once at start, before the first round.
export function loadSettings() {
  const length = store.get("tt.length");
  S.settings.length = LENGTHS.includes(length) ? length : DEFAULT_LENGTH;
  S.settings.live = store.get("tt.live") === "1";      // never chosen: hidden (see firstRoundDone)
  S.settings.streak = store.get("tt.streak") !== "0";  // the streak badge: on unless turned off
  const caret = store.get("tt.caret");
  S.settings.caret = CARETS.includes(caret) ? caret : "line";
  S.settings.theme = store.get("tt.theme") === "light" ? "light" : "dark";
  const goal = Number(store.get("tt.goal"));
  S.settings.goal = GOALS.includes(goal) ? goal : 0;
  applySettings();
}
// The look: classes on <body> and data-theme on <html>, style.css does the
// rest. (index.html sets data-theme once more before the page is drawn, so a
// light page never flashes dark first.)
function applySettings() {
  document.body.classList.toggle("live-off", !S.settings.live);
  document.body.classList.toggle("streak-off", !S.settings.streak);   // style.css hides the badge
  document.body.dataset.caret = S.settings.caret;      // style.css: body[data-caret=...]
  document.documentElement.dataset.theme = S.settings.theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
}

// The live numbers are hidden for a brand-new user (a beginner does not care
// about wpm yet) and appear after their first finished round. Once the user
// has chosen, their choice stays.
export function firstRoundDone() {
  if (store.get("tt.live") !== null) return;
  store.set("tt.live", "1");
  S.settings.live = true;
  applySettings();
  if (win.open) render();
}

// Someone else wants to know when the round length changes (input.js starts
// a new round and reloads the stats).
let lengthListener = () => {};
export function onLengthChange(fn) { lengthListener = fn; }
// The keyboard choice is carried out by input.js (the same as Alt+K), so
// this module does not need the keyboard module.
let kbListener = () => {};
export function onKbToggle(fn) { kbListener = fn; }
// A new goal: the stats screen draws itself again (input.js).
let goalListener = () => {};
export function onGoalChange(fn) { goalListener = fn; }

// ---------- the window ----------
// Esc or the gear opens it (input.js, the button below). Every setting is one
// entry in ROWS; the window is drawn from that list, so search and the arrow
// keys work for a new entry by themselves.
const win = $("settings-win"), btn = $("btn-settings"), body = $("settings-body"), search = $("settings-search");

// One button of a row. Choices carry data-key/data-value (the click handler
// below applies them); the data and reset buttons keep their ids, tools.js
// does their work.
function choice(key, value, label, chosen) {
  return `<button type="button" data-key="${key}" data-value="${value}" aria-pressed="${chosen}">${label}</button>`;
}
const seg = (buttons) => `<span class="seg">${buttons.join("")}</span>`;
const onOff = (key, on) => seg([choice(key, "", t("settings.off"), !on), choice(key, "1", t("settings.on"), on)]);   // on on the right, as on a switch
const lengths = (kind, unit) => seg(LENGTHS.filter((id) => id.startsWith(kind + "-"))
  .map((id) => choice("length", id, lengthOf(id).n + unit, id === S.settings.length)));
const ICON = {
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 19h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>',
};
const action = (id, icon, label, cls = "btn") => `<button type="button" class="${cls}" id="${id}">${ICON[icon]}<span>${t(label)}</span></button>`;

// The rows, top to bottom. group: the small heading above (null: a line
// instead); name: the i18n key of its name (also what search looks in);
// ctl: its buttons; show: whether it is there at all.
// To add a setting: one entry here (and its key in the click handler below,
// its default in S.settings, its texts in i18n.js).
const ROWS = [
  { group: "settings.round", name: "settings.words", ctl: () => lengths("words", "") },
  { group: "settings.round", name: "settings.time", ctl: () => lengths("time", t("settings.sec")) },
  { group: "settings.look", name: "settings.live", ctl: () => onOff("live", S.settings.live) },
  { group: "settings.look", name: "settings.streak", ctl: () => onOff("streak", S.settings.streak) },
  { group: "settings.look", name: "settings.keyboard", ctl: () => onOff("kb", !S.kbHidden), show: () => !isTouch() },   // no keyboard on touch screens
  { group: "settings.look", name: "settings.caret", ctl: () => seg(CARETS.map((id) =>
    choice("caret", id, `<i class="cs ${id}"></i>${t("settings." + id)}`, S.settings.caret === id))) },
  { group: "settings.look", name: "settings.theme", ctl: () => seg([
    choice("theme", "dark", t("settings.dark"), S.settings.theme === "dark"),
    choice("theme", "light", t("settings.light"), S.settings.theme === "light")]) },
  { group: "settings.statsGroup", name: "settings.goal", ctl: () => seg(GOALS.map((g) =>
    choice("goal", String(g), g ? String(g) : t("settings.off"), S.settings.goal === g))) },
  { group: null, name: "settings.data", ctl: () => action("btn-export", "export", "data.save") + action("btn-import", "import", "data.load") },
  { group: null, name: "settings.danger", danger: true, ctl: () => action("btn-reset", "trash", "data.reset", "btn danger") },
];

let cur = 0;        // the row the arrow keys are on (an index into the shown rows)
let shown = [];     // the rows that match the search, in order
// The name with the searched part underlined
function nameHTML(name, q) {
  const i = q ? name.toLowerCase().indexOf(q) : -1;
  return i < 0 ? name : `${name.slice(0, i)}<em>${name.slice(i, i + q.length)}</em>${name.slice(i + q.length)}`;
}
function render() {
  const q = search.value.trim().toLowerCase();
  shown = ROWS.filter((r) => (r.show?.() ?? true) && t(r.name).toLowerCase().includes(q));
  cur = Math.min(cur, shown.length - 1);
  let html = "", group;
  shown.forEach((r, i) => {
    if (i === 0 || r.group !== group) {
      html += r.group ? `<div class="sw-group">${t(r.group)}</div>` : (i ? `<div class="sw-sep"></div>` : "");
    }
    group = r.group;
    const on = i === cur && !isTouch();   // no arrow keys on a phone: no highlight
    html += `<div class="sw-row${on ? " on" : ""}" data-i="${i}"><span class="sw-name${r.danger ? " danger" : ""}">${nameHTML(t(r.name), q)}</span><span class="sw-ctl">${r.ctl()}</span></div>`;
  });
  body.innerHTML = shown.length ? `<div class="sw-rows">${html}</div>` : `<p class="sw-empty">${t("settings.none")}</p>`;
}
search.addEventListener("input", () => { cur = 0; render(); });

// A choice was clicked (or picked with the arrows): save it and apply it.
function apply(key, value) {
  if (key === "length") {
    if (value === S.settings.length) return;
    S.settings.length = value;
    store.set("tt.length", value);
    lengthListener();
  } else if (key === "live") {
    S.settings.live = value === "1";
    store.set("tt.live", value === "1" ? "1" : "0");
  } else if (key === "streak") {
    S.settings.streak = value === "1";
    store.set("tt.streak", value === "1" ? "1" : "0");
  } else if (key === "caret") {
    S.settings.caret = value;
    store.set("tt.caret", value);
  } else if (key === "theme") {
    S.settings.theme = value;
    store.set("tt.theme", value);
  } else if (key === "goal") {
    S.settings.goal = Number(value);
    store.set("tt.goal", value);
    goalListener();
  } else if (key === "kb") {
    if (S.kbHidden === (value === "1")) kbListener();   // only a real change
  }
  applySettings();
  render();
}
win.addEventListener("click", (e) => {
  if (e.target === win) { closeSettings(); return; }   // the dimmed page around it
  const b = e.target.closest("button[data-key]");
  if (b) apply(b.dataset.key, b.dataset.value);
});

// The keys inside the window: up/down pick a row, left/right change its
// choice (or move between its buttons), Enter presses the button, Esc closes
// (the dialog does that by itself). Every other key types into the search.
win.addEventListener("keydown", (e) => {
  if (e.target !== search) {
    if (e.key === "Enter" || e.key === " ") return;            // a focused button presses itself
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) search.focus();   // the letter goes into the search
  }
  const row = body.querySelectorAll(".sw-row")[cur];
  const btns = row ? [...row.querySelectorAll("button")] : [];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!shown.length) return;
    cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
    render();
  } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && btns.length) {
    e.preventDefault();
    const choices = btns.filter((b) => b.dataset.key);
    if (choices.length) {          // a choice: the next one is chosen at once
      const at = choices.findIndex((b) => b.getAttribute("aria-pressed") === "true");
      const next = choices[Math.max(0, Math.min(choices.length - 1, at + (e.key === "ArrowRight" ? 1 : -1)))];
      apply(next.dataset.key, next.dataset.value);
    } else {                       // export / import: move the mark between them
      const at = btns.findIndex((b) => b.classList.contains("kb-on"));
      btns.forEach((b) => b.classList.remove("kb-on"));
      btns[Math.max(0, Math.min(btns.length - 1, at + (e.key === "ArrowRight" ? 1 : -1)))].classList.add("kb-on");
    }
  } else if (e.key === "Enter" && btns.length) {
    e.preventDefault();
    const choices = btns.filter((b) => b.dataset.key);
    if (!choices.length) (btns.find((b) => b.classList.contains("kb-on")) || btns[0]).click();
  }
});

export const settingsOpen = () => win.open;
// Called when the window closes (input.js puts the focus back on the text).
let closeListener = () => {};
export function onSettingsClose(fn) { closeListener = fn; }
win.addEventListener("close", () => {
  btn.setAttribute("aria-expanded", "false");
  closeListener();
});
export function closeSettings() { if (win.open) win.close(); }
export function openSettings() {
  if (win.open) return;
  search.value = "";
  search.placeholder = t("settings.search");
  win.setAttribute("aria-label", t("settings.title"));
  cur = 0;
  render();
  // on a phone the search field must not take the focus: the on-screen
  // keyboard would cover the window every time
  // (showModal focuses the first field it finds, so it is inert meanwhile)
  search.inert = isTouch();
  win.tabIndex = -1;
  win.showModal();
  search.inert = false;
  if (isTouch()) win.focus(); else search.focus();
  btn.setAttribute("aria-expanded", "true");
}
btn.addEventListener("click", () => { btn.blur(); settingsOpen() ? closeSettings() : openSettings(); });
