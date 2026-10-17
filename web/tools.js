// Tooltips of the icon buttons, and the data buttons of the settings panel:
// export, import and reset (with its confirm window).
// Layer: middle. Imports only the bottom layer.
// Called by: app.js and languages.js (labelTips), stats.js (showTip for a
// tap on a phone). The buttons it wires are static in index.html.

import { t } from "./i18n.js";
import { FX } from "./fx.js";
import { $, el, S, store } from "./state.js";
import { API } from "./api.js";

// ---------- tooltips ----------
// Icon buttons have no text, so their meaning (and the shortcut) is shown in a
// small tooltip: data-tip="key" in index.html, text from i18n.js.
let tipFor = null;
// Shows the tooltip of node above it (below it near the top of the window).
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
// The button only opens a window that asks first (#reset-dialog, a native
// <dialog>: Esc and Cancel close it, Cancel has the focus so Enter is safe).
// The data and reset buttons are drawn anew with the settings window
// (settings.js), so their clicks are caught here, on the document.
const resetDialog = $("reset-dialog");
document.addEventListener("click", (e) => {
  const b = e.target.closest("#btn-reset, #btn-export, #btn-import");
  if (!b) return;
  if (b.id === "btn-reset") resetDialog.showModal();
  else if (b.id === "btn-export") exportAll();
  else if (!S.busy) importFile.click();
});
$("reset-cancel").addEventListener("click", () => resetDialog.close());
// a click on the dimmed page around the window closes it too
resetDialog.addEventListener("click", (e) => { if (e.target === resetDialog) resetDialog.close(); });
$("reset-ok").addEventListener("click", async () => {
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

// ---------- export / import ----------
// All statistics of all languages as ONE json file. The server does the real
// work (/export and /import per language); here we only join the pieces into a
// file, and split a loaded file back into pieces. Import REPLACES the data.
const FILE_APP = "typing-trainer", FILE_VERSION = 1;
const importFile = $("import-file");

async function exportAll() {
  try {
    const out = { app: FILE_APP, version: FILE_VERSION, exportedAt: new Date().toISOString(), languages: {} };
    for (const l of S.languages) {
      const res = await fetch(`${API}/export?lang=${encodeURIComponent(l.id)}`);
      if (!res.ok) throw new Error(`export ${l.id} -> ${res.status}`);
      out.languages[l.id] = await res.json();
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
    link.download = `typeTrainer-${out.exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000); // cleanup only, not an animation
    FX.toast(t("toast.exported"));
  } catch (err) {
    console.error(err);
    FX.toast(t("toast.importFail"));
  }
}
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
