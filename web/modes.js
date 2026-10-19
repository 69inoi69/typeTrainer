// The two modes of the trainer and the navigation tabs that show them
// (nav.rail in index.html; the clicks are handled in input.js):
//   learn - for beginners: the adaptive trainer (internal/engine), letters
//           open one by one; its progress is the letters row, no stats;
//   free  - Climb, for people who can already type (internal/freeplay):
//           the text gets harder while you type well and easier when you
//           struggle (a level, 1 to 100); the stats screen is Climb's.
// Both are always open. The chosen mode is remembered per language in this
// browser (tt.mode.<lang>). (In the code the second mode keeps its first
// name, "free", from when it was free practice.)
// Layer: middle. Imports the bottom layer and keyboard.js.
// Called by: languages.js (refreshFreeplay, restoreMode on a language
// change), input.js (setMode and renderNav on a click), typing.js
// (learning() to choose the routes), letters.js (learning()).

import { el, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { restoreKb } from "./keyboard.js";

// Is the current mode learning (the adaptive trainer)?
export const learning = () => S.mode === "learn";

// Climb's history and level in this language.
export async function refreshFreeplay() {
  S.free = await getJSON(`/freeplay/stats?length=${S.settings.length}`);   // rounds of the chosen length
  renderNav();
}

// The mode saved for this language.
export function restoreMode() {
  S.mode = store.get(`tt.mode.${S.lang}`) === "free" ? "free" : "learn";
  restoreKb();                                  // each mode has its own keyboard on / off
  renderNav();
}

// Switches to mode m ("learn" or "free") and remembers it for this
// language. The caller starts the new round.
export function setMode(m) {
  S.mode = m;
  store.set(`tt.mode.${S.lang}`, m);
  restoreKb(true);
  renderNav();
}

// The navigation tabs: "stats" on the stats screen, else the tab of the
// mode. The stats are Climb's in either mode (stats.js): learning has no
// stats screen of its own, its progress is the letters row.
export function renderNav() {
  const i = S.view === "stats" ? 2 : S.mode === "learn" ? 0 : 1;
  el.nav.style.setProperty("--i", i);
  [el.tabLearn, el.tabFree, el.tabStats].forEach((b, k) => b.setAttribute("aria-selected", String(k === i)));
  document.body.dataset.mode = S.mode;        // style.css hides what a mode does not use
}
