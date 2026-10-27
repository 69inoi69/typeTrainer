// Tooltips, export, import and reset.

import { t } from "./i18n.js";
import { FX } from "./fx.js";
import { $, el, S, store } from "./state.js";
import { API } from "./api.js";

// ---------- tooltips ----------
let tipFor = null;
if (el.tooltip.showPopover) el.tooltip.showPopover();
export function showTip(node) {
  tipFor = node;
  const r = node.getBoundingClientRect();
  el.tooltip.textContent = node.dataset.tipText || t(node.dataset.tip);
  el.tooltip.classList.toggle("wide", el.tooltip.textContent.length > 60);
  if (node.closest("dialog[open]") && el.tooltip.showPopover) {
    el.tooltip.hidePopover();
    el.tooltip.showPopover();
  }
  const half = el.tooltip.offsetWidth / 2 + 8;
  el.tooltip.style.left = Math.min(innerWidth - half, Math.max(half, r.left + r.width / 2)) + "px";
  const below = r.top < 60;
  el.tooltip.classList.toggle("below", below);
  el.tooltip.style.top = (below ? r.bottom : r.top) + "px";
  el.tooltip.classList.add("show");
}
function hideTip() {
  tipFor = null;
  el.tooltip.classList.remove("show");
}
document.addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch") return;
  let node = e.target.closest?.("[data-tip], [data-tip-text]");
  if (node && document.body.classList.contains("typing-now") && el.text.contains(node)) node = null;
  if (node && node !== tipFor) showTip(node);
  else if (!node && tipFor) hideTip();
});
document.addEventListener("pointerdown", hideTip);
document.addEventListener("focusin", (e) => {
  const node = e.target.closest?.("[data-tip-text]");
  if (node && node.matches(":focus-visible")) showTip(node);
});
document.addEventListener("focusout", () => { if (tipFor) hideTip(); });
export function labelTips() {
  document.querySelectorAll("button[data-tip]").forEach((b) => b.setAttribute("aria-label", t(b.dataset.tip)));
}

// ---------- reset ----------
let working = false;
const resetDialog = $("reset-dialog");
document.addEventListener("click", (e) => {
  const b = e.target.closest("#btn-reset, #btn-export, #btn-import");
  if (!b) return;
  if (b.id === "btn-reset") resetDialog.showModal();
  else if (b.id === "btn-export") exportAll();
  else if (!working) importFile.click();
});
$("reset-cancel").addEventListener("click", () => resetDialog.close());
resetDialog.addEventListener("click", (e) => { if (e.target === resetDialog) resetDialog.close(); });
$("reset-ok").addEventListener("click", async () => {
  if (working) return;
  working = S.busy = true;
  try {
    for (const l of S.languages) {
      await fetch(`${API}/reset?lang=${encodeURIComponent(l.id)}`, { method: "POST" });
    }
  } catch (err) { console.error(err); }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("tt.")) localStorage.removeItem(k);
  } catch {}
  location.reload();
});

// ---------- export / import ----------
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
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    FX.toast(t("toast.exported"));
  } catch (err) {
    console.error(err);
    FX.toast(t("toast.importFail"));
  }
}
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file || working) return;
  const wasBusy = S.busy;
  working = S.busy = true;
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
    store.set("tt.flash", String(exercises));
    location.reload();
  } catch (err) {
    console.error(err);
    working = false;
    S.busy = wasBusy;
    FX.toast(t("toast.importFail"));
  }
});
