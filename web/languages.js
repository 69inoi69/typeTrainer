// The language switch and loading a language: its layout, keyboard,
// interface texts, statistics and first round. The typing language is also
// the interface language.
// Layer: middle. Imports the bottom layer and the other middle modules.
// Called by: app.js (buildLangSwitch, initialLanguage, loadLanguage at
// start), input.js (switchLanguage on Alt+1...4).

import { i18nVars, setUiLang, t, applyI18n } from "./i18n.js";
import { FX } from "./fx.js";
import { el, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { labelTips } from "./tools.js";
import { drawKeyboard, applyKb } from "./keyboard.js";
import { refreshStats, renderStats } from "./stats.js";
import { loadExercise, hideWarn } from "./typing.js";
import { drawIntroKeys } from "./intro.js";
import { renderProfile } from "./profile.js";
import { refreshFreeplay, restoreMode } from "./modes.js";

// ---------- languages ----------
// The switch is built once; changing language only moves the thumb
// (CSS variable --i), so the slide animation can run.
// With one language (the others hidden in data/languages.json) there is
// nothing to switch: the switch and its shortcut hint are not shown.
export function buildLangSwitch() {
  document.body.classList.toggle("one-lang", S.languages.length < 2);
  el.langSwitch.style.setProperty("--n", S.languages.length);
  el.langSwitch.innerHTML = `<span class="switch-thumb" aria-hidden="true"></span>` +
    S.languages.map((l) => `<button type="button" role="tab" data-lang="${l.id}" title="${l.name}">${l.label}</button>`).join("");
  el.langSwitch.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    b.blur();
    switchLanguage(b.dataset.lang);
  }));
}
// A click or Alt+1...4: load another language (not while a round is saved).
export function switchLanguage(id) {
  if (S.busy || id === S.lang) return;
  loadLanguage(id).catch((err) => console.error(err));
}
function markLangSwitch() {
  el.langSwitch.style.setProperty("--i", Math.max(0, S.languages.findIndex((l) => l.id === S.lang)));
  el.langSwitch.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.lang === S.lang)));
}

// First choice: what was used last time, else the browser's language, else the first one.
export function initialLanguage() {
  const ids = S.languages.map((l) => l.id);
  const saved = store.get("tt.lang");
  if (ids.includes(saved)) return saved;
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  return ids.includes(browser) ? browser : ids[0];
}

// Loads language id and everything that depends on it, then starts a round.
// S.busy blocks typing and a second switch until it is done.
export async function loadLanguage(id) {
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
    const row = S.layout.rows[1].map((k) => k.char.toUpperCase());
    i18nVars.l = row.slice(0, 4).join(" ");
    i18nVars.r = row.slice(6, 10).join(" ");
    applyI18n();
    renderProfile();                        // "guest" in the new language
    labelTips();
    applyKb();                              // re-translates "off"
    await refreshStats();
    await refreshFreeplay();
    restoreMode();                          // the mode of last time in this language
    await loadExercise();
    if (S.view === "stats") renderStats();
  } finally {
    S.busy = false;
  }
}
