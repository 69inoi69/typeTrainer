// The warning over the text when a key comes from the wrong keyboard
// setting: Caps Lock on, or the system layout set to another language. Not a
// typing mistake: not counted, just explained, with how to fix it.
// Layer: middle. Imports the bottom layer only. Called by: typing.js (keys
// that do not fit, the layout check before a round), input.js (checkCaps on
// keys and mouse moves) and languages.js (hideWarn on a language change).

import { t } from "./i18n.js";
import { el, S, isTouch } from "./state.js";

let wrongScript = 0;       // presses in a row that came from another keyboard layout
let capsOn = false;        // Caps Lock was on at the last key or mouse move

// The warning card: an icon, what is wrong and how to fix it. For a wrong
// layout, the usual way to switch it on this system, not always Windows'; a
// phone or an unknown system gets no keys.
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
  el.live.classList.add("warning");   // the top line fades out under it
}
// Hides the Caps Lock / wrong system layout warning (also on a language change).
export function hideWarn() {
  wrongScript = 0;
  capsOn = false;                     // asked again at the next key or mouse move
  delete el.warn.dataset.kind;
  el.warn.classList.remove("show");
  el.live.classList.remove("warning");
}
// Is there anything to hide once a right key comes?
export const warnShowing = () => wrongScript > 0 || el.warn.classList.contains("show");

// A typed letter that is not in this language's alphabet: two in a row
// mean the system layout is wrong (one can be a slip).
export function foreignKey() {
  if (++wrongScript >= 2) showWarn("layout");
}

// A wrong system layout before the first key: a warning after the presses
// comes too late. Chromium browsers (Chrome, Edge)
// can say what the home-row keys type in the current layout (the Keyboard
// API); Firefox and Safari cannot, and some browsers hide it (Brave, against
// fingerprinting), so there the first keys still tell (typing.js handleChar).
// typing.js asks once a second while no round is being typed, and input.js
// when the window comes back: a layout switched meanwhile shows or hides
// the warning. Wrong = most home-row keys type letters that are not in this
// language's alphabet (the same rule as for typed keys, so Colemak or AZERTY
// in the same script are fine).
const HOME_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL"];
export async function layoutCheck() {
  if (!navigator.keyboard?.getLayoutMap || !S.alphabet) return;
  let map;
  try { map = await navigator.keyboard.getLayoutMap(); } catch { return; }   // not allowed here
  const got = HOME_CODES.map((code) => map.get(code)).filter(Boolean);
  if (got.length < 4) return;              // the browser does not say: the first key will tell
  const foreign = got.filter((c) => /\p{L}/u.test(c) && !S.alphabet.has(c.toLowerCase())).length;
  if (foreign > got.length / 2) { if (el.warn.dataset.kind !== "layout") showWarn("layout"); }
  else if (el.warn.dataset.kind === "layout") hideWarn();
}

// Caps Lock before the first letter, not after letters were typed. Every
// key and mouse event says whether Caps Lock is on

// (getModifierState), so the warning comes with the first mouse move or any
// key (Shift, the Caps Lock key itself) and goes as soon as it is off.
// Called by input.js on keys and mouse moves; it acts only on a change.
export function checkCaps(e) {
  const on = e.getModifierState?.("CapsLock");
  if (on === undefined || on === capsOn) return;
  capsOn = on;
  if (on) { if (!el.warn.dataset.kind) showWarn("caps"); }   // a wrong layout is said first
  else if (el.warn.dataset.kind === "caps") hideWarn();
}
