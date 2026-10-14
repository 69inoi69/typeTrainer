// Typing trainer frontend. Plain JavaScript, no frameworks.
//
// Flow:  load layout -> load exercise -> user types (keydown) -> every
// typed position becomes a "sample" {char, errors, ms} -> exercise done ->
// POST samples to /api/v1/results (server updates the model, maybe unlocks
// a letter) -> GET a new exercise built from the updated model.

import { SPLASH_PHRASES, i18nVars, setUiLang, t, applyI18n } from "./i18n.js";
import { FX, Splash } from "./fx.js";
import { $, el, S, store, introOpen, isTouch, focusText } from "./state.js";
import { getJSON, postJSON } from "./api.js";
import { labelTips } from "./tools.js";
import { makeKey, drawKeyboard, applyKb, nearestKb, requestFit } from "./keyboard.js";
import { refreshStats, renderStats } from "./stats.js";
import { fitText, placeCaret, loadExercise, handleChar, backspace, nudge, hideWarn } from "./typing.js";

// the keyboard size switch
el.kbSwitch.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-kb]");
  if (!b) return;
  b.blur();
  const wasHidden = S.kbHidden;
  S.kbHidden = b.dataset.kb === "off";
  if (!S.kbHidden) S.kbSize = Number(b.dataset.kb);
  applyKb(wasHidden !== S.kbHidden);           // fold / unfold only when that changed
  placeCaret(true);
});
window.addEventListener("resize", () => {
  fitText();
  requestFit();
  placeCaret(true);
  if (S.view === "stats") renderStats();
});

// ---------- views: type / stats ----------
function setView(name) {
  S.view = name;
  const stats = name === "stats";
  el.switch.classList.toggle("stats", stats);
  el.tabType.setAttribute("aria-selected", String(!stats));
  el.tabStats.setAttribute("aria-selected", String(stats));
  el.viewType.hidden = stats;
  el.viewStats.hidden = !stats;
  if (stats) {
    refreshStats().catch(console.error);
    renderStats();
  } else {
    fitText();
    requestFit();
    placeCaret(true);
    focusText();
  }
}
el.tabType.addEventListener("click", (e) => { e.currentTarget.blur(); setView("type"); });
el.tabStats.addEventListener("click", (e) => { e.currentTarget.blur(); setView("stats"); });

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
function drawIntroKeys() {
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

function showIntro() {
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
function introKey(e) {
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

// ---------- languages ----------
// The switch is built once; changing language only moves the yellow thumb
// (CSS variable --i), so the slide animation can run.
function buildLangSwitch() {
  el.langSwitch.style.setProperty("--n", S.languages.length);
  el.langSwitch.innerHTML = `<span class="switch-thumb" aria-hidden="true"></span>` +
    S.languages.map((l) => `<button type="button" role="tab" data-lang="${l.id}" title="${l.name}">${l.label}</button>`).join("");
  el.langSwitch.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    b.blur();
    switchLanguage(b.dataset.lang);
  }));
}
function switchLanguage(id) {
  if (S.busy || id === S.lang) return;
  loadLanguage(id).catch((err) => console.error(err));
}
function markLangSwitch() {
  el.langSwitch.style.setProperty("--i", Math.max(0, S.languages.findIndex((l) => l.id === S.lang)));
  el.langSwitch.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.lang === S.lang)));
}

// First choice: what was used last time, else the browser's language, else the first one.
function initialLanguage() {
  const ids = S.languages.map((l) => l.id);
  const saved = store.get("tt.lang");
  if (ids.includes(saved)) return saved;
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  return ids.includes(browser) ? browser : ids[0];
}

