// Everything the user does with keys and buttons, sent to the module that
// handles it: keydown and the phone input, the navigation (Type / Stats,
// learn / climb / freetype, the round bar), the keyboard on / off choice of
// the settings, window resize, the "stop" button of touch screens.
// Layer: top. Imports anything; nothing imports it (app.js only loads it).
// It holds almost no logic of its own: it decides WHO gets an action (an
// open guide, a card, the result screen, or typing) and calls that module.
// To add a navigation item: a button in nav.rail (index.html, with an icon,
// a <small> label and data-tip), its texts in i18n.js, and its click here
// (the "views" and "modes" sections below are the pattern).

import { $, el, S, introOpen, isTouch, focusText } from "./state.js";
import { applyKb, requestFit, highlightNextKey } from "./keyboard.js";
import { refreshStats, renderStats, resetStatsPick } from "./stats.js";
import { fitText, placeCaret, handleChar, backspace, restartRound, setTyping, loadExercise, roundStarted, pauseRound, checkLayout } from "./typing.js";
import { checkCaps } from "./warn.js";
import { introKey } from "./intro.js";
import { switchLanguage } from "./languages.js";
import { profileOpen, closeProfile } from "./profile.js";
import { resultOpen, closeResult, settleResult } from "./result.js";
import { settingsOpen, openSettings, onSettingsClose, onKbToggle, onGoalChange, onBgChange, onTypingLook, onSoundPick, setLength } from "./settings.js";
import { setMode, refreshFreeplay, renderNav, setFreetypeList, setFreetypeVariant, toggledVariant } from "./modes.js";
import { openCustomText, hasCustomText } from "./customtext.js";
import { onBarPick, renderModeBar } from "./modebar.js";
import { renderLetters } from "./letters.js";
import { buildAmbient } from "./ambient.js";
import { renderPanel } from "./learnpanel.js";
import { keySound } from "./sound.js";
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
  buildAmbient();
  fitText();
  requestFit();
  placeCaret(true);
  if (S.view === "stats") { el.viewStats.classList.remove("grow"); renderStats(); }   // a resize redraws without the opening animation
});

// ---------- screens: typing / stats ----------
// Phones and tablets (a touch screen, no mouse) get only the stats and the
// account (owner, 2026-10-18): the trainer teaches ten-finger typing on a
// real keyboard, and thumbs on glass would only skew the letter model. The
// typing screen and the navigation are not shown there (layout.css
// body.stats-only), and every way to the typing screen lands on the stats.
const statsOnly = isTouch();
document.body.classList.toggle("stats-only", statsOnly);
// The first screen, once the language is loaded (app.js): the stats on a
// touch screen; elsewhere the typing screen is already there.
export function startView() {
  if (statsOnly) setView("stats");
}
// The stats open with their animation (stats.css #view-stats.grow) only
// when they have something new since they were last shown (a round, another
// mode or length); switching back and forth plays nothing again (owner,
// 2026-10-18).
let statsSeen = "";
function setView(name) {
  if (statsOnly) name = "stats";
  S.view = name;
  document.body.dataset.view = name;          // layout.css hides the typing shortcuts on stats
  const stats = name === "stats";
  renderNav();
  if (stats) settleResult();                   // a result left open keeps its final look
  el.viewType.hidden = stats;
  el.viewStats.hidden = !stats;
  const seen = JSON.stringify([S.mode, S.settings.length, S.lastStats?.sessionCount, S.climb?.sessionCount, S.freetype?.sessionCount, S.freetypeList]);
  el.viewStats.classList.toggle("grow", stats && seen !== statsSeen);
  if (stats) statsSeen = seen;
  if (stats) {
    resetStatsPick();                          // the mode, list and length of the typing screen
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

// ---------- modes: learn / climb / freetype ----------
// A new mode starts a new round; a round already begun is dropped, as when
// the language changes (learning keeps every portion sent so far).
// The result screen stays open until "new round", and the round counts as
// busy until then. Going to another mode from there closes the result: the
// ending round then loads its next text, already in the new mode. (Before,
// the tabs ignored every click while a result was open somewhere.)
function chooseMode(m) {
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
  if (S.view !== "type") setView("type");
}
el.tabLearn.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("learn"); });
el.tabClimb.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("climb"); });
el.tabFreetype.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("freetype"); });
// The round bar above the text (modebar.js): Freetype's word list or kind
// of text, Climb's level or the mode's round length. Either starts a new
// round, as a new mode does (a round already begun is dropped), and the
// stats follow. Your own text with nothing saved yet, or "edit": the
// editor first, the round after a save.
async function barPick(pick) {
  if (S.busy && !resultOpen()) return;          // a round is being saved right now: a moment
  if (pick.edit || (pick.toggle === "custom" && S.freetypeVariant !== "custom" && !hasCustomText())) {
    openCustomText(() => barPick({ variant: "custom" }).catch(console.error));
    return;
  }
  if (pick.toggle) pick.variant = toggledVariant(S.freetypeVariant, pick.toggle);
  if (pick.variant !== undefined) await setFreetypeVariant(pick.variant);
  if (pick.list) await setFreetypeList(pick.list);
  if (pick.level) { S.climbLevel = pick.level; renderLetters(); }
  if (pick.length) {
    setLength(S.mode, pick.length);
    await Promise.all([refreshStats(), refreshFreeplay()]);
  }
  renderModeBar();
  el.live.classList.remove("final");
  if (resultOpen()) closeResult();              // the ending round loads the next text itself
  else loadExercise().catch(console.error);
}
onBarPick(barPick);


