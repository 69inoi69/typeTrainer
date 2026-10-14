// The short hands-on intro of the first visit (home row, space, fingers) and
// "open all letters" for people who can already touch type.
// Layer: middle. Imports the bottom layer, keyboard.js, stats.js, typing.js.

import { FX } from "./fx.js";
import { $, el, S, store, introOpen, focusText } from "./state.js";
import { postJSON } from "./api.js";
import { makeKey } from "./keyboard.js";
import { refreshStats } from "./stats.js";
import { loadExercise } from "./typing.js";
import { maybeStartTour } from "./tour.js";

// ---------- intro ----------
// Shown once, on the very first visit (it can be reopened with the "?" button).
// It is a short hands-on start, not a text to read: steps 0 and 1 wait for the
// real keys. We look at the PHYSICAL key (e.code), so it works whatever the
// system layout is: "KeyA" is the key under the left pinky on every keyboard.
const HOME_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"];
const HOME_INDEX = [0, 1, 2, 3, 6, 7, 8, 9];   // positions of those keys in the home row
const INTRO_LAST = 3;
let introStep = 0;
let introKeys = {};        // e.code -> key element in the intro home row
let introPressed = new Set();

// The home row of the current layout (A S D F · J K L ; / Ф Ы В А · О Л Д Ж).
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
  // a copy of the hands for step 2, with the fingers lighting up one by one
  $("intro-hands").innerHTML = el.hands.innerHTML;
  $("intro-hands").querySelectorAll("[data-f]").forEach((f, i) => {
    f.classList.remove("on");
    f.style.setProperty("--d", i);       // animation delay: finger after finger
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
// Advance after the key's little "pressed" animation has finished.
function advanceAfter(node) {
  const a = node.animate?.([{ scale: "1" }, { scale: "1.15" }, { scale: "1" }], { duration: 260, easing: "ease-out" });
  const step = introStep;
  const go = () => { if (introStep === step) nextIntroStep(); };
  if (a) a.finished.then(go, go); else go();
}
// Key presses while the intro is open.
export function introKey(e) {
  if (e.key === "Escape") { e.preventDefault(); closeIntro(); return; }
  if (introStep === INTRO_LAST || e.key === "Tab") return; // Enter/Tab work on the buttons
  if (["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock"].includes(e.key)) return;
  e.preventDefault();
  if (introStep === 0) {
    const key = introKeys[e.code];
    if (!key) return;
    key.classList.add("hit");
    FX.anim(key, [{ transform: "translateY(2px) scale(.92)" }, { transform: "none" }], { duration: 160 });
    introPressed.add(e.code);
    if (introPressed.size === HOME_CODES.length) advanceAfter($("intro-home"));
  } else if (introStep === 1) {
    if (e.code !== "Space") return;
    $("intro-space").classList.add("hit");
    advanceAfter($("intro-space"));
  } else {
    nextIntroStep();
  }
}

// unlockAll: true = "I can already touch type", false = "Start",
// undefined = closed with skip / Esc (nothing changes).
async function closeIntro(unlockAll) {
  if (!introOpen() || el.intro.classList.contains("closing")) return;
  el.intro.classList.add("closing");             // fade out, then hide
  FX.fadeOut(el.intro).then(() => el.intro.classList.add("hidden"), () => {}).finally(() => el.intro.classList.remove("closing"));
  store.set("tt.introDone", "1");
  if (unlockAll) {
    await openAllLetters();
  } else if (unlockAll === false && store.get(`tt.level.${S.lang}`) === "pro") {
    // reopened the intro and chose to start small after all
    store.set(`tt.level.${S.lang}`, "new");
    try {
      await postJSON("/progress", { unlockAll: false });
      await refreshStats();
      await loadExercise();
    } catch (err) { console.error(err); }
  }
  focusText();
  maybeStartTour();                              // first visit: the tour of the page comes next
}
$("intro-next").addEventListener("click", (e) => { e.currentTarget.blur(); nextIntroStep(); });
$("intro-skip").addEventListener("click", () => closeIntro());
$("intro-new").addEventListener("click", () => closeIntro(false));
$("intro-pro").addEventListener("click", () => closeIntro(true));
el.btnIntro.addEventListener("click", (e) => { e.currentTarget.blur(); showIntro(); });

// "Already touch typing? open all letters": every letter of this language
// opens at once. Remembered per language (the Pages version forgets progress
// on reload, so loadLanguage applies it again).
async function openAllLetters() {
  store.set(`tt.level.${S.lang}`, "pro");
  try {
    await postJSON("/progress", { unlockAll: true });
    await refreshStats();
    await loadExercise();
    FX.burstFrom(el.letters, 60);
  } catch (err) { console.error(err); }
}
el.lettersCaption.addEventListener("click", (e) => {
  if (e.target.id !== "open-all" || S.busy) return;
  e.target.blur();
  openAllLetters().then(focusText);
});
