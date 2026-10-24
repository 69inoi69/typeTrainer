// The settings window (Esc or the gear in the navigation): what holds for
// the whole app: the live numbers on or off, the text size, the caret (its
// look and glide), marks on the spaces, the streak badge of Freetype on or
// off, what falls in the background, the colour theme; how typing answers
// (the caret stops on a mistake, sounds and their volume, a break
// reminder); the on-screen keyboard (on or off, and while it is on: the
// next key lit, the hand above the keys, the finger colour of the next
// letter in the text); the goals (a daily goal in minutes
// for the Learn panel, a speed goal for the stats screen); and exporting, importing
// and resetting the progress (tools.js does those three). Settings change
// HOW IT LOOKS, never WHAT is practised. How long a round is belongs to
// each mode and is set in the round bar above the text (modebar.js); this
// module keeps the lengths and remembers each mode's (lengthFor,
// setLength).
// Everything is kept in this browser (localStorage, "tt." keys); when that
// is blocked, the defaults are used and the app works the same.
// Layer: middle. Imports only the bottom layer.
// Called by: app.js (loadSettings at start), input.js (settingsOpen,
// openSettings, onSettingsClose, onKbToggle, setLength),
// modes.js (lengthFor), modebar.js, typing.js and stats.js (the lengths,
// lengthOf, lengthLabel, firstRoundDone).
// To add a setting: a plain choice or an on/off switch is one entry in
// CHOICES or SWITCHES (below) and one in ROWS, its look in the stylesheets (the
// body data attribute or class it gets) and its texts in i18n.js; anything
// else needs a default in S.settings (state.js), reading it in
// loadSettings(), its look in applySettings(), an entry in ROWS, a branch
// in apply(), and its texts in i18n.js. A setting here holds for the whole app and changes how
// it looks, never what is practised (AGENTS.md); a choice of one mode goes
// into the round bar (modebar.js).

import { t } from "./i18n.js";
import { $, S, store, isTouch } from "./state.js";

// Round lengths: "words-N" ends after N words, "time-N" after N seconds.
// Each round keeps its length on the server (storage.Session.Length), and
// the stats screen shows one length at a time.
// 10 to 50 words in steps of 10, and 15 to 90 seconds. Rounds of a length
// no longer offered (60 words) keep their own button on the stats screen.
export const LENGTHS = ["words-10", "words-20", "words-30", "words-40", "words-50", "time-15", "time-30", "time-60", "time-90"];
const DEFAULT_LENGTH = "words-30";   // the same as storage.DefaultLength
// Learning offers two only: short and normal, nothing
// to weigh up for a beginner, and no rounds on time (15 seconds at a
// beginner's 10-15 wpm would be 3 words, too few to learn from).
export const LEARN_LENGTHS = ["words-15", "words-30"];