// another background in the settings: drawn again at once
onBgChange(buildAmbient);
// a new text size: the text and the keyboard fit the window again; the
// next key lit or not
onTypingLook(() => {
  fitText();
  requestFit();
  placeCaret(true);
  highlightNextKey();
});
// a sound was chosen: one of it, so you hear what you picked
onSoundPick((mode) => keySound(mode !== "errors", mode));

// a new personal goal: only the stats screen shows it
onGoalChange(() => {
  renderPanel();
  if (S.view === "stats") { el.viewStats.classList.remove("grow"); renderStats(); }
});

// ---------- input ----------
// The order of the checks matters: an open guide or card gets the key first,
// then the shortcuts, then the result screen, and only then typing.
// Desktop: keydown gives us the real key. preventDefault stops the character
// from ALSO arriving through the hidden input (and space from scrolling).
document.addEventListener("keydown", (e) => {
  // the settings window and the reset confirm window handle their own keys,
  if (document.querySelector("dialog[open]")) return;
  if (introOpen()) { introKey(e); return; }
  // the profile card is open: keys go to its name field, Esc closes it
  if (profileOpen()) {
    if (e.key === "Escape") { e.preventDefault(); closeProfile(); }
    return;
  }
  if (document.body.classList.contains("splashing")) return;
  // Esc opens the settings, on every screen (as on monkeytype). A round
  // being typed pauses behind the window and goes on with the first key
  // after it (owner, 2026-10-22: Esc used to end the round, which nobody
  // could tell from "settings").
  if (e.key === "Escape") {
    e.preventDefault();
    if (S.view === "type" && !resultOpen() && roundStarted()) pauseRound();
    openSettings();
    return;
  }
  // shortcuts: Shift+Tab = type <-> stats, Alt+1...4 = language, Alt+K = keyboard on / off
  // (the line at the bottom of the page, index.html .hints, lists them)
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
// Caps Lock is known from any key or mouse move, before a letter is typed
for (const ev of ["keydown", "keyup", "mousemove", "mousedown"]) addEventListener(ev, checkCaps, { passive: true });

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
// tap only closed a panel (settings, profile): checked at pointerdown,
// in the capture phase, before those panels close themselves.
let tapClosedPanel = false;
// after the settings window: straight back to typing (not on a phone, where
// that would open the on-screen keyboard)
onSettingsClose(() => { if (S.view === "type" && !resultOpen() && !isTouch()) focusText(); });
document.addEventListener("pointerdown", () => {
  tapClosedPanel = settingsOpen() || profileOpen();
}, true);
el.textBox.addEventListener("click", () => {
  if (resultOpen() || tapClosedPanel) return;
  el.input.focus({ preventScroll: true }); focusText();
});
el.input.addEventListener("blur", () => { if (isTouch()) el.textBox.classList.add("blurred"); });

