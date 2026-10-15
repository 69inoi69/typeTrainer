// "How does this site work?": a short tour of the typing screen. One part of
// the page at a time gets a light ring (everything else dims) and a small card
// explains it in a sentence or two. It starts by itself once, right after the
// first-visit intro, and again from the "?" button in the header.
// Keys: Enter / Space / → next, Esc closes.
// Layer: middle. Imports only the bottom layer.

import { t } from "./i18n.js";
import { $, S, store, focusText } from "./state.js";

// Which part each step shows. A step whose part is hidden right now (the
// keyboard switched off, the shortcut line on a phone) is left out.
const STEPS = [
  { sel: ".letters", key: "tour.letters" },
  { sel: "#text-box", key: "tour.text" },
  { sel: "#keyboard", key: "tour.keyboard" },
  { sel: ".view-switch", key: "tour.stats" },
  { sel: "#lang-switch", key: "tour.lang" },
  { sel: ".hints", key: "tour.keys" },
];
const PAD = 8;             // room between a part and its ring, px

const root = $("tour"), spot = $("tour-spot"), card = $("tour-card");
let steps = [];            // the steps that can be shown now
let at = 0;                // index in steps

export const tourOpen = () => !root.hidden;

export function startTour() {
  if (S.view !== "type") return;
  const visible = (node) => node && node.offsetParent !== null && node.offsetHeight > 0;
  steps = STEPS.filter((s) => visible(document.querySelector(s.sel)));
  if (!steps.length) return;
  at = 0;
  root.hidden = false;
  document.activeElement?.blur();
  show();
}

// Places the ring and the card for the current step. Reads the layout only
// here (on a step change or a resize), never while typing.
function show() {
  const step = steps[at];
  const r = document.querySelector(step.sel).getBoundingClientRect();
  Object.assign(spot.style, {
    left: r.left - PAD + "px", top: r.top - PAD + "px",
    width: r.width + PAD * 2 + "px", height: r.height + PAD * 2 + "px",
  });
  $("tour-step").textContent = `${at + 1} / ${steps.length}`;
  $("tour-text").innerHTML = t(step.key);
  $("tour-next").textContent = t(at === steps.length - 1 ? "tour.done" : "tour.next");
  // the card goes under the part if there is room, else over it
  const ch = card.offsetHeight, cw = card.offsetWidth;
  const below = r.bottom + PAD + 12 + ch < innerHeight;
  card.style.top = (below ? r.bottom + PAD + 12 : Math.max(8, r.top - PAD - 12 - ch)) + "px";
  card.style.left = Math.min(innerWidth - cw - 8, Math.max(8, r.left + r.width / 2 - cw / 2)) + "px";
}

function next() {
  if (at < steps.length - 1) { at++; show(); } else closeTour();
}
export function closeTour() {
  root.hidden = true;
  store.set("tt.tourDone", "1");
  focusText();
}
// first visit: once, after the intro
export function maybeStartTour() {
  if (!store.get("tt.tourDone")) startTour();
}

// Key presses while the tour is open.
export function tourKey(e) {
  if (e.key === "Escape") { e.preventDefault(); closeTour(); return; }
  if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); next(); return; }
  if (e.key === "ArrowLeft" && at > 0) { e.preventDefault(); at--; show(); }
}

$("tour-next").addEventListener("click", (e) => { e.currentTarget.blur(); next(); });
$("tour-skip").addEventListener("click", closeTour);
$("btn-tour").addEventListener("click", (e) => { e.currentTarget.blur(); startTour(); });
addEventListener("resize", () => { if (tourOpen()) show(); });
