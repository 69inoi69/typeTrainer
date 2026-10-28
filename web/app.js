// Entry point of the frontend.

import { t } from "./i18n.js";
import { FX, Splash } from "./fx.js";
import { el, S, store, isTouch } from "./state.js";
import { getJSON, postJSON } from "./api.js";
import { labelTips } from "./tools.js";
import { autoKb } from "./keyboard.js";
import { showIntro } from "./intro.js";
import { renderProfile, loadAccount } from "./profile.js";
import { buildLangSwitch, initialLanguage, loadLanguage } from "./languages.js";
import { loadSettings } from "./settings.js";
import { buildAmbient } from "./ambient.js";

import { startView } from "./input.js";

// ---------- user study ----------
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
  renderProfile();
  const splash = Splash.start(store.get("tt.splashSeen") === null);
  store.set("tt.splashSeen", "1");
  loadSettings();
  autoKb();
  labelTips();
  if (isTouch()) el.textBox.classList.add("blurred");
  try {
    await loadAccount();
    S.languages = await getJSON("/languages", true);
    await joinStudy();
    buildLangSwitch();
    await loadLanguage(initialLanguage());
  } catch (err) {
    console.error(err);
    el.text.textContent = t("err.server");
  }
  startView();
  buildAmbient();
  await splash.done();
  const flash = store.get("tt.flash");
  if (flash) {
    store.set("tt.flash", "");
    FX.toast(t("toast.imported", { n: flash }));
  }
  if (!store.get("tt.introDone") && S.layout && !isTouch()) showIntro();
})();
