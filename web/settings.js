// The settings: loading, saving, the window with its search, and the small windows of single screens.

import { t } from "./i18n.js";
import { $, S, store, isTouch } from "./state.js";
import { openPop, ring, ringBtn } from "./minipop.js";
import { SETTINGS, CATEGORIES, LENGTHS, DAILY } from "./settings-list.js";

export { LENGTHS, DAILY };
const BY_ID = Object.fromEntries(SETTINGS.map((s) => [s.id, s]));

// ---------- round lengths ----------
const DEFAULT_LENGTH = "words-30";
const LEARN_LENGTHS = ["words-30"];

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
export function lengthOf(id) {
  const [kind, n] = id.split("-");
  return { kind, n: Number(n) };
}
export function lengthLabel(id) {
  const { kind, n } = lengthOf(id);
  return t(kind === "time" ? "len.time" : "len.words", { n });
}

// ---------- values ----------
function parse(s, raw) {
  if (raw === null || raw === undefined) return undefined;
  if (s.kind === "switch") return raw === "1";
  if (s.kind === "number") {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? Math.min(n, s.max) : undefined;
  }
  if (s.kind === "length") return LENGTHS.includes(raw) ? raw : undefined;
  return s.values.find((v) => String(v) === String(raw));
}
const valueOf = (s) => (s.get ? s.get() : S.settings[s.id]);
function stepNumber(s, v, dir) {
  const n = dir > 0 ? (v ? Math.min(s.max, (Math.floor(v / s.step) + 1) * s.step) : s.start)
    : v ? (Math.ceil(v / s.step) - 1) * s.step : 0;
  return n < s.min ? 0 : n;
}
function valueLabel(s, v) {
  if (s.kind === "switch") return t(v ? "settings.on" : "settings.off");
  if (s.kind === "length") return String(lengthOf(v).n);
  if (v === "off" || String(v) === "0") return t("settings.off");
  if (s.unit) return t(s.unit, { n: v });
  if (/^\d+$/.test(String(v))) return String(v);
  return t(`settings.${s.id}_${v}`);
}
const nameOf = (s) => t("settings." + s.id);
const tipOf = (s) => (s.tip ? t(`settings.${s.id}Desc`) : "");
const modeName = (m) => t(m === "climb" ? "mode.free" : "mode." + m);

// The old single "tt.sound" (off / errors / keys) becomes the two settings.
function splitOldSound() {
  const old = store.get("tt.sound");
  if (old === null) return;
  if (store.get(BY_ID.keySound.store) === null) store.set(BY_ID.keySound.store, old === "keys" ? "click" : "off");
  if (store.get(BY_ID.missSound.store) === null) store.set(BY_ID.missSound.store, old === "off" ? "off" : "thud");
}

// ---------- loading and saving ----------
export function loadSettings() {
  splitOldSound();
  S.settings.length = lengthFor(S.mode);
  for (const s of SETTINGS) {
    if (s.store) S.settings[s.id] = parse(s, store.get(s.store)) ?? s.def;
  }
  applySettings();
}
function applySettings() {
  for (const s of SETTINGS) {
    if (s.body) document.body.dataset[s.id] = s.kind === "switch" ? (S.settings[s.id] ? "on" : "off") : S.settings[s.id];
  }
}

const listeners = [];
export function onSetting(fn) { listeners.push(fn); }

export function setSetting(id, raw) {
  const s = BY_ID[id];
  const v = s && s.kind !== "action" ? parse(s, raw === "" ? "0" : raw) : undefined;
  if (v === undefined) return;
  if (s.kind === "length") setLength(S.mode, v);
  else if (s.set) s.set(v);
  else {
    S.settings[id] = v;
    store.set(s.store, s.kind === "switch" ? (v ? "1" : "0") : String(v));
  }
  applySettings();
  for (const fn of listeners) fn(id, v);
  if (win.open) render();
}

// ---------- controls ----------
const ICON = {
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 19h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>',
};
const pickBtn = (s, v, label, on) => ringBtn(`data-key="${s.id}" data-value="${v}"`, label, on);

// The values a setting can take, in order, as they are sent to setSetting.
function choicesOf(s) {
  if (s.kind === "switch") return ["", "1"];
  if (s.kind === "length") return LENGTHS;
  return s.values ? s.values.map(String) : [];
}

