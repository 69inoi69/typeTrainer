// The touch typing basics guide.

import { FX } from "./fx.js";
import { $, el, S, store, introOpen, focusText } from "./state.js";
import { makeKey } from "./keyboard.js";

// ---------- intro ----------
const HOME_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"];
const HOME_INDEX = [0, 1, 2, 3, 6, 7, 8, 9];
const STEP_HOME = 1, STEP_SPACE = 2, INTRO_LAST = 4;
let introStep = 0;
let introKeys = {};
let introPressed = new Set();

export function drawIntroKeys() {
  const row = S.layout.rows[1];
  const home = $("intro-home");
  home.innerHTML = "";
  introKeys = {};
  HOME_INDEX.forEach((idx, i) => {
    const key = makeKey(row[idx]);
    if (i === 4) home.appendChild(Object.assign(document.createElement("span"), { className: "gap" }));
    home.appendChild(key);
    introKeys[HOME_CODES[i]] = key;
  });
  const map = $("intro-map");
  map.innerHTML = "";
  S.layout.rows.slice(0, 3).forEach((r, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row";
    rowEl.style.paddingLeft = `calc(var(--u) * ${S.layout.offsets?.[i] ?? 0})`;
    for (const k of r) rowEl.appendChild(makeKey(k));
    map.appendChild(rowEl);
  });
  $("intro-hands").innerHTML = el.hands.innerHTML;
  $("intro-hands").querySelectorAll("[data-f]").forEach((f, i) => {
    f.classList.remove("on");
    f.style.setProperty("--d", i);
  });
}

export function showIntro() {
  introStep = 0;
  introPressed = new Set();
  Object.values(introKeys).forEach((k) => k.classList.remove("hit"));
  $("intro-space").classList.remove("hit");
  const info = S.languages.find((l) => l.id === S.lang);
  $("intro-lang").textContent = info ? " · " + info.name : "";
  renderIntro();
  el.intro.classList.remove("hidden");
  document.activeElement?.blur();
}
function renderIntro() {
  document.querySelectorAll(".intro-step").forEach((s, i) => s.classList.toggle("active", i === introStep));
  document.querySelectorAll("#intro-dots i").forEach((d, i) => d.classList.toggle("on", i === introStep));
  const last = introStep === INTRO_LAST;
  $("intro-next").style.visibility = last ? "hidden" : "visible";
  $("intro-skip").style.visibility = last ? "hidden" : "visible";
  if (last) $("intro-new").focus();
}
function nextIntroStep() {
  if (introStep >= INTRO_LAST) return;
  introStep++;
  renderIntro();
}
function prevIntroStep() {
  if (introStep <= 0) return;
  introStep--;
  renderIntro();
}
function advanceAfter(node) {
  const a = node.animate?.([{ scale: "1" }, { scale: "1.15" }, { scale: "1" }], { duration: 260, easing: "ease-out" });
  const step = introStep;
  const go = () => { if (introStep === step) nextIntroStep(); };
  if (a) a.finished.then(go, go); else go();
}
export function introKey(e) {
  if (e.key === "Escape") { e.preventDefault(); closeIntro(); return; }
  const home = introStep === STEP_HOME;
  const back = e.key === "ArrowLeft" || (!home && e.code === "KeyA");
  const on = e.key === "ArrowRight" || (!home && e.code === "KeyD");
  if (back || on) {
    e.preventDefault();
    if (back) prevIntroStep(); else nextIntroStep();
    return;
  }
  if (introStep === INTRO_LAST || e.key === "Tab") return;
  if (["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock"].includes(e.key)) return;
  e.preventDefault();
  if (introStep === STEP_HOME) {
    const key = introKeys[e.code];
    if (!key) return;
    key.classList.add("hit");
    FX.anim(key, [{ transform: "translateY(2px) scale(.92)" }, { transform: "none" }], { duration: 160 });
    introPressed.add(e.code);
    if (introPressed.size === HOME_CODES.length) advanceAfter($("intro-home"));
  } else if (introStep === STEP_SPACE) {
    if (e.code !== "Space") return;
    $("intro-space").classList.add("hit");
    advanceAfter($("intro-space"));
  } else {
    nextIntroStep();
  }
}

function closeIntro() {
  if (!introOpen() || el.intro.classList.contains("closing")) return;
  el.intro.classList.add("closing");
  FX.fadeOut(el.intro).then(() => el.intro.classList.add("hidden"), () => {}).finally(() => el.intro.classList.remove("closing"));
  store.set("tt.introDone", "1");
  focusText();
}
$("intro-next").addEventListener("click", (e) => { e.currentTarget.blur(); nextIntroStep(); });
$("intro-skip").addEventListener("click", () => closeIntro());
$("intro-new").addEventListener("click", () => closeIntro());