// Each mode remembers its own round length (tt.length.<mode>). Before,
// one length in the settings held for every mode (tt.length): Climb and
// Freetype start from it.
const lengthsOf = (mode) => (mode === "learn" ? LEARN_LENGTHS : LENGTHS);
export function lengthFor(mode) {
  const ok = lengthsOf(mode);
  for (const id of [store.get(`tt.length.${mode}`), store.get("tt.length")]) {
    if (ok.includes(id)) return id;
  }
  return DEFAULT_LENGTH;
}
// A new length for mode (one of its lengths); the current mode's is also
// S.settings.length, the length the typing screen uses.
export function setLength(mode, id) {
  if (!lengthsOf(mode).includes(id)) return;
  store.set(`tt.length.${mode}`, id);
  if (mode === S.mode) S.settings.length = id;
}
// The caret styles, in the order of the buttons ("line" is the default).
// To add one: its id here, its look in typing.css (body[data-caret="id"]
// .caret and a small picture .cs.id) and its name in i18n.js ("settings.id").
const CARETS = ["line", "block", "underline", "outline"];
// A personal speed goal, WPM (0 = none). Only the stats
// screen shows it (a tile, the line on the chart): the algorithm never sees
// it, letters open at the trainer's own target as before (AGENTS.md: a
// setting never changes what is practised).
const GOALS = [0, 30, 40, 50, 75, 100, 125, 150, 200];   // 30 and 40: a goal a beginner can reach
// A daily goal, minutes of typing in any mode (0 = none; after keybr). The
// Learn panel shows today against it (learnpanel.js).
// 15 by default: a beginner's honest daily dose; more is a choice.
const DAILY = [0, 5, 10, 15, 20, 30, 45, 60];
const DAILY_DEFAULT = 15;
// Plain choices (after keybr): S.settings[name] is one of
// values (in the order of the buttons), def when nothing valid is saved,
// kept in localStorage under key.
// What each does: caret glide (typing.css body[data-glide]), what the
// caret does at rest (typing.css body[data-blink], caret.js breathe), text size
// (body[data-size]), a mark on every space (body[data-ws]), sounds
// (sound.js), their volume, the rest reminder (typing.js restCheck,
// minutes, "0" = off).
// To add one: an entry here, a row in ROWS, its look in the stylesheets (the
// body data attribute of the same name is set for every choice) or its
// use in the code, and its texts in i18n.js.
const CHOICES = {
  glide: { key: "tt.glide", values: ["smooth", "jump"], def: "smooth" },
  blink: { key: "tt.blink", values: ["off", "breathe", "pulse"], def: "breathe" },
  size: { key: "tt.size", values: ["s", "m", "l"], def: "m" },
  ws: { key: "tt.ws", values: ["none", "dot", "bar"], def: "none" },
  sound: { key: "tt.sound", values: ["off", "errors", "keys"], def: "off" },
  volume: { key: "tt.volume", values: ["25", "50", "75", "100"], def: "50" },
  rest: { key: "tt.rest", values: ["0", "20", "30", "45", "60"], def: "0" },
};
// On/off switches: S.settings[name], the default, the localStorage key.
// stop: the caret waits on a wrong key (typing.js handleChar); nextKey:
// the next key lights up; hand: the small hand above the keyboard shows the
// finger (keyboard.js); fingerText: the next letter in the text in its
// finger's colour (typing.js lightNext). Each works without the others. The keys are always in
// their finger colours: without them the keyboard says nothing about which
// finger to use, so there is no switch for them.
const SWITCHES = {
  stop: { key: "tt.stop", on: false },
  nextKey: { key: "tt.nextKey", on: true },
  hand: { key: "tt.hand", on: true },
  fingerText: { key: "tt.fingerText", on: true },
};

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
  S.settings.length = lengthFor(S.mode);               // modes.js sets it again for the mode restored
  S.settings.live = store.get("tt.live") === "1";      // never chosen: hidden (see firstRoundDone)
  // the streak badge, in Freetype only, off unless turned on (it says
  // little, and every extra thing on the text slows typing). A new key:
  // the old tt.streak was on by default.
  S.settings.streak = store.get("tt.streak.free") === "1";
  // the background: falling keycaps or nothing (ambient.js), nothing
  // unless turned on (issue #150). A browser that saved an older choice
  // (letters, words) gets keycaps.
  const bg = store.get("tt.bg");
  S.settings.bg = bg && bg !== "off" ? "keys" : "off";
  const caret = store.get("tt.caret");
  S.settings.caret = CARETS.includes(caret) ? caret : "line";
  S.settings.theme = store.get("tt.theme") === "light" ? "light" : "dark";
  const goal = Number(store.get("tt.goal"));
  S.settings.goal = GOALS.includes(goal) ? goal : 0;
  const daily = store.get("tt.daily");
  S.settings.daily = daily !== null && DAILY.includes(Number(daily)) ? Number(daily) : DAILY_DEFAULT;
  for (const [name, c] of Object.entries(CHOICES)) {
    const v = store.get(c.key);
    S.settings[name] = c.values.includes(v) ? v : c.def;
  }
  for (const [name, w] of Object.entries(SWITCHES)) {
    const v = store.get(w.key);
    S.settings[name] = v === null ? w.on : v === "1";
  }
  applySettings();
}
// The look: classes on <body> and data-theme on <html>, the CSS does the
// rest. (index.html sets data-theme once more before the page is drawn, so a
// light page never flashes dark first.)
function applySettings() {
  document.body.classList.toggle("live-off", !S.settings.live);
  document.body.classList.toggle("streak-off", !S.settings.streak);   // layout.css hides the badge
  document.body.classList.toggle("hand-off", !S.settings.hand);       // typing.css: no hand, no room for it
  document.body.dataset.caret = S.settings.caret;      // typing.css: body[data-caret=...]
  for (const name of Object.keys(CHOICES)) document.body.dataset[name] = S.settings[name];
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

// The keyboard choice is carried out by input.js (the same as Alt+K), so
// this module does not need the keyboard module.
let kbListener = () => {};
export function onKbToggle(fn) { kbListener = fn; }
// A new speed or daily goal: the stats screen and the Learn panel draw
// themselves again (input.js).
let goalListener = () => {};
export function onGoalChange(fn) { goalListener = fn; }
// Another background: input.js draws it again (ambient.js).
let bgListener = () => {};
export function onBgChange(fn) { bgListener = fn; }
// Another text size, next-key, hand or finger-colour choice: input.js fits the text and the
// keyboard again and lights the next key (or not).
let typingListener = () => {};
export function onTypingLook(fn) { typingListener = fn; }

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
const ICON = {
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 19h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>',
};
const action = (id, icon, label, cls = "btn") => `<button type="button" class="${cls}" id="${id}">${ICON[icon]}<span>${t(label)}</span></button>`;

// The rows, top to bottom. group: the small heading above (null: a line
// instead); name: the i18n key of its name (also what search looks in);
// desc: the i18n key of what it does and why you might want it, shown in
// a tooltip over the name (a line under every row takes too much room);
// ctl: its buttons; show: whether it is there at all.
// To add a setting: one entry here (and its key in CHOICES / SWITCHES or
// the click handler below, its default in S.settings, its texts in i18n.js).
const pick = (name, label) => seg(CHOICES[name].values.map((v) => choice(name, v, label(v), S.settings[name] === v)));
const ROWS = [
  { group: "settings.look", name: "settings.live", desc: "settings.liveDesc", ctl: () => onOff("live", S.settings.live) },
  { group: "settings.look", name: "settings.size", ctl: () => pick("size", (v) => t("settings.size_" + v)) },
  { group: "settings.look", name: "settings.caret", ctl: () => seg(CARETS.map((id) =>
    choice("caret", id, `<i class="cs ${id}"></i>${t("settings." + id)}`, S.settings.caret === id))) },
  { group: "settings.look", name: "settings.glide", desc: "settings.glideDesc", ctl: () => pick("glide", (v) => t("settings.glide_" + v)) },
  { group: "settings.look", name: "settings.blink", desc: "settings.blinkDesc", ctl: () => pick("blink", (v) => t("settings.blink_" + v)) },
  { group: "settings.look", name: "settings.ws", desc: "settings.wsDesc", ctl: () => pick("ws", (v) => t("settings.ws_" + v)) },
  { group: "settings.look", name: "settings.streak", desc: "settings.streakDesc", ctl: () => onOff("streak", S.settings.streak) },
  { group: "settings.look", name: "settings.background", desc: "settings.backgroundDesc", ctl: () => onOff("bg", S.settings.bg !== "off") },
  { group: "settings.look", name: "settings.theme", ctl: () => seg([
    choice("theme", "dark", t("settings.dark"), S.settings.theme === "dark"),
    choice("theme", "light", t("settings.light"), S.settings.theme === "light")]) },
  { group: "settings.typing", name: "settings.stop", desc: "settings.stopDesc", ctl: () => onOff("stop", S.settings.stop) },
  { group: "settings.typing", name: "settings.sound", desc: "settings.soundDesc", ctl: () => pick("sound", (v) => t("settings.sound_" + v)) },
  { group: "settings.typing", name: "settings.volume", ctl: () => pick("volume", (v) => v + "%"), show: () => S.settings.sound !== "off" },
  { group: "settings.typing", name: "settings.rest", desc: "settings.restDesc", ctl: () => pick("rest", (v) => (v === "0" ? t("settings.off") : v)) },
  { group: "settings.kbGroup", name: "settings.keyboard", desc: "settings.keyboardDesc", ctl: () => onOff("kb", !S.kbHidden), show: () => !isTouch() },   // no keyboard on touch screens
  { group: "settings.kbGroup", name: "settings.nextKey", desc: "settings.nextKeyDesc", ctl: () => onOff("nextKey", S.settings.nextKey), show: () => !isTouch() && !S.kbHidden },   // nothing to light without the keyboard
  { group: "settings.kbGroup", name: "settings.hand", desc: "settings.handDesc", ctl: () => onOff("hand", S.settings.hand), show: () => !isTouch() && !S.kbHidden },
  { group: "settings.kbGroup", name: "settings.fingerText", desc: "settings.fingerTextDesc", ctl: () => onOff("fingerText", S.settings.fingerText), show: () => !isTouch() && !S.kbHidden },
  { group: "settings.statsGroup", name: "settings.daily", desc: "settings.dailyDesc", ctl: () => seg(DAILY.map((m) =>
    choice("daily", String(m), m ? String(m) : t("settings.off"), S.settings.daily === m))) },
  { group: "settings.statsGroup", name: "settings.goal", desc: "settings.goalDesc", ctl: () => seg(GOALS.map((g) =>
    choice("goal", String(g), g ? String(g) : t("settings.off"), S.settings.goal === g))) },
  { group: null, name: "settings.data", desc: "settings.dataDesc", ctl: () => action("btn-export", "export", "data.save") + action("btn-import", "import", "data.load") },
  { group: null, name: "settings.danger", desc: "settings.dangerDesc", danger: true, ctl: () => action("btn-reset", "trash", "data.reset", "btn danger") },
];

let cur = 0;        // the row the arrow keys are on (an index into the shown rows)
let shown = [];     // the rows that match the search, in order
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");   // text inside an attribute
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
    const desc = r.desc ? ` data-tip-text="${attr(t(r.desc))}" aria-description="${attr(t(r.desc))}"` : "";
    html += `<div class="sw-row${on ? " on" : ""}" data-i="${i}"><span class="sw-name${r.danger ? " danger" : ""}"${desc}>${nameHTML(t(r.name), q)}</span><span class="sw-ctl">${r.ctl()}</span></div>`;
  });
  body.innerHTML = previewHTML() +
    (shown.length ? `<div class="sw-rows">${html}</div>` : `<p class="sw-empty">${t("settings.none")}</p>`);
  startPreview();
}
search.addEventListener("input", () => { cur = 0; render(); });

