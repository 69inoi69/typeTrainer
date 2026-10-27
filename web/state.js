// Shared state and helpers.

// ---------- page elements ----------
export const $ = (id) => document.getElementById(id);
export const el = {
  textBox: $("text-box"), text: $("text"), caret: $("caret"), input: $("hidden-input"),
  keyboard: $("keyboard"), hint: $("finger-hint"),
  live: $("live"), wpm: $("wpm"), raw: $("raw"), acc: $("acc"), progress: $("progress"), progressLabel: $("progress-label"),
  letters: $("letters"), lettersCaption: $("letters-caption"),
  tooltip: $("tooltip"),
  hands: $("hands"),
  intro: $("intro"),
  nav: $("nav-switch"), tabLearn: $("tab-learn"), tabClimb: $("tab-climb"), tabFreetype: $("tab-freetype"), tabStats: $("tab-stats"),
  viewType: $("view-type"), viewStats: $("view-stats"),
  lengthFilter: $("length-filter"), tiles: $("tiles"), chart: $("chart"), chartNote: $("chart-note"),
  langSwitch: $("lang-switch"), warn: $("layout-warn"),
  streak: $("streak"), streakN: $("streak-n"),
};

// ---------- state ----------
export const S = {
  languages: [],
  lang: "en",
  alphabet: new Set(),
  layout: null,
  keyEls: {},
  altBase: {},
  altgrEl: null,
  exercise: null,
  lastStats: null,
  roundSeconds: 0,
  text: "",
  pos: 0,
  busy: false,
  view: "type",
  mode: "learn",
  climb: null,
  freetype: null,
  freetypeList: 0,
  freetypeVariant: "",
  climbLevel: null,
  settings: { length: "words-30", live: false, caret: "line", theme: "dark", streak: false, bg: "off", goal: 0, daily: 15,
    glide: "smooth", sound: "off", volume: "50", rest: "0",
    stop: false, nextKey: true, hand: true, fingerText: true },
  kbHidden: false,
  nextFc: "",
};

// ---------- small helpers ----------
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
export const introOpen = () => !el.intro.classList.contains("hidden") && !el.intro.classList.contains("closing");
export const levelWords = (n) => (S.climb?.levels?.[n - 1] ?? 0).toLocaleString("en");
export const listless = (v) => v === "sentences" || v === "custom";
export const roundList = () => listless(S.freetypeVariant) ? 0 : S.freetypeList;
export const listLabel = (n) => n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : String(n);
export const isTouch = () => matchMedia("(pointer: coarse)").matches;
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
export const reducedMotion = () => motionQuery.matches;
const themeColors = {};
export function themeColor(name) {
  const key = (document.documentElement.dataset.theme || "dark") + name;
  return themeColors[key] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
export function boxState(on, ...names) {
  for (const n of names) {
    el.textBox.classList.toggle(n, on);
    document.body.classList.toggle("tb-" + n, on);
  }
}
export function focusText() {
  if (isTouch() && document.activeElement !== el.input) el.input.focus({ preventScroll: true });
  el.textBox.classList.remove("blurred");
}
