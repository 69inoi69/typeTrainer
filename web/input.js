// Everything the user does with keys and buttons, sent to the module that
// handles it: keydown and the phone input, the navigation (Type / Stats,
// learning / free practice, the help menu), the keyboard on / off choice of
// the settings, window resize, the "stop" button of touch screens.
// Layer: top. Imports anything; nothing imports it (app.js only loads it).
// It holds almost no logic of its own: it decides WHO gets an action (an
// open guide, a card, the result screen, or typing) and calls that module.
// To add a navigation item: a button in nav.rail (index.html, with an icon,
// a <small> label and data-tip), its texts in i18n.js, and its click here
// (the "views", "modes" and "help" sections below are the pattern).

import { $, el, S, introOpen, isTouch, focusText } from "./state.js";
import { applyKb, requestFit } from "./keyboard.js";
import { refreshStats, renderStats } from "./stats.js";
import { fitText, placeCaret, handleChar, backspace, nudge, setTyping, stopRound, loadExercise, roundStarted } from "./typing.js";
import { introKey } from "./intro.js";
import { switchLanguage } from "./languages.js";
import { profileOpen, closeProfile } from "./profile.js";
import { resultOpen, closeResult } from "./result.js";
import { tourOpen, tourKey } from "./tour.js";
import { settingsOpen, closeSettings, onLengthChange, onKbToggle } from "./settings.js";
import { setMode, refreshFreeplay } from "./modes.js";

// the keyboard choice in the settings and Alt+K: keyboard and hands off, or back on
function toggleKb() {
  S.kbHidden = !S.kbHidden;
  applyKb(true);
  placeCaret(true);
}
onKbToggle(toggleKb);
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
    setTyping(false);                          // the header comes back
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

// ---------- modes: learning / free practice ----------
// While free practice is locked, its tab starts the typing test (modes.js).
// A new mode starts a new round; a round already begun is dropped, as when
// the language changes (learning keeps every portion sent so far).
function chooseMode(m) {
  if (S.busy) return;
  if (m === "free" && !S.free?.unlocked) m = "test";
  if (m === S.mode) return;
  setMode(m);
  el.live.classList.remove("final");
  if (m === "test" && S.view !== "type") setView("type");
  if (S.view === "stats") renderStats();
  loadExercise().catch(console.error);
}
el.tabLearn.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("learn"); });
el.tabFree.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("free"); });

// ---------- help: a small menu with the two guides ----------
// The menu items themselves are wired by intro.js (#btn-intro) and tour.js
// (#btn-tour); here the menu only opens and closes.
const help = $("help"), helpBtn = $("btn-help"), helpCard = $("help-card");
const helpOpen = () => !helpCard.hidden;
function closeHelp() {
  helpCard.hidden = true;
  helpBtn.setAttribute("aria-expanded", "false");
}
helpBtn.addEventListener("click", () => {
  helpBtn.blur();
  if (helpOpen()) { closeHelp(); return; }
  closeSettings();
  helpCard.hidden = false;
  helpBtn.setAttribute("aria-expanded", "true");
});
helpCard.addEventListener("click", (e) => { if (e.target.closest(".menu-item")) closeHelp(); });
document.addEventListener("pointerdown", (e) => { if (helpOpen() && !help.contains(e.target)) closeHelp(); });
$("btn-settings").addEventListener("click", closeHelp);   // one panel at a time

// ---------- settings: a new round length ----------
// The stats follow the new length; a round not started yet is rebuilt with
// it (a round already begun keeps its length to the end). The test always
// has its own length.
onLengthChange(() => {
  refreshStats().catch(console.error);
  refreshFreeplay().then(() => { if (S.view === "stats") renderStats(); }).catch(console.error);
  if (!roundStarted() && !S.busy && S.mode !== "test") loadExercise().catch(console.error);
});