export function control(id) {
  const s = BY_ID[id], cur = valueOf(s), name = nameOf(s);
  if (s.kind === "switch") return ring(name, [pickBtn(s, "", valueLabel(s, false), !cur), pickBtn(s, "1", valueLabel(s, true), !!cur)]);
  if (s.kind === "choice") {
    return ring(name, s.values.map((v) => pickBtn(s, v, (s.icons ? `<i class="cs ${v}"></i>` : "") + valueLabel(s, v), v === cur)));
  }
  if (s.kind === "number") {
    return `<span class="ring stepper" role="group" aria-label="${name}">` +
      ringBtn(`data-key="${id}" data-value="${stepNumber(s, cur, -1)}" data-step="-1" aria-label="${t("settings.less")}"`, "−", false) +
      `<output>${cur ? cur : t("settings.off")}</output>` +
      ringBtn(`data-key="${id}" data-value="${stepNumber(s, cur, 1)}" data-step="1" aria-label="${t("settings.more")}"`, "+", false) + `</span>`;
  }
  if (s.kind === "length") {
    const kind = lengthOf(cur).kind;
    return ring(t("bar.kind"), ["words", "time"].map((k) => pickBtn(s, `${k}-30`, t("settings." + k), k === kind))) +
      ring(t("bar.length"), LENGTHS.filter((v) => lengthOf(v).kind === kind).map((v) => pickBtn(s, v, valueLabel(s, v), v === cur)));
  }
  return s.buttons.map(([bid, icon, label, cls]) =>
    `<button type="button" class="btn${cls ? " " + cls : ""}" id="${bid}">${ICON[icon]}<span>${t(label)}</span></button>`).join("");
}

// ---------- the window ----------
const win = $("settings-win"), btn = $("btn-settings"), body = $("settings-body");
const q = $("settings-q"), chips = $("settings-chips");
q.placeholder = t("settings.search");
q.setAttribute("aria-label", t("settings.search"));

let cur = 0, shown = [], query = "", cat = "";
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const usable = (s) => (s.show?.() ?? true) && !(s.touch === false && isTouch());
function searchText(s) {
  const values = choicesOf(s).map((v) => (s.kind === "action" ? "" : valueLabel(s, s.kind === "switch" ? v === "1" : v)));
  const buttons = s.buttons?.map((b) => t(b[2])) ?? [];
  return [nameOf(s), t("settings.cat_" + s.cat), s.words, tipOf(s), ...values, ...buttons, ...(s.modes ?? []).map(modeName)].join(" ").toLowerCase();
}
const words = () => query.toLowerCase().split(/\s+/).filter(Boolean);
const found = (s) => words().every((w) => searchText(s).includes(w));
function marked(text) {
  const w = words().find((x) => text.toLowerCase().includes(x));
  if (!w) return text;
  const at = text.toLowerCase().indexOf(w);
  return `${text.slice(0, at)}<mark>${text.slice(at, at + w.length)}</mark>${text.slice(at + w.length)}`;
}

function render() {
  const all = SETTINGS.filter((s) => usable(s) && found(s));
  shown = all.filter((s) => !cat || s.cat === cat);
  cur = Math.max(0, Math.min(cur, shown.length - 1));
  const has = new Set(all.map((s) => s.cat));
  chips.innerHTML = ["", ...CATEGORIES].map((c) =>
    `<button type="button" data-cat="${c}" aria-pressed="${c === cat}"${c && !has.has(c) ? " disabled" : ""}>${t(c ? "settings.cat_" + c : "settings.all")}</button>`).join("");
  let html = "", group;
  shown.forEach((s, i) => {
    if (s.cat !== group) html += `<div class="sw-group">${t("settings.cat_" + s.cat)}</div>`;
    group = s.cat;
    const on = i === cur && !isTouch();
    const tip = tipOf(s), desc = tip ? ` data-tip-text="${attr(tip)}" aria-description="${attr(tip)}"` : "";
    const tag = s.modes ? `<small class="sw-tag">${s.modes.map(modeName).join(" · ")}</small>` : "";
    html += `<div class="sw-row${on ? " on" : ""}" data-i="${i}"><span class="sw-name"${desc}><span>${marked(nameOf(s))}</span>${tag}</span>` +
      `<span class="sw-ctl">${control(s.id)}</span></div>`;
  });
  body.innerHTML = shown.length ? `<div class="sw-rows">${html}</div>` : `<p class="sw-none">${t("settings.none")}</p>`;
  placePreview();
}
function showCur() {
  body.querySelector(`.sw-row[data-i="${cur}"] .sw-name`)?.scrollIntoView({ block: "nearest" });
  const head = body.querySelector(`.sw-row[data-i="${cur}"]`)?.previousElementSibling;
  if (head?.classList.contains("sw-group")) head.scrollIntoView({ block: "nearest" });
}

