// The settings panel (the gear in the navigation): how long a round is,
// the live numbers on or off, the look of the caret, the colour theme, the
// on-screen keyboard on or off, and (static, in index.html) saving, loading
// and resetting the statistics (tools.js does those). Settings change
// HOW MUCH and HOW IT LOOKS, never WHAT is practised: the words still come
// from the algorithm (learning) or evenly from the list (free practice), so
// they are not difficulty switches. The typing test ignores the round
// length: it is always one full round of 30 words.
// Everything is kept in this browser (localStorage, "tt." keys); when that
// is blocked, the defaults are used and the app works the same.
// Layer: middle. Imports only the bottom layer.

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";

// Round lengths: "words-N" ends after N words, "time-N" after N seconds.
// Each round keeps its length on the server (storage.Session.Length), and
// the stats screen shows one length at a time.
export const LENGTHS = ["words-10", "words-30", "words-60", "time-30", "time-60"];
export const DEFAULT_LENGTH = "words-30";   // the same as storage.DefaultLength

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
export function loadSettings() {
  const length = store.get("tt.length");
  S.settings.length = LENGTHS.includes(length) ? length : DEFAULT_LENGTH;
  S.settings.live = store.get("tt.live") === "1";      // never chosen: hidden (see firstRoundDone)
  S.settings.caret = store.get("tt.caret") === "block" ? "block" : "line";
  S.settings.theme = store.get("tt.theme") === "light" ? "light" : "dark";
  applySettings();
}
// The look: classes on <body> and data-theme on <html>, style.css does the
// rest. (index.html sets data-theme once more before the page is drawn, so a
// light page never flashes dark first.)
function applySettings() {
  document.body.classList.toggle("live-off", !S.settings.live);
  document.body.classList.toggle("caret-block", S.settings.caret === "block");
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
  if (!card.hidden) renderCard();
}

// Someone else wants to know when the round length changes (input.js starts
// a new round and reloads the stats).
let lengthListener = () => {};
export function onLengthChange(fn) { lengthListener = fn; }
// The keyboard choice is carried out by input.js (the same as Alt+K), so
// this module does not need the keyboard module.
let kbListener = () => {};
export function onKbToggle(fn) { kbListener = fn; }

// ---------- the panel ----------
const box = $("settings"), btn = $("btn-settings"), card = $("settings-card"), body = $("settings-body");

function choice(key, value, label, chosen) {
  return `<button type="button" data-key="${key}" data-value="${value}" aria-pressed="${chosen}">${label}</button>`;
}
function renderCard() {
  const s = S.settings;
  const words = LENGTHS.filter((id) => id.startsWith("words-"));
  const time = LENGTHS.filter((id) => id.startsWith("time-"));
  const group = (ids) => ids.map((id) => choice("length", id, lengthOf(id).n, id === s.length)).join("");
  body.innerHTML =
    `<p class="profile-title" id="settings-title">${t("settings.title")}</p>` +
    `<small class="set-label">${t("settings.length")}</small>` +
    `<div class="set-row"><span class="set-unit">${t("settings.words")}</span>${group(words)}</div>` +
    `<div class="set-row"><span class="set-unit">${t("settings.time")}</span>${group(time)}</div>` +
    `<small class="set-label">${t("settings.live")}</small>` +
    `<div class="set-row">${choice("live", "1", t("settings.show"), s.live)}${choice("live", "", t("settings.hide"), !s.live)}</div>` +
    `<small class="set-label">${t("settings.caret")}</small>` +
    `<div class="set-row">${choice("caret", "line", `<i class="cs line"></i>${t("settings.line")}`, s.caret === "line")}` +
    `${choice("caret", "block", `<i class="cs block"></i>${t("settings.block")}`, s.caret === "block")}</div>` +
    `<small class="set-label">${t("settings.theme")}</small>` +
    `<div class="set-row">${choice("theme", "dark", t("settings.dark"), s.theme === "dark")}${choice("theme", "light", t("settings.light"), s.theme === "light")}</div>` +
    `<small class="set-label">${t("settings.keyboard")}</small>` +
    `<div class="set-row">${choice("kb", "1", t("settings.show"), !S.kbHidden)}${choice("kb", "", t("settings.hide"), S.kbHidden)}</div>`;
}
card.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-key]");
  if (!b) return;
  const { key, value } = b.dataset;
  if (key === "length") {
    if (value === S.settings.length) return;
    S.settings.length = value;
    store.set("tt.length", value);
    lengthListener();
  } else if (key === "live") {
    S.settings.live = value === "1";
    store.set("tt.live", value === "1" ? "1" : "0");
  } else if (key === "caret") {
    S.settings.caret = value;
    store.set("tt.caret", value);
  } else if (key === "theme") {
    S.settings.theme = value;
    store.set("tt.theme", value);
  } else if (key === "kb") {
    if (S.kbHidden === (value === "1")) kbListener();   // only a real change
  }
  applySettings();
  renderCard();
});

export const settingsOpen = () => !card.hidden;
export function closeSettings() {
  card.hidden = true;
  btn.setAttribute("aria-expanded", "false");
}
function openSettings() {
  renderCard();
  card.hidden = false;
  btn.setAttribute("aria-expanded", "true");
}
btn.addEventListener("click", () => { btn.blur(); settingsOpen() ? closeSettings() : openSettings(); });
// a click anywhere else closes it
document.addEventListener("pointerdown", (e) => {
  if (settingsOpen() && !box.contains(e.target)) closeSettings();
});
