// The hidden tuning panel: "?tune" in the address opens a panel with the
// knobs of FEEL (feel.js), so the owner can pick the caret and animation
// values by eye while typing, instead of asking for one number after another
// (owner, 2026-10-19). Like ?group (app.js), nothing in the interface leads
// here. It changes only how things look and move, never what is measured.
// The changed values stay in localStorage (tt.tune) but apply only while the
// address has ?tune, so a normal visit always gets the defaults of feel.js.
// "Copy values" puts the changed ones on the clipboard, to be written into
// feel.js as the new defaults.
// The knob names on the panel are the FEEL field names on purpose: they are
// what gets copied back into the code (not interface text for users).
// Layer: middle. Imports feel.js, state.js, i18n.js. Used by: app.js; input.js
// leaves the keys typed into the panel alone.
// To add a knob: a row in KNOBS (the FEEL field, its range and step); the
// field must be read when it is used, not once at load (feel.js says how).

import { FEEL, applyFeel } from "./feel.js";
import { store } from "./state.js";
import { t } from "./i18n.js";

// [FEEL field, min, max, step], grouped; a row without numbers is the curve
const KNOBS = [
  ["tune.caret", [
    ["caretGlideMs", 0, 200, 5],
    ["caretCurve"],
    ["letterColourAt", 0, 1, 0.05],
    ["caretFlinchMs", 0, 400, 10],
    ["caretFlinchScale", 0.3, 1, 0.05],
    ["caretShakePx", 0, 8, 1],
    ["caretBreathMs", 0, 3000, 50],
    ["caretBreathDelayMs", 0, 3000, 50],
  ]],
  ["tune.text", [
    ["lineScrollMs", 0, 400, 10],
    ["resultHoldMs", 0, 1000, 10],
  ]],
  ["tune.keys", [
    ["keyPressMs", 0, 300, 10],
    ["keyPressScale", 0.8, 1, 0.01],
    ["keyMissMs", 0, 500, 10],
    ["keyMissAlpha", 0, 1, 0.05],
    ["fingerTapPx", 0, 10, 1],
    ["fingerTapMs", 0, 300, 10],
    ["nextKeyLiftPx", 0, 10, 1],
  ]],
];
// ready-made glides to compare; any CSS timing function can be typed instead
const CURVES = [
  ["monkeytype inOut(1.25)", "cubic-bezier(.31, .16, .69, .84)"],
  ["linear", "linear"],
  ["ease-out", "cubic-bezier(.2, .8, .2, 1)"],
  ["ease", "ease"],
  ["ease-in-out", "ease-in-out"],
  ["steep out", "cubic-bezier(0, .7, .3, 1)"],
];

const KEY = "tt.tune";
const DEFAULTS = { ...FEEL };   // taken at load, before anything changes it

// the FEEL fields that differ from the defaults: what is saved and copied
function changed() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (FEEL[k] !== DEFAULTS[k]) out[k] = FEEL[k];
  return out;
}

// Opens the panel when the address has ?tune (app.js calls it at start).
export function startTune() {
  if (!new URLSearchParams(location.search).has("tune")) return;
  let saved = {};
  try { saved = JSON.parse(store.get(KEY) || "{}"); } catch { /* broken: start from the defaults */ }
  for (const [k, v] of Object.entries(saved)) {
    if (k in DEFAULTS && typeof v === typeof DEFAULTS[k]) FEEL[k] = v;
  }
  applyFeel();
  build();
}

function build() {
  const box = document.createElement("aside");
  box.className = "tune";
  // the title folds the panel away, so it does not cover the end of a line
  const title = button(t("tune.title"), () => box.classList.toggle("min"));
  title.classList.add("tune-title");
  const note = document.createElement("p");
  note.className = "tune-note"; note.textContent = t("tune.note");
  box.append(title, note);
  const sync = [];   // functions that show FEEL's current values in the fields

  const out = document.createElement("textarea");
  out.className = "tune-out"; out.readOnly = true; out.rows = 4;
  const update = () => {
    applyFeel();
    const c = changed();
    store.set(KEY, JSON.stringify(c));
    out.value = Object.entries(c).map(([k, v]) => `${k}: ${JSON.stringify(v)},`).join("\n");
  };

  for (const [title, rows] of KNOBS) {
    const h = document.createElement("h3");
    h.className = "tune-group"; h.textContent = t(title);
    box.append(h);
    for (const [key, min, max, step] of rows) {
      const row = document.createElement("label");
      row.className = "tune-row";
      const name = document.createElement("span");
      name.textContent = key;
      row.append(name);
      if (min === undefined) row.append(curveField(key, update, sync));
      else row.append(...numberFields(key, min, max, step, update, sync));
      box.append(row);
    }
  }

  const copy = button(t("tune.copy"), async () => {
    try { await navigator.clipboard.writeText(out.value); } catch { out.select(); return; }
    copy.textContent = t("tune.copied");
    setTimeout(() => { copy.textContent = t("tune.copy"); }, 1200);
  });
  const reset = button(t("tune.reset"), () => {
    Object.assign(FEEL, DEFAULTS);
    sync.forEach((f) => f());
    update();
  });
  const bar = document.createElement("div");
  bar.className = "tune-bar";
  bar.append(copy, reset);
  box.append(out, bar);
  document.body.append(box);
  update();
}

// a slider and a number box for one FEEL field, kept in step
function numberFields(key, min, max, step, update, sync) {
  const range = Object.assign(document.createElement("input"), { type: "range", min, max, step });
  const num = Object.assign(document.createElement("input"), { type: "number", min, max, step });
  const show = () => { range.value = num.value = String(FEEL[key]); };
  const set = (v) => {
    const n = Number(v);
    if (v === "" || !Number.isFinite(n)) return;
    FEEL[key] = n;
    show();
    update();
  };
  range.addEventListener("input", () => set(range.value));
  num.addEventListener("change", () => set(num.value));
  // let go of the slider: the keys go back to typing
  range.addEventListener("change", () => range.blur());
  num.addEventListener("keydown", (e) => { if (e.key === "Enter") num.blur(); });
  show();
  sync.push(show);
  return [range, num];
}

// the glide's curve: a list of ready ones, or any CSS timing function typed in
function curveField(key, update, sync) {
  const wrap = document.createElement("span");
  wrap.className = "tune-curve";
  const pick = document.createElement("select");
  for (const [name, value] of CURVES) pick.append(new Option(name, value));
  pick.append(new Option("…", ""));
  const text = Object.assign(document.createElement("input"), { type: "text", spellcheck: false });
  const show = () => {
    text.value = FEEL[key];
    pick.value = CURVES.some(([, v]) => v === FEEL[key]) ? FEEL[key] : "";
  };
  const set = (v) => {
    if (!CSS.supports("transition-timing-function", v)) { show(); return; }
    FEEL[key] = v;
    show();
    update();
  };
  pick.addEventListener("change", () => { if (pick.value) set(pick.value); pick.blur(); });
  text.addEventListener("change", () => set(text.value.trim()));
  text.addEventListener("keydown", (e) => { if (e.key === "Enter") text.blur(); });
  show();
  sync.push(show);
  wrap.append(pick, text);
  return wrap;
}

function button(label, onClick) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "tune-btn"; b.textContent = label;
  b.addEventListener("click", () => { onClick(); b.blur(); });
  return b;
}
