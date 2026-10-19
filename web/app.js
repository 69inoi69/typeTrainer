// typeTrainer frontend. Plain JavaScript, no frameworks, no build step:
// native ES modules (see the import rule at the top of state.js).
// This is the entry point: it loads input.js and starts the app.
// Layer: top. index.html loads only this file; it imports what init() needs.
//
// Flow:  load layout -> POST /api/v1/portion {start} (the first few portions
// of words) -> user types (keydown) -> every typed position becomes a
// "sample" {char, errors, ms} -> a portion is done -> POST its samples to
// /api/v1/portion (the server updates the model, maybe unlocks a letter, and
// answers with the next portion, built from the updated model) -> ... ->
// the round ends (its length from the settings, Esc or a pause) ->
// POST /api/v1/results (the history).

import { setUiLang, t } from "./i18n.js";
import { FX, Splash } from "./fx.js";
import { el, S, store, isTouch } from "./state.js";
import { getJSON, postJSON } from "./api.js";
import { labelTips } from "./tools.js";
import { restoreKb } from "./keyboard.js";
import { showIntro } from "./intro.js";
import { renderProfile, loadAccount } from "./profile.js";
import { buildLangSwitch, initialLanguage, loadLanguage } from "./languages.js";
import { loadSettings } from "./settings.js";
import { startTune } from "./tune.js";
import { buildAmbient } from "./ambient.js";

import { startView } from "./input.js";   // keys and buttons: mostly event listeners

// ---------- user study ----------
// A hidden link for the evaluation chapter (docs/ALGORITHM.md section 11):
// "...?group=random" puts this browser (or account) into the control group
// of a user study in every language: learning draws random open words
// instead of using the algorithm. "?group=adaptive" goes back. Nothing in
// the interface shows it; the parameter is removed from the address so a
// reload or a shared link does not repeat it.
async function joinStudy() {
  const url = new URL(location.href);
  const g = url.searchParams.get("group");
  if (g !== "random" && g !== "adaptive") return;
  const group = g === "random" ? "random" : "";
  await Promise.all(S.languages.map((l) => postJSON("/group", { group }, l.id)));
  url.searchParams.delete("group");
  history.replaceState(null, "", url);
}

// ---------- start ----------
(async function init() {
  // interface language for the splash, before the server answers
  const guess = store.get("tt.lang") || (navigator.language || "").slice(0, 2).toLowerCase();
  setUiLang(guess);
  renderProfile();
  const splash = Splash.start();
  loadSettings();   // round length, live numbers, caret (settings.js)
  startTune();      // the hidden tuning panel, only with ?tune in the address (tune.js)
  restoreKb();   // keyboard on or off from last time (learning until the mode is known)
  labelTips();
  if (isTouch()) el.textBox.classList.add("blurred"); // phone: tap to open the keyboard
  try {
    await loadAccount();   // who is logged in: decides whose data the server sends
    S.languages = await getJSON("/languages", true);
    await joinStudy();
    buildLangSwitch();
    await loadLanguage(initialLanguage());
  } catch (err) {
    console.error(err);
    el.text.textContent = t("err.load");
  }
  startView();      // a phone or tablet opens on the stats
  await splash.done();
  buildAmbient();   // now the letters bar is drawn: the background uses its open letters
  const flash = store.get("tt.flash");                     // set by a finished import
  if (flash) {
    store.set("tt.flash", "");
    FX.toast(t("toast.imported", { n: flash }));
  }
  if (!store.get("tt.introDone") && S.layout && !isTouch()) showIntro();   // only the very first visit, and only where you type
})();
