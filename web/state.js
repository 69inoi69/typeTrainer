// Shared state and small helpers that every other module uses.
//
// Import rule of the frontend (three layers, imports only go down):
//   bottom: state.js, i18n.js and feel.js import nothing, fx.js only
//           i18n.js, api.js only state.js
//   middle: keyboard, typing, letters, learnpanel, sound, stats, intro, languages, tools,
//           profile, result, modes, modebar, settings, share, ambient import the bottom
//           and each other in one direction only (no cycles)
//   top:    input.js and app.js may import anything; nothing imports them
//           (app.js loads input.js)
// webmodules_test.go checks this rule on every `go test ./...`.
// This file is at the very bottom: it imports nothing.
//
// Why one shared object S: a module may change a field of an imported object
// but cannot assign to an imported variable, so state that several modules
// change lives in S; state used by one module stays a variable inside it.
// To add a module: pick the lowest layer it fits, list it above, and import
// only from its own layer or below. A new bottom module also goes into the
// list in webmodules_test.go (TestWebModules_BottomLayer); the table in
// docs/ARCHITECTURE.md ("Frontend modules") gets a row.

// ---------- page elements ----------
// Elements used by several modules, looked up once at load (modules are
// loaded after the page is parsed), so no keypress ever searches the page.
export const $ = (id) => document.getElementById(id);
export const el = {
  textBox: $("text-box"), text: $("text"), caret: $("caret"), input: $("hidden-input"),
  keyboard: $("keyboard"), hint: $("finger-hint"),
  live: $("live"), wpm: $("wpm"), raw: $("raw"), acc: $("acc"), progress: $("progress"), progressLabel: $("progress-label"),
  letters: $("letters"), lettersCaption: $("letters-caption"),
  tooltip: $("tooltip"),
  btnNew: $("btn-new"),
  hands: $("hands"),
  intro: $("intro"),
  nav: $("nav-switch"), tabLearn: $("tab-learn"), tabClimb: $("tab-climb"), tabFreetype: $("tab-freetype"), tabStats: $("tab-stats"),
  viewType: $("view-type"), viewStats: $("view-stats"),
  lengthFilter: $("length-filter"), tiles: $("tiles"), chart: $("chart"), chartNote: $("chart-note"),
  langSwitch: $("lang-switch"), warn: $("layout-warn"),
  streak: $("streak"), streakN: $("streak-n"),
};

// ---------- state ----------
// Shared state: everything that more than one part of the app reads or
// changes lives in this one object, S.
export const S = {
  languages: [],          // from /api/v1/languages
  lang: "en",             // id of the current language
  alphabet: new Set(),    // letters of the current language
  layout: null,           // keyboard layout of the current language
  keyEls: {},             // char -> key <div> (the letter printed on the key)
  altBase: {},            // AltGr letter -> base key char ("ą" -> "a")
  altgrEl: null,          // the AltGr key, if the layout has one
  // learning only: {focus, unlocked, locked}: the focus letter of the
  // portion being typed and the open / locked letters ("exercise" is an
  // older name, from before rounds)
  exercise: null,
  lastStats: null,        // last /stats answer
  text: "",               // the text of the stream so far (grows while you type)
  pos: 0,                 // index of the character to type next
  busy: false,            // true while a finished run is being saved
  view: "type",           // "type" or "stats"
  mode: "learn",          // "learn", "climb" or "freetype" (modes.js)
  climb: null,            // last /freeplay/stats answer (Climb)
  freetype: null,         // last /freetype/stats answer (Freetype: its lists, the chosen one's rounds)
  freetypeList: 0,        // Freetype: the chosen word list (its n most common words; 0 = not known yet)
  climbLevel: null,       // Climb: the level of this round and the next, 1..10 (typing.js); null = not known yet in this language
  settings: { length: "words-30", live: false, caret: "line", theme: "dark", streak: false, bg: "keys", goal: 0, daily: 15,
    glide: "smooth", size: "m", ws: "none", sound: "off", volume: "50", rest: "0",
    stop: false, nextKey: true, fingers: true },   // settings.js
  kbHidden: false,        // keyboard and hands switched off
};

// ---------- small helpers ----------
export const store = { // localStorage can be blocked; the app must work without it
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
// Is guide A (intro.js) on screen? Here, not in intro.js, because typing.js
// needs it too and must not import intro.js.
export const introOpen = () => !el.intro.classList.contains("hidden") && !el.intro.classList.contains("closing");
// Climb: how many of the most common words level n draws from
// (/freeplay/stats "levels"), as a number to read: "2,000".
export const levelWords = (n) => (S.climb?.levels?.[n - 1] ?? 0).toLocaleString("en");
// A Freetype word list by its size, as on monkeytype: 200, 1k, 5k, 25k.
export const listLabel = (n) => n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : String(n);
// A touch screen (phone, tablet): no physical keyboard, no hover.
export const isTouch = () => matchMedia("(pointer: coarse)").matches;
// "Reduce motion" in the OS: the small JavaScript animations are skipped too
// (style.css turns off the CSS ones).
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
export const reducedMotion = () => motionQuery.matches;
// A colour of the current theme (a CSS variable on :root, "--error"), for
// the animations made in JavaScript (element.animate cannot read var()).
// Read once per theme and kept, so a keypress never asks the browser for
// styles; the theme lives in <html data-theme> (settings.js).
const themeColors = {};
export function themeColor(name) {
  const key = (document.documentElement.dataset.theme || "dark") + name;
  return themeColors[key] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
// Gets the text ready for keys. On a phone the hidden <input> must have the
// focus, or the phone's keyboard does not open; preventScroll stops the page
// jumping to that invisible input.
export function focusText() {
  if (isTouch() && document.activeElement !== el.input) el.input.focus({ preventScroll: true });
  el.textBox.classList.remove("blurred");
}
