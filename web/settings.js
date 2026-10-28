// The settings window.

import { t } from "./i18n.js";
import { $, S, store, isTouch } from "./state.js";

export const LENGTHS = ["words-10", "words-20", "words-30", "words-40", "words-50", "time-15", "time-30", "time-60", "time-90"];
const DEFAULT_LENGTH = "words-30";
export const LEARN_LENGTHS = ["words-15", "words-30"];

const lengthsOf = (mode) => (mode === "learn" ? LEARN_LENGTHS : LENGTHS);
export function lengthFor(mode) {
  const ok = lengthsOf(mode);
  for (const id of [store.get(`tt.length.${mode}`), store.get("tt.length")]) {
    if (ok.includes(id)) return id;
  }
  return DEFAULT_LENGTH;
}
export function setLength(mode, id) {
  if (!lengthsOf(mode).includes(id)) return;
  store.set(`tt.length.${mode}`, id);
  if (mode === S.mode) S.settings.length = id;
}
const CARETS = ["line", "block"];
const GOAL_MAX = 300;
const goalOf = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, GOAL_MAX) : 0;
};
export const DAILY = [0, 5, 10, 15, 20, 30, 45, 60];
const DAILY_DEFAULT = 15;
const CHOICES = {
  glide: { key: "tt.glide", values: ["smooth", "jump"], def: "smooth" },
  sound: { key: "tt.sound", values: ["off", "errors", "keys"], def: "off" },
  volume: { key: "tt.volume", values: ["25", "50", "75", "100"], def: "50" },
  rest: { key: "tt.rest", values: ["0", "20", "30", "45", "60"], def: "0" },
};
const SWITCHES = {
  stop: { key: "tt.stop", on: false },
  nextKey: { key: "tt.nextKey", on: true },
  hand: { key: "tt.hand", on: true },
  fingerText: { key: "tt.fingerText", on: true },
};

export function lengthOf(id) {
  const [kind, n] = id.split("-");
  return { kind, n: Number(n) };
}
export function lengthLabel(id) {
  const { kind, n } = lengthOf(id);
  return t(kind === "time" ? "len.time" : "len.words", { n });
}

