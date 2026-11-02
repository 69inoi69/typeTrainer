// Loading the language.

import { i18nVars, t, applyI18n } from "./i18n.js";
import { el, S } from "./state.js";
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

export async function loadLanguage(id) {
  S.busy = true;
  try {
    S.lang = id;
    S.climbLevel = null;
    const info = S.languages.find((l) => l.id === id);
    S.alphabet = new Set(info.alphabet);
    document.documentElement.lang = id;
    hideWarn();
    S.layout = await getJSON("/layout");
    drawKeyboard();
    drawIntroKeys();
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