// ---------- input ----------
// The order of the checks matters: an open guide or card gets the key first,
// then the shortcuts, then the result screen, and only then typing.
// Desktop: keydown gives us the real key. preventDefault stops the character
// from ALSO arriving through the hidden input (and space from scrolling).
document.addEventListener("keydown", (e) => {
  if (introOpen()) { introKey(e); return; }
  if (tourOpen()) { tourKey(e); return; }
  // the profile card is open: keys go to its name field, Esc closes it
  if (profileOpen()) {
    if (e.key === "Escape") { e.preventDefault(); closeProfile(); }
    return;
  }
  if (document.body.classList.contains("splashing")) return;
  // the settings panel or the help menu: Esc closes it, typing closes it and goes on
  if (settingsOpen() || helpOpen()) {
    const was = helpOpen() ? helpBtn : null;
    closeSettings();
    closeHelp();
    if (e.key === "Escape") { e.preventDefault(); was?.focus(); return; }
  }
  // shortcuts: Shift+Tab = type <-> stats, Alt+1...4 = language, Alt+K = keyboard on / off
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
  if (e.altKey && !e.ctrlKey && !e.metaKey && !altGr && e.code === "KeyK") {   // e.code: any system layout
    e.preventDefault();
    toggleKb();
    return;
  }
  // the result screen: any key (not a lone modifier) goes on to the next text
  if (resultOpen()) {
    if (["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Tab"].includes(e.key)) return;
    e.preventDefault();
    closeResult();
    return;
  }
  if (S.view !== "type") return;
  if (e.key === "Escape") { e.preventDefault(); stopRound(); return; }
  if (e.key === "Tab") { e.preventDefault(); nudge(); return; }   // no restart, see nudge()
  if (e.key === "Backspace") {                                    // Alt = Option on a Mac
    e.preventDefault(); focusText(); backspace(e.ctrlKey || e.altKey);
    keyBackspace = true;                     // a phone may delete the sentinel too: not twice
    requestAnimationFrame(() => { keyBackspace = false; });
    return;
  }
  // A held key repeats every ~30 ms. Those are not finger movements: if the
  // next letter is the same ("ll") a repeat would count as a super fast press.
  if (e.repeat) { e.preventDefault(); return; }
  // AltGr (Polish ą, ę, ...) is reported as Ctrl+Alt on Windows; let it through,
  // but keep real browser shortcuts like Ctrl+R working.
  if ((e.ctrlKey || e.metaKey || e.altKey) && !altGr) return;
  if (e.key.length !== 1) return;                     // Shift, Tab, "Unidentified"...
  e.preventDefault();
  focusText();
  handleChar(e.key);
});

// Phones: virtual keyboards often report "Unidentified" on keydown, so the
// character only shows up here, in the hidden input.
// Backspace: many phone keyboards (Gboard, SwiftKey, Samsung) send nothing
// at all for Backspace in an EMPTY field: no key, no input event. So the
// field always holds one "sentinel" character (a space, as on monkeytype):
// Backspace deletes it, the field gets shorter, and that is our Backspace.
// After every change the field is set back to just the sentinel.
const SENTINEL = " ";
let keyBackspace = false;    // keydown already did this Backspace (some phones send both)
function resetInput() {
  el.input.value = SENTINEL;
  try { el.input.setSelectionRange(SENTINEL.length, SENTINEL.length); } catch { /* not focused */ }
}
el.input.addEventListener("input", (e) => {
  const v = el.input.value;
  if (v.length < SENTINEL.length) {
    if (!keyBackspace) backspace(e.inputType === "deleteWordBackward");
  } else {
    for (const ch of v.startsWith(SENTINEL) ? v.slice(SENTINEL.length) : v) handleChar(ch);
  }
  keyBackspace = false;
  resetInput();
});
el.input.addEventListener("focus", resetInput);
resetInput();

el.textBox.addEventListener("click", () => { el.input.focus({ preventScroll: true }); focusText(); });
el.input.addEventListener("blur", () => { if (isTouch()) el.textBox.classList.add("blurred"); });

el.btnNew.addEventListener("click", (e) => { e.currentTarget.blur(); stopRound(); });
