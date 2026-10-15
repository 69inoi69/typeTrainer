// Everything the user does with keys and buttons, sent to the module that
// handles it: keydown and the phone input, the Type / Stats switch, the
// keyboard on / off button, window resize, the "new exercise" button.
// Layer: top. Imports anything; nothing imports it (app.js only loads it).

import { el, S, introOpen, isTouch, focusText } from "./state.js";
import { applyKb, requestFit } from "./keyboard.js";
import { refreshStats, renderStats } from "./stats.js";
import { fitText, placeCaret, handleChar, backspace, nudge, setTyping, stopRound } from "./typing.js";
import { introKey } from "./intro.js";
import { switchLanguage } from "./languages.js";
import { profileOpen, closeProfile } from "./profile.js";
import { resultOpen, closeResult } from "./result.js";
import { tourOpen, tourKey } from "./tour.js";

// the keyboard button and Alt+K: keyboard and hands off, or back on
function toggleKb() {
  S.kbHidden = !S.kbHidden;
  applyKb(true);
  placeCaret(true);
}
el.btnKb.addEventListener("click", (e) => { e.currentTarget.blur(); toggleKb(); });
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

// ---------- input ----------
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
  if (e.key === "Backspace") { e.preventDefault(); focusText(); backspace(e.ctrlKey || e.altKey); return; } // Alt = Option on a Mac
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

el.btnNew.addEventListener("click", (e) => { e.currentTarget.blur(); stopRound(); });
