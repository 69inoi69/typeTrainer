// The language switch and loading a language.

import { i18nVars, t, applyI18n } from "./i18n.js";
import { FX } from "./fx.js";
import { el, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { labelTips } from "./tools.js";
import { drawKeyboard } from "./keyboard.js";
import { refreshStats, renderStats } from "./stats.js";
import { loadExercise } from "./typing.js";
import { hideWarn } from "./warn.js";
import { refreshActivity } from "./learnpanel.js";
import { drawIntroKeys } from "./intro.js";
import { renderProfile } from "./profile.js";
import { refreshFreeplay, restoreMode } from "./modes.js";

// ---------- languages ----------
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
export function switchLanguage(id) {
  if (S.busy || id === S.lang) return;
  loadLanguage(id).catch((err) => console.error(err));
}
function markLangSwitch() {
  el.langSwitch.style.setProperty("--i", Math.max(0, S.languages.findIndex((l) => l.id === S.lang)));
  el.langSwitch.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.lang === S.lang)));
}

export function initialLanguage() {
  const ids = S.languages.map((l) => l.id);
  const saved = store.get("tt.lang");
  if (ids.includes(saved)) return saved;
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  return ids.includes(browser) ? browser : ids[0];
}

export async function loadLanguage(id) {
  S.busy = true;
  try {
    S.lang = id;
    S.climbLevel = null;
    store.set("tt.lang", id);
    const info = S.languages.find((l) => l.id === id);
    S.alphabet = new Set(info.alphabet);
    document.documentElement.lang = id;
    markLangSwitch();
    hideWarn();
    el.live.classList.remove("final");
    S.layout = await getJSON("/layout");
    drawKeyboard();
    drawIntroKeys();
    if (S.languages.length && S.exercise) {
      FX.anim(el.keyboard, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
      FX.anim(el.letters, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    }
    const home = S.layout.rows.flat().filter((k) => k.home).map((k) => k.char.toUpperCase());
    [i18nVars.f, i18nVars.j] = home;
    const row = S.layout.rows[1].map((k) => k.char.toUpperCase());
    i18nVars.l = row.slice(0, 4).join(" ");
    i18nVars.r = row.slice(6, 10).join(" ");
    applyI18n();
    renderProfile();
    labelTips();
    await refreshStats();
    await refreshFreeplay();
    refreshActivity();
    restoreMode();
    await loadExercise();
    if (S.view === "stats") renderStats();
  } finally {
    S.busy = false;
  }
}
