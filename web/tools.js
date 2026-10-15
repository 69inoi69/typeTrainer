// Tooltips of the icon buttons, and the "your statistics" row of the
// settings panel: reset, export and import.
// Layer: middle. Imports only the bottom layer.

import { t } from "./i18n.js";
import { FX } from "./fx.js";
import { $, el, S, store } from "./state.js";
import { API } from "./api.js";

// ---------- tooltips ----------
// Icon buttons have no text, so their meaning (and the shortcut) is shown in a
// small tooltip: data-tip="key" in index.html, text from i18n.js.
let tipFor = null;
export function showTip(node) {
  tipFor = node;
  const r = node.getBoundingClientRect();
  el.tooltip.textContent = node.dataset.tipText || t(node.dataset.tip); // tipText: ready text, tip: i18n key
  // keep a long tooltip inside the window (measured on hover, never per keypress)
  const half = el.tooltip.offsetWidth / 2 + 8;
  el.tooltip.style.left = Math.min(innerWidth - half, Math.max(half, r.left + r.width / 2)) + "px";
  const below = r.top < 60;                         // header: no room above
  el.tooltip.classList.toggle("below", below);
  el.tooltip.style.top = (below ? r.bottom : r.top) + "px";
  el.tooltip.classList.add("show");
}
function hideTip() {
  tipFor = null;
  el.tooltip.classList.remove("show");
}
document.addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch") return;            // no sticky tooltips on phones
  const node = e.target.closest?.("[data-tip], [data-tip-text]");
  if (node && node !== tipFor) showTip(node);
  else if (!node && tipFor) hideTip();
});
document.addEventListener("pointerdown", hideTip);
// keyboard users: a focused element with a tooltip shows it too (the stats
// screen keeps its exact numbers in tooltips)
document.addEventListener("focusin", (e) => {
  const node = e.target.closest?.("[data-tip-text]");
  if (node && node.matches(":focus-visible")) showTip(node);
});
document.addEventListener("focusout", () => { if (tipFor) hideTip(); });
// screen readers: the tooltip text is also the button's name
export function labelTips() {
  document.querySelectorAll("button[data-tip]").forEach((b) => b.setAttribute("aria-label", t(b.dataset.tip)));
}

// ---------- reset ----------
// Back to the very first visit: the server forgets every language, the
// browser forgets its settings (keys starting with "tt."), the page reloads.
// The first click only "arms" the button (red, new tooltip); the second one
// resets. Moving the mouse away disarms it.
const btnReset = $("btn-reset");
const resetLabel = btnReset.querySelector("span");
function disarmReset() {
  btnReset.classList.remove("armed");
  btnReset.dataset.tip = "tip.reset";
  resetLabel.textContent = t("data.reset");
  if (tipFor === btnReset) showTip(btnReset);
}
btnReset.addEventListener("click", async () => {
  if (!btnReset.classList.contains("armed")) {
    btnReset.classList.add("armed");
    btnReset.dataset.tip = "tip.resetConfirm";
    resetLabel.textContent = t("data.resetSure");
    FX.shake(btnReset);
    showTip(btnReset);
    return;
  }
  if (S.busy) return;
  S.busy = true;
  try {
    for (const l of S.languages) {
      await fetch(`${API}/reset?lang=${encodeURIComponent(l.id)}`, { method: "POST" });
    }
  } catch (err) { console.error(err); }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("tt.")) localStorage.removeItem(k);
  } catch { /* storage blocked: nothing saved anyway */ }
  location.reload();
});
btnReset.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") disarmReset(); }); // a tap "leaves" at once
btnReset.addEventListener("blur", disarmReset);

// ---------- export / import ----------
// All statistics of all languages as ONE json file. The server does the real
// work (/export and /import per language); here we only join the pieces into a
// file, and split a loaded file back into pieces. Import REPLACES the data.
const FILE_APP = "typing-trainer", FILE_VERSION = 1;
const importFile = $("import-file");

$("btn-export").addEventListener("click", async (e) => {
  e.currentTarget.blur();
  try {
    const out = { app: FILE_APP, version: FILE_VERSION, exportedAt: new Date().toISOString(), languages: {} };
    for (const l of S.languages) {
      const res = await fetch(`${API}/export?lang=${encodeURIComponent(l.id)}`);
      if (!res.ok) throw new Error(`export ${l.id} -> ${res.status}`);
      out.languages[l.id] = await res.json();
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
    link.download = `typing-trainer-${out.exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000); // cleanup only, not an animation
    FX.toast(t("toast.exported"));
  } catch (err) {
    console.error(err);
    FX.toast(t("toast.importFail"));
  }
});

$("btn-import").addEventListener("click", (e) => {
  e.currentTarget.blur();
  if (!S.busy) importFile.click();
});
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";                      // the same file can be chosen again
  if (!file || S.busy) return;
  S.busy = true;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== FILE_APP || data.version !== FILE_VERSION || !data.languages || typeof data.languages !== "object") {
      throw new Error("this is not a typing-trainer file");
    }
    const ids = S.languages.map((l) => l.id).filter((id) => data.languages[id]);
    if (!ids.length) throw new Error("the file has none of our languages");
    let exercises = 0;
    for (const id of ids) {
      const res = await fetch(`${API}/import?lang=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.languages[id]),
      });
      if (!res.ok) throw new Error(`import ${id} -> ${res.status}`);
      exercises += (await res.json()).sessions;
    }
    store.set("tt.flash", String(exercises)); // shown by init() after the reload
    location.reload();
  } catch (err) {
    console.error(err);
    S.busy = false;
    FX.toast(t("toast.importFail"));
  }
});