// A choice was clicked (or picked with the arrows): save it and apply it.
function apply(key, value) {
  if (CHOICES[key]) {
    S.settings[key] = value;
    store.set(CHOICES[key].key, value);
    if (key === "size") typingListener();
    if (key === "sound" && value !== "off") soundListener(value);   // a sample, so you hear what you chose
  } else if (SWITCHES[key]) {
    S.settings[key] = value === "1";
    store.set(SWITCHES[key].key, value === "1" ? "1" : "0");
    if (key === "nextKey" || key === "hand" || key === "fingerText") typingListener();
  } else if (key === "live") {
    S.settings.live = value === "1";
    store.set("tt.live", value === "1" ? "1" : "0");
  } else if (key === "streak") {
    S.settings.streak = value === "1";
    store.set("tt.streak.free", value === "1" ? "1" : "0");
  } else if (key === "bg") {
    S.settings.bg = value ? "keys" : "off";
    store.set("tt.bg", S.settings.bg);
    bgListener();
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
  } else if (key === "daily") {
    S.settings.daily = Number(value);
    store.set("tt.daily", value);
    goalListener();
  } else if (key === "kb") {
    if (S.kbHidden === (value === "1")) kbListener();   // only a real change
  }
  applySettings();
  render();
}
// A sound was chosen: input.js plays one (sound.js), so you hear it.
let soundListener = () => {};
export function onSoundPick(fn) { soundListener = fn; }