// ---------- loading and applying ----------
export function loadSettings() {
  S.settings.length = lengthFor(S.mode);
  S.settings.live = store.get("tt.live") !== "0";
  S.settings.streak = store.get("tt.streak.free") === "1";
  const bg = store.get("tt.bg");
  S.settings.bg = bg && bg !== "off" ? "keys" : "off";
  const caret = store.get("tt.caret");
  S.settings.caret = CARETS.includes(caret) ? caret : "line";
  S.settings.theme = store.get("tt.theme") === "light" ? "light" : "dark";
  S.settings.goal = goalOf(store.get("tt.goal"));
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
function applySettings() {
  document.body.classList.toggle("live-off", !S.settings.live);
  document.body.classList.toggle("streak-off", !S.settings.streak);
  document.body.classList.toggle("hand-off", !S.settings.hand);
  document.body.dataset.caret = S.settings.caret;
  for (const name of Object.keys(CHOICES)) document.body.dataset[name] = S.settings[name];
  document.documentElement.dataset.theme = S.settings.theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
}

let goalListener = () => {};
export function onGoalChange(fn) { goalListener = fn; }
let bgListener = () => {};
export function onBgChange(fn) { bgListener = fn; }
let typingListener = () => {};
export function onTypingLook(fn) { typingListener = fn; }

// ---------- the window ----------
const win = $("settings-win"), btn = $("btn-settings"), body = $("settings-body");

function choice(key, value, label, chosen) {
  return `<button type="button" data-key="${key}" data-value="${value}" aria-pressed="${chosen}">${label}</button>`;
}
const seg = (buttons) => `<span class="ring">${buttons.join("")}</span>`;
const onOff = (key, on) => seg([choice(key, "", t("settings.off"), !on), choice(key, "1", t("settings.on"), on)]);
const ICON = {
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 19h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>',
};
const action = (id, icon, label, cls = "btn") => `<button type="button" class="${cls}" id="${id}">${ICON[icon]}<span>${t(label)}</span></button>`;

const pick = (name, label) => seg(CHOICES[name].values.map((v) => choice(name, v, label(v), S.settings[name] === v)));
const ROWS = [
  { group: "settings.look", name: "settings.theme", ctl: () => seg([
    choice("theme", "dark", t("settings.dark"), S.settings.theme === "dark"),
    choice("theme", "light", t("settings.light"), S.settings.theme === "light")]) },
  { group: "settings.look", name: "settings.caret", ctl: () => seg(CARETS.map((id) =>
    choice("caret", id, `<i class="cs ${id}"></i>${t("settings." + id)}`, S.settings.caret === id))) },
  { group: "settings.look", name: "settings.glide", ctl: () => pick("glide", (v) => t("settings.glide_" + v)) },
  { group: "settings.look", name: "settings.background", ctl: () => onOff("bg", S.settings.bg !== "off") },
  { group: "settings.look", name: "settings.live", desc: "settings.liveDesc", ctl: () => onOff("live", S.settings.live) },
  { group: "settings.typing", name: "settings.stop", desc: "settings.stopDesc", ctl: () => onOff("stop", S.settings.stop) },
  { group: "settings.typing", name: "settings.sound", ctl: () => pick("sound", (v) => t("settings.sound_" + v)) },
  { group: "settings.typing", name: "settings.volume", ctl: () => pick("volume", (v) => v + "%"), show: () => S.settings.sound !== "off" },
  { group: "settings.typing", name: "settings.rest", desc: "settings.restDesc", ctl: () => pick("rest", (v) => (v === "0" ? t("settings.off") : t("settings.min", { n: v }))) },
  { group: null, name: "settings.data", desc: "settings.dataDesc", ctl: () => action("btn-export", "export", "data.save") + action("btn-import", "import", "data.load") },
  { group: null, name: "settings.danger", desc: "settings.dangerDesc", danger: true, ctl: () => action("btn-reset", "trash", "data.reset", "btn danger") },
];

let cur = 0;
let shown = [];
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
function render() {
  shown = ROWS.filter((r) => r.show?.() ?? true);
  cur = Math.min(cur, shown.length - 1);
  let html = "", group;
  shown.forEach((r, i) => {
    if (i === 0 || r.group !== group) {
      html += r.group ? `<div class="sw-group">${t(r.group)}</div>` : (i ? `<div class="sw-sep"></div>` : "");
    }
    group = r.group;
    const on = i === cur && !isTouch();
    const desc = r.desc ? ` data-tip-text="${attr(t(r.desc))}" aria-description="${attr(t(r.desc))}"` : "";
    html += `<div class="sw-row${on ? " on" : ""}" data-i="${i}"><span class="sw-name${r.danger ? " danger" : ""}"${desc}>${t(r.name)}</span><span class="sw-ctl">${r.ctl()}</span></div>`;
  });
  body.innerHTML = `<div class="sw-rows">${html}</div>`;
  placePreview();
}

export function setSetting(key, value) {
  if (CHOICES[key]) {
    S.settings[key] = value;
    store.set(CHOICES[key].key, value);
    if (key === "sound" && value !== "off") soundListener(value);
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
    S.settings.goal = goalOf(value);
    store.set("tt.goal", String(S.settings.goal));
    goalListener();
  } else if (key === "daily") {
    S.settings.daily = Number(value);
    store.set("tt.daily", value);
    goalListener();
  }
  applySettings();
  if (win.open) render();
}
let soundListener = () => {};
export function onSoundPick(fn) { soundListener = fn; }

// ---------- the preview ----------
const PREVIEW_STEP_MS = 260;
const PREVIEW_WRONG = 6;
let previewTimer = 0, hoverRow = -1;
const PREVIEW_ROWS = ["settings.caret", "settings.glide"];
const preview = document.createElement("div");
preview.className = "sw-preview";
preview.hidden = true;
preview.setAttribute("aria-hidden", "true");
win.appendChild(preview);
function placePreview() {
  const i = hoverRow >= 0 ? hoverRow : isTouch() ? -1 : cur;
  const name = PREVIEW_ROWS.includes(shown[i]?.name) && body.querySelector(`.sw-row[data-i="${i}"] .sw-name`);
  if (!name) { preview.hidden = true; clearInterval(previewTimer); return; }
  if (preview.hidden) startPreview();
  preview.hidden = false;
  const w = win.getBoundingClientRect(), r = name.getBoundingClientRect();
  preview.style.top = `${r.top - w.top + r.height / 2 - preview.offsetHeight / 2}px`;
  preview.classList.toggle("left", w.right + 12 + preview.offsetWidth > innerWidth);
}
function startPreview() {
  clearInterval(previewTimer);
  const letters = [...t("settings.sample")].map((c) => `<span${c === " " ? " data-sp" : ""}>${c}</span>`).join("");
  preview.innerHTML = `<div class="text pv-text">${letters}<i class="caret pv-caret"></i></div>`;
  const spans = [...preview.querySelectorAll("span")], caret = preview.querySelector(".pv-caret");
  let i = 0;
  const step = () => {
    if (!win.open || preview.hidden) { clearInterval(previewTimer); return; }
    if (i > spans.length + 3) {
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
body.addEventListener("mouseover", (e) => {
  const row = e.target.closest(".sw-row");
  const i = row ? Number(row.dataset.i) : -1;
  if (i !== hoverRow) { hoverRow = i; placePreview(); }
});
body.addEventListener("mouseleave", () => { hoverRow = -1; placePreview(); });

win.addEventListener("click", (e) => {
  if (e.target === win) { closeSettings(); return; }
  const b = e.target.closest("button[data-key]");
  if (b) setSetting(b.dataset.key, b.dataset.value);
});

win.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target !== win) return;
  const row = body.querySelectorAll(".sw-row")[cur];
  const btns = row ? [...row.querySelectorAll("button")] : [];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
    render();
  } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && btns.length) {
    e.preventDefault();
    const choices = btns.filter((b) => b.dataset.key);
    if (choices.length) {
      const at = choices.findIndex((b) => b.getAttribute("aria-pressed") === "true");
      const next = choices[Math.max(0, Math.min(choices.length - 1, at + (e.key === "ArrowRight" ? 1 : -1)))];
      setSetting(next.dataset.key, next.dataset.value);
    } else {
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
let closeListener = () => {};
export function onSettingsClose(fn) { closeListener = fn; }
win.addEventListener("close", () => {
  clearInterval(previewTimer);
  preview.hidden = true;
  hoverRow = -1;
  btn.setAttribute("aria-expanded", "false");
  closeListener();
});
function closeSettings() { if (win.open) win.close(); }
export function openSettings() {
  if (win.open) return;
  win.setAttribute("aria-label", t("settings.title"));
  cur = 0;
  render();
  win.tabIndex = -1;
  win.showModal();
  win.focus();
  btn.setAttribute("aria-expanded", "true");
}
btn.addEventListener("click", () => { btn.blur(); settingsOpen() ? closeSettings() : openSettings(); });
