// The modes of the trainer and the learning / free switch in the navigation
// (nav.rail in index.html; its clicks are handled in input.js):
//   learn - the adaptive trainer (internal/engine): the core of the thesis;
//   free  - free practice (internal/freeplay): words from the whole list,
//           its own history, nothing goes into the letter statistics;
//   test  - the one-time typing test: one round that, if passed, opens free
//           practice for this language before every letter is unlocked.
// Free practice opens when every letter is unlocked in learning, or after the
// test is passed (the server decides: GET /freeplay/stats -> unlocked). The
// chosen mode is remembered per language in this browser (tt.mode.<lang>);
// the test is never remembered, a reload goes back to learning.
// Layer: middle. Imports the bottom layer and keyboard.js.
// Called by: languages.js (refreshFreeplay, restoreMode on a language
// change), input.js (setMode on a click), typing.js (learning() to choose
// the routes, setMode after the test), letters.js (learning()).

import { i18nVars, t } from "./i18n.js";
import { $, el, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { restoreKb } from "./keyboard.js";

const sw = $("mode-switch");

// Is the current mode learning (the adaptive trainer)?
export const learning = () => S.mode === "learn";

// Free practice of this language: is it open, its history, the test rules.
export async function refreshFreeplay() {
  S.free = await getJSON(`/freeplay/stats?length=${S.settings.length}`);   // rounds of the chosen length
  i18nVars.testWpm = S.free.testWpm;          // used by the tooltip of the locked tab
  i18nVars.testAcc = S.free.testAccuracy;
  if (S.mode === "free" && !S.free.unlocked) { S.mode = "learn"; restoreKb(); }   // locked again (reset)
  renderModes();
}

// The mode saved for this language (after refreshFreeplay).
export function restoreMode() {
  S.mode = store.get(`tt.mode.${S.lang}`) === "free" && S.free?.unlocked ? "free" : "learn";
  restoreKb();                                  // each mode has its own keyboard on / off
  renderModes();
}

// Switches to mode m ("learn", "free" or "test") and remembers it for this
// language (not the test). The caller starts the new round.
export function setMode(m) {
  S.mode = m;
  if (m !== "test") store.set(`tt.mode.${S.lang}`, m);
  restoreKb(true);
  renderModes();
}

// The switch: "learning | free"; the test belongs to the free tab (it is the
// way in). A lock on the free tab while it is closed.
function renderModes() {
  const free = S.mode !== "learn";
  sw.classList.toggle("second", free);
  el.tabLearn.setAttribute("aria-selected", String(!free));
  el.tabFree.setAttribute("aria-selected", String(free));
  const open = !!S.free?.unlocked;
  el.tabFree.classList.toggle("locked", !open);
  el.tabFree.dataset.tip = open ? "tip.free" : "tip.freeLocked";
  el.tabFree.setAttribute("aria-label", t(el.tabFree.dataset.tip));
  document.body.dataset.mode = S.mode;        // style.css hides what a mode does not use
}
