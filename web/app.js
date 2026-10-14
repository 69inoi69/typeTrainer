// Typing trainer frontend. Plain JavaScript, no frameworks.
//
// Flow:  load layout -> load exercise -> user types (keydown) -> every
// typed position becomes a "sample" {char, errors, ms} -> exercise done ->
// POST samples to /api/v1/results (server updates the model, maybe unlocks
// a letter) -> GET a new exercise built from the updated model.

import { SPLASH_PHRASES, setUiLang, t } from "./i18n.js";
import { FX, Splash } from "./fx.js";
import { el, S, store, introOpen, isTouch, focusText } from "./state.js";
import { getJSON } from "./api.js";
import { labelTips } from "./tools.js";
import { applyKb, nearestKb, requestFit } from "./keyboard.js";
import { refreshStats, renderStats } from "./stats.js";
import { fitText, placeCaret, loadExercise, handleChar, backspace, nudge } from "./typing.js";
import { showIntro, introKey } from "./intro.js";
import { buildLangSwitch, switchLanguage, initialLanguage, loadLanguage } from "./languages.js";

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
