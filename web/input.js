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

import { applyI18n, t, hasText } from "./i18n.js";
import { $, el, S, introOpen, isTouch, focusText } from "./state.js";
import { applyKb, requestFit } from "./keyboard.js";
import { refreshStats, renderStats, onStatsMode } from "./stats.js";
import { fitText, placeCaret, handleChar, backspace, restartRound, setTyping, stopRound, loadExercise, roundStarted, pauseRound, checkLayout } from "./typing.js";
import { introKey } from "./intro.js";
import { switchLanguage } from "./languages.js";
import { profileOpen, closeProfile } from "./profile.js";
import { resultOpen, closeResult } from "./result.js";
import { tourOpen, tourKey } from "./tour.js";
import { settingsOpen, openSettings, closeSettings, onSettingsClose, onLengthChange, onKbToggle } from "./settings.js";
import { setMode, refreshFreeplay, renderNav } from "./modes.js";
import "./share.js";   // the copy / image buttons of the stats screen: it wires them itself

// the keyboard choice in the settings and Alt+K: keyboard and hands off, or
// back on (never on a touch screen, see restoreKb)
function toggleKb() {
  if (isTouch()) return;
  S.kbHidden = !S.kbHidden;
  applyKb(true);
  placeCaret(true);
}
onKbToggle(toggleKb);
window.addEventListener("resize", () => {
  fitText();
  requestFit();
  placeCaret(true);
  if (S.view === "stats") { el.viewStats.classList.remove("grow"); renderStats(); }   // a resize redraws without the opening animation
});

// ---------- screens: typing / stats ----------
function setView(name) {
  S.view = name;
  document.body.dataset.view = name;          // style.css hides the typing shortcuts on stats
  const stats = name === "stats";
  renderNav();
  el.viewType.hidden = stats;
  el.viewStats.hidden = !stats;
  el.viewStats.classList.toggle("grow", stats);   // the stats open with their animation (style.css #view-stats.grow)
  if (stats) {
    setTyping(false);                          // the header comes back
    refreshStats().catch(console.error);
    renderStats();
  } else {
    fitText();
    requestFit();
    placeCaret(true);
    // back on a result that is still open: no phone keyboard until "Next
    // round" (owner, 2026-10-16)
    if (!resultOpen()) focusText();
  }
}
el.tabStats.addEventListener("click", (e) => { e.currentTarget.blur(); setView("stats"); });

// ---------- modes: type (learning) / freetype (free practice) ----------
// While freetype is locked, its tab starts the typing test (modes.js).
// A new mode starts a new round; a round already begun is dropped, as when
// the language changes (learning keeps every portion sent so far).
// The stats screen can switch the mode too (its own small switch, stats.js):
// then it stays on the stats screen.
// The result screen stays open until "new round", and the round counts as
// busy until then. Going to another mode from there closes the result: the
// ending round then loads its next text, already in the new mode. (Before,
// the tabs ignored every click while a result was open somewhere.)
function chooseMode(m, stay = false) {
  if (m === "free" && !S.free?.unlocked) m = "test";
  if (m !== S.mode) {
    if (resultOpen()) {
      setMode(m);
      el.live.classList.remove("final");
      closeResult();                         // the round ends and loads the next text itself
    } else if (S.busy) {
      return;                                // a round is being saved right now: a moment
    } else {
      setMode(m);
      el.live.classList.remove("final");
      loadExercise().catch(console.error);
    }
  }
  if (stay && m !== "test") renderStats();
  else if (S.view !== "type") setView("type");
}
el.tabLearn.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("learn"); });
el.tabFree.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("free"); });
onStatsMode((m) => chooseMode(m, true));