q.addEventListener("input", () => {
  query = q.value;
  cat = "";
  cur = 0;
  render();
  body.scrollTop = 0;
});
chips.addEventListener("click", (e) => {
  const c = e.target.closest("button[data-cat]");
  if (!c) return;
  c.blur();
  cat = c.dataset.cat;
  cur = 0;
  render();
  body.scrollTop = 0;
  if (!isTouch()) q.focus();
});

// ---------- the preview ----------
const PREVIEW_STEP_MS = 260;
const PREVIEW_WRONG = 6;
let previewTimer = 0, hoverRow = -1;
const preview = document.createElement("div");
preview.className = "sw-preview";
preview.hidden = true;
preview.setAttribute("aria-hidden", "true");
win.appendChild(preview);
function placePreview() {
  const i = hoverRow >= 0 ? hoverRow : isTouch() ? -1 : cur;
  const name = shown[i]?.preview && body.querySelector(`.sw-row[data-i="${i}"] .sw-name`);
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
body.addEventListener("scroll", () => placePreview());

// ---------- keys and clicks ----------
win.addEventListener("click", (e) => {
  if (e.target === win) { closeSettings(); return; }
  const b = e.target.closest("button[data-key]");
  if (b) setSetting(b.dataset.key, b.dataset.value);
});

function change(dir) {
  const s = shown[cur];
  if (!s) return;
  if (s.kind === "action") {
    const btns = [...body.querySelectorAll(`.sw-row[data-i="${cur}"] button`)];
    const at = btns.findIndex((b) => b.classList.contains("kb-on"));
    btns.forEach((b) => b.classList.remove("kb-on"));
    btns[Math.max(0, Math.min(btns.length - 1, at + dir))].classList.add("kb-on");
    return;
  }
  if (s.kind === "number") { setSetting(s.id, String(stepNumber(s, valueOf(s), dir))); return; }
  const list = choicesOf(s), v = valueOf(s);
  const at = list.indexOf(s.kind === "switch" ? (v ? "1" : "") : String(v));
  setSetting(s.id, list[Math.max(0, Math.min(list.length - 1, at + dir))]);
}

win.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (e.repeat) { e.preventDefault(); return; }
    if (query) { e.preventDefault(); q.value = ""; q.dispatchEvent(new Event("input")); }
    return;
  }
  const inField = e.target === q || e.target === win;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!shown.length) return;
    cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
    render();
    showCur();
  } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && inField) {
    e.preventDefault();
    change(e.key === "ArrowRight" ? 1 : -1);
  } else if (e.key === "Enter" && inField && shown[cur]?.kind === "action") {
    e.preventDefault();
    const btns = [...body.querySelectorAll(`.sw-row[data-i="${cur}"] button`)];
    (btns.find((b) => b.classList.contains("kb-on")) || btns[0]).click();
  } else if (e.target === win && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    q.focus();
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
  cat = "";
  query = q.value = "";
  render();
  win.tabIndex = -1;
  win.showModal();
  body.scrollTop = 0;
  if (isTouch()) win.focus();
  else q.focus();
  btn.setAttribute("aria-expanded", "true");
}
btn.addEventListener("click", () => { btn.blur(); settingsOpen() ? closeSettings() : openSettings(); });

// ---------- a few settings in a small window next to their control ----------
const popRow = (id) => {
  const tip = tipOf(BY_ID[id]);
  return `<div class="mp-row"><span class="mp-name"${tip ? ` data-tip-text="${attr(tip)}"` : ""}>${nameOf(BY_ID[id])}</span>${control(id)}</div>`;
};
export const openSettingsPop = (anchor, label, ids, after) =>
  openPop(anchor, label, () => ids.map(popRow).join(""), (k, v) => { setSetting(k, v); after?.(); });
export const pickDaily = (anchor, after) => openSettingsPop(anchor, t("settings.daily"), ["daily"], after);