async function loadLanguage(id) {
  S.busy = true;
  try {
    S.lang = id;
    store.set("tt.lang", id);
    const info = S.languages.find((l) => l.id === id);
    S.alphabet = new Set(info.alphabet);
    document.documentElement.lang = id;
    setUiLang(id);                        // the interface follows the typing language
    markLangSwitch();
    hideWarn();
    el.live.classList.remove("final");
    S.layout = await getJSON("/layout");
    drawKeyboard();
    drawIntroKeys();                        // the intro shows the home row of this layout
    // switching language: the new keyboard and letters fade in (not at start)
    if (S.languages.length && S.exercise) {
      FX.anim(el.keyboard, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
      FX.anim(el.letters, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    }
    // home-row keys for the intro text ("bumps on F and J" / "on А and О")
    const home = S.layout.rows.flat().filter((k) => k.home).map((k) => k.char.toUpperCase());
    [i18nVars.f, i18nVars.j] = home;
    el.motto.textContent = t(`splash.${S.mottoIndex}`);   // in the interface language
    const row = S.layout.rows[1].map((k) => k.char.toUpperCase());
    i18nVars.l = row.slice(0, 4).join(" ");
    i18nVars.r = row.slice(6, 10).join(" ");
    applyI18n();
    labelTips();
    applyKb();                              // re-translates "off"
    await refreshStats();
    await loadExercise();
    if (S.view === "stats") renderStats();

    if (store.get(`tt.level.${id}`) === "pro" && S.exercise.locked.length && !S.lastStats.sessionCount) {
      // the GitHub Pages version forgets progress on reload: re-apply the choice
      await postJSON("/progress", { unlockAll: true });
      await refreshStats();
      await loadExercise();
    }
  } finally {
    S.busy = false;
  }
}

// ---------- input ----------
// Desktop: keydown gives us the real key. preventDefault stops the character
// from ALSO arriving through the hidden input (and space from scrolling).
document.addEventListener("keydown", (e) => {
  if (introOpen()) { introKey(e); return; }
  if (document.body.classList.contains("splashing")) return;
  // shortcuts: Shift+Tab = type <-> stats, Alt+1...4 = language
  if (e.key === "Tab" && e.shiftKey) {
    e.preventDefault();
    setView(S.view === "type" ? "stats" : "type");
    return;
  }
  const altGr = e.getModifierState?.("AltGraph");
  if (e.altKey && !e.ctrlKey && !e.metaKey && !altGr && /^Digit[1-9]$/.test(e.code)) {
    const l = S.languages[Number(e.code.slice(5)) - 1];
    if (l) { e.preventDefault(); switchLanguage(l.id); }
    return;
  }
  if (S.view !== "type") return;
  if (e.key === "Escape") { e.preventDefault(); newExercise(); return; }
  if (e.key === "Tab") { e.preventDefault(); nudge(); return; }   // no restart, see nudge()
  if (e.key === "Backspace") { e.preventDefault(); focusText(); backspace(e.ctrlKey || e.altKey); return; } // Alt = Option on a Mac
  // AltGr (Polish ą, ę, ...) is reported as Ctrl+Alt on Windows; let it through,
  // but keep real browser shortcuts like Ctrl+R working.
  if ((e.ctrlKey || e.metaKey || e.altKey) && !altGr) return;
  if (e.key.length !== 1) return;                     // Shift, Tab, "Unidentified"...
  e.preventDefault();
  focusText();
  handleChar(e.key);
});

// Phones: virtual keyboards often report "Unidentified" on keydown, so the
// character only shows up here, in the hidden input. We read it and clear it.
// Backspace on a phone keyboard: the input is empty, so it arrives only here.
el.input.addEventListener("beforeinput", (e) => {
  if (e.inputType === "deleteContentBackward") { e.preventDefault(); backspace(false); }
  if (e.inputType === "deleteWordBackward") { e.preventDefault(); backspace(true); }
});
el.input.addEventListener("input", () => {
  for (const ch of el.input.value) handleChar(ch);
  el.input.value = "";
});

el.textBox.addEventListener("click", () => { el.input.focus({ preventScroll: true }); focusText(); });
el.input.addEventListener("blur", () => { if (isTouch()) el.textBox.classList.add("blurred"); });

function newExercise() {
  if (S.busy) return;
  el.live.classList.remove("final");
  loadExercise().catch(console.error);
}
el.btnNew.addEventListener("click", (e) => { e.currentTarget.blur(); newExercise(); });
// ---------- start ----------
(async function init() {
  // interface language for the splash, before the server answers
  const guess = store.get("tt.lang") || (navigator.language || "").slice(0, 2).toLowerCase();
  setUiLang(guess);
  // the small phrase over the logo: the same one the start screen showed
  S.mottoIndex = Math.floor(Math.random() * SPLASH_PHRASES);
  const splash = Splash.start();
  if (splash.phrase !== undefined) S.mottoIndex = splash.phrase;   // the logo keeps the start phrase
  // keyboard size from last time (an old saved 0 meant "hidden")
  const saved = Number(store.get("tt.kbSize") ?? 100) || 0;
  // never chosen yet: hidden on phones (no physical keys to look up), shown elsewhere
  const hiddenSaved = store.get("tt.kbHidden");
  S.kbHidden = hiddenSaved === null ? isTouch() : hiddenSaved === "1" || saved === 0;
  S.kbSize = saved ? nearestKb(saved) : 100;
  applyKb();
  labelTips();
  if (isTouch()) el.textBox.classList.add("blurred"); // phone: tap to open the keyboard
  try {
    S.languages = await getJSON("/languages", true);
    buildLangSwitch();
    await loadLanguage(initialLanguage());
  } catch (err) {
    console.error(err);
    el.text.textContent = t("err.load");
  }
  await splash.done();
  const flash = store.get("tt.flash");                     // set by a finished import
  if (flash) {
    store.set("tt.flash", "");
    FX.toast(t("toast.imported", { n: flash }));
  }
  if (!store.get("tt.introDone") && S.layout) showIntro();   // only the very first visit
})();