// ---------- help: the two guides, how the trainer works, the keys ----------
// The guide buttons themselves are wired by intro.js (#btn-intro) and
// tour.js (#btn-tour); here the panel only opens and closes.
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
  fillHelp();
  applyI18n(helpCard);                        // fills {target} with the current goal
  helpCard.hidden = false;
  helpBtn.setAttribute("aria-expanded", "true");
});
// The first section is about the screen you are on: help.<screen>.title and
// its points help.<screen>.1, .2, ... (i18n.js). The tour shows the parts of
// the Learn screen, so it is offered only there.
// To add help for a new screen: its keys in i18n.js and its name here.
function fillHelp() {
  const screen = S.view === "stats" ? "stats" : S.mode;   // learn | free | test
  $("help-ctx-title").textContent = t(`help.${screen}.title`);
  const items = [];
  for (let i = 1; hasText(`help.${screen}.${i}`); i++) items.push(`<li>${t(`help.${screen}.${i}`)}</li>`);
  $("help-ctx").innerHTML = items.join("");
  $("btn-tour").hidden = screen !== "learn";
}
helpCard.addEventListener("click", (e) => { if (e.target.closest(".menu-item")) closeHelp(); });
// Both guides are about the typing screen (the tour points at its parts), so
// from the stats screen a guide first goes back there. Capture phase: this
// runs before the guide's own click handler (intro.js, tour.js) starts it.
helpCard.addEventListener("click", (e) => {
  if (e.target.closest(".menu-item") && S.view !== "type") setView("type");
}, true);
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
  // the settings window and the reset confirm window handle their own keys
  if (document.querySelector("dialog[open]")) return;
  if (introOpen()) { introKey(e); return; }
  if (tourOpen()) { tourKey(e); return; }
  // the profile card is open: keys go to its name field, Esc closes it
  if (profileOpen()) {
    if (e.key === "Escape") { e.preventDefault(); closeProfile(); }
    return;
  }
  if (document.body.classList.contains("splashing")) return;
  // the help menu: Esc closes it, typing closes it and goes on
  if (helpOpen()) {
    closeHelp();
    if (e.key === "Escape") { e.preventDefault(); helpBtn.focus(); return; }
  }
  // Esc opens the settings, on every screen (as on monkeytype). A round
  // being typed stops first, the same as before (owner, 2026-10-17): its
  // result waits behind the window.
  if (e.key === "Escape") {
    e.preventDefault();
    if (S.view === "type" && !resultOpen() && roundStarted()) stopRound();
    openSettings();
    return;
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
  // the result screen stays until you go on on purpose: Enter or Tab (Tab
  // starts a new round everywhere, as on monkeytype). Esc opens the settings
  // (above), never "next round" (owner, 2026-10-16: that was confusing);
  // letters do nothing either, so a word typed past the end never skips the
  // result.
  if (resultOpen()) {
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); closeResult(); }
    else if (e.key.length === 1) e.preventDefault();
    return;
  }
  if (S.view !== "type") return;
  if (e.key === "Tab") { e.preventDefault(); restartRound(); return; }   // a fresh round, see restartRound()
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

// Alt+Tab, another app, a hidden tab: a round being typed pauses
// (typing.js pauseRound); the first key back goes on with it.
addEventListener("blur", pauseRound);
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseRound(); else checkLayout(); });
addEventListener("focus", checkLayout);    // the layout may have been switched in another window

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

// A tap on the text window opens the phone keyboard, but not while the
// result is shown (its sides are part of the window too), and not when the
// tap only closed a panel (help, settings, profile): checked at pointerdown,
// in the capture phase, before those panels close themselves.
let tapClosedPanel = false;
// after the settings window: straight back to typing (not on a phone, where
// that would open the on-screen keyboard)
onSettingsClose(() => { if (S.view === "type" && !resultOpen() && !isTouch()) focusText(); });
document.addEventListener("pointerdown", () => {
  tapClosedPanel = helpOpen() || settingsOpen() || profileOpen();
}, true);
el.textBox.addEventListener("click", () => {
  if (resultOpen() || tapClosedPanel) return;
  el.input.focus({ preventScroll: true }); focusText();
});
el.input.addEventListener("blur", () => { if (isTouch()) el.textBox.classList.add("blurred"); });

el.btnNew.addEventListener("click", (e) => { e.currentTarget.blur(); stopRound(); });
