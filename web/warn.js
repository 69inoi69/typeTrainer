// The Caps Lock and wrong layout warning.

import { t } from "./i18n.js";
import { el, S, isTouch } from "./state.js";

let wrongScript = 0;
let capsOn = false;

const WARN_ICON = {
  caps: '<path d="M12 4 5 11h4v5h6v-5h4z"/><path d="M9 20h6"/>',
  layout: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
};
function switchKeys() {
  const p = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  if (isTouch()) return "";
  if (p.includes("win")) return t("warn.keys.win");
  if (p.includes("mac")) return t("warn.keys.mac");
  if (p.includes("cros") || p.includes("chrome os")) return t("warn.keys.cros");
  if (p.includes("linux")) return t("warn.keys.linux");
  return "";
}
export function showWarn(kind) {
  const info = S.languages.find((l) => l.id === S.lang);
  const keys = kind === "layout" ? switchKeys() : "";
  const text = kind === "caps" ? t("warn.caps") : t("warn.layout", { layout: info?.systemLayout ?? S.lang });
  el.warn.innerHTML = `<span class="warn-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${WARN_ICON[kind]}</svg></span>` +
    `<span class="warn-text">${text}</span>${keys ? `<span class="warn-keys">${keys}</span>` : ""}`;
  el.warn.dataset.kind = kind;
  el.warn.classList.add("show");
  el.live.classList.add("warning");
}
export function hideWarn() {
  wrongScript = 0;
  capsOn = false;
  delete el.warn.dataset.kind;
  el.warn.classList.remove("show");
  el.live.classList.remove("warning");
}
export const warnShowing = () => wrongScript > 0 || el.warn.classList.contains("show");

export function foreignKey() {
  if (++wrongScript >= 2) showWarn("layout");
}

const HOME_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL"];
export async function layoutCheck() {
  if (!navigator.keyboard?.getLayoutMap || !S.alphabet) return;
  let map;
  try { map = await navigator.keyboard.getLayoutMap(); } catch { return; }
  const got = HOME_CODES.map((code) => map.get(code)).filter(Boolean);
  if (got.length < 4) return;
  const foreign = got.filter((c) => /\p{L}/u.test(c) && !S.alphabet.has(c.toLowerCase())).length;
  if (foreign > got.length / 2) { if (el.warn.dataset.kind !== "layout") showWarn("layout"); }
  else if (el.warn.dataset.kind === "layout") hideWarn();
}

export function checkCaps(e) {
  const on = e.getModifierState?.("CapsLock");
  if (on === undefined || on === capsOn) return;
  capsOn = on;
  if (on) { if (!el.warn.dataset.kind) showWarn("caps"); }
  else if (el.warn.dataset.kind === "caps") hideWarn();
}
