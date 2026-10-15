// Typing trainer frontend. Plain JavaScript, no frameworks, no build step:
// native ES modules (see the import rule at the top of state.js).
// This is the entry point: it loads input.js and starts the app.
//
// Flow:  load layout -> POST /api/v1/portion {start} (the first few portions
// of words) -> user types (keydown) -> every typed position becomes a
// "sample" {char, errors, ms} -> a portion is done -> POST its samples to
// /api/v1/portion (the server updates the model, maybe unlocks a letter, and
// answers with the next portion, built from the updated model) -> ... ->
// the round ends (30 words, Esc or a pause) -> POST /api/v1/results (the history).

import { SPLASH_PHRASES, setUiLang, t } from "./i18n.js";
import { FX, Splash } from "./fx.js";
import { el, S, store, isTouch } from "./state.js";
import { getJSON } from "./api.js";
import { labelTips } from "./tools.js";
import { restoreKb } from "./keyboard.js";
import { showIntro } from "./intro.js";
import { renderProfile, loadAccount } from "./profile.js";
import { buildLangSwitch, initialLanguage, loadLanguage } from "./languages.js";

import "./input.js";   // keys and buttons: it only adds event listeners

// ---------- start ----------
(async function init() {
  // interface language for the splash, before the server answers
  const guess = store.get("tt.lang") || (navigator.language || "").slice(0, 2).toLowerCase();
  setUiLang(guess);
  renderProfile();
  // the small phrase over the logo: the same one the start screen showed
  S.mottoIndex = Math.floor(Math.random() * SPLASH_PHRASES);
  const splash = Splash.start();
  if (splash.phrase !== undefined) S.mottoIndex = splash.phrase;   // the logo keeps the start phrase
  restoreKb();   // keyboard on or off from last time (learning until the mode is known)
  labelTips();
  if (isTouch()) el.textBox.classList.add("blurred"); // phone: tap to open the keyboard
  try {
    await loadAccount();   // who is logged in: decides whose data the server sends
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
