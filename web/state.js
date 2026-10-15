// Shared state and small helpers that every other module uses.
//
// Import rule of the frontend (three layers, imports only go down):
//   bottom: state.js and i18n.js import nothing, fx.js only i18n.js,
//           api.js only state.js
//   middle: keyboard, typing, stats, intro, languages, tools, profile,
//           result, tour import the bottom
//           and each other in one direction only (no cycles)
//   top:    input.js and app.js may import anything; nothing imports them
//           (app.js loads input.js)
// webmodules_test.go checks this rule on every `go test ./...`.
// This file is at the very bottom: it imports nothing.

// ---------- page elements ----------
export const $ = (id) => document.getElementById(id);
export const el = {
  textBox: $("text-box"), text: $("text"), caret: $("caret"), input: $("hidden-input"),
  keyboard: $("keyboard"), hint: $("finger-hint"),
  live: $("live"), wpm: $("wpm"), raw: $("raw"), acc: $("acc"), motto: $("logo-motto"),
  letters: $("letters"), lettersCaption: $("letters-caption"),
  tooltip: $("tooltip"),
  btnNew: $("btn-new"), btnIntro: $("btn-intro"), heatKb: $("heat-kb"),
  btnKb: $("btn-kb"), hands: $("hands"),
  intro: $("intro"),
  switch: document.querySelector(".switch"), tabType: $("tab-type"), tabStats: $("tab-stats"),
  viewType: $("view-type"), viewStats: $("view-stats"),
  tiles: $("tiles"), chart: $("chart"), chartNote: $("chart-note"), letterGrid: $("letter-grid"),
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
  exercise: null,         // last /exercise answer: text, focus, unlocked, locked
  lastStats: null,        // last /stats answer
  text: "",               // the exercise text
  pos: 0,                 // index of the character to type next
  busy: false,            // true while talking to the server between exercises
  view: "type",           // "type" or "stats"
  kbHidden: false,        // keyboard and hands switched off
  mottoIndex: 0,          // the small phrase over the logo (set by init)
};

// ---------- small helpers ----------
export const store = { // localStorage can be blocked; the app must work without it
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
export const introOpen = () => !el.intro.classList.contains("hidden") && !el.intro.classList.contains("closing");
export const isTouch = () => matchMedia("(pointer: coarse)").matches;
export function focusText() {
  if (isTouch() && document.activeElement !== el.input) el.input.focus({ preventScroll: true });
  el.textBox.classList.remove("blurred");
}