// ---------- the preview ----------
// A short line on top of the window that types itself in the look chosen
// below it (text size, caret, its glide, the space marks, the theme), so a
// change shows at once without closing the window. A timer steps the
// caret like a typist (it runs only while the window is open, never while
// you type); the glide itself is the real caret's CSS transition.
const PREVIEW_STEP_MS = 260;      // one "keypress" of the preview
const PREVIEW_WRONG = 6;          // the letter it gets wrong (shown red), as typing does
let previewTimer = 0;
function previewHTML() {
  const text = t("settings.sample");
  const letters = [...text].map((c) => `<span${c === " " ? " data-sp" : ""}>${c}</span>`).join("");
  return `<div class="sw-preview" aria-hidden="true"><div class="text pv-text">${letters}<i class="caret pv-caret"></i></div></div>`;
}
function startPreview() {
  clearInterval(previewTimer);
  const box = body.querySelector(".pv-text");
  if (!box) return;
  const spans = [...box.querySelectorAll("span")], caret = box.querySelector(".pv-caret");
  let i = 0;
  const step = () => {
    if (!win.open || !box.isConnected) { clearInterval(previewTimer); return; }
    if (i > spans.length + 3) {                         // a short rest at the end, then again
      i = 0;
      spans.forEach((sp) => (sp.className = ""));
      caret.classList.add("jump");
    } else caret.classList.remove("jump");
    if (i > 0 && i <= spans.length) spans[i - 1].className = i - 1 === PREVIEW_WRONG ? "bad" : "ok";
    caret.style.setProperty("--i", Math.min(i, spans.length));
    i++;
  };
  step();
  previewTimer = setInterval(step, PREVIEW_STEP_MS);
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
  clearInterval(previewTimer);
  btn.setAttribute("aria-expanded", "false");
  closeListener();
});
function closeSettings() { if (win.open) win.close(); }
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
