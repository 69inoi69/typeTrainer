// Guide B, "how this site works": first the idea of the trainer in a few
// words (a card in the middle), then a short walk around the typing screen:
// one part of the page at a time gets a light ring (everything else dims) and
// a small card explains it in a sentence or two. It starts by itself once,
// right after guide A (intro.js) on the first visit, and again from Help.
// Keys: Enter / Space / → next, Esc closes.
// Layer: middle. Imports only the bottom layer.

import { t } from "./i18n.js";
import { $, S, store, focusText } from "./state.js";

// Which part each step shows (sel: null = no part, the card in the middle).
// A step whose part is hidden right now is left out. To add a step: one line
// here and its text in i18n.js (all four languages).
const STEPS = [
  { sel: null, key: "tour.how" },
  { sel: ".letters", key: "tour.letters" },
  { sel: "#text-box", key: "tour.text" },
  { sel: "#rail", key: "tour.nav" },
  { sel: "#lang-switch", key: "tour.lang" },
];
const PAD = 8;             // room between a part and its ring, px

const root = $("tour"), spot = $("tour-spot"), card = $("tour-card");
let steps = [];            // the steps that can be shown now
let at = 0;                // index in steps

export const tourOpen = () => !root.hidden;

export function startTour() {
  if (S.view !== "type") return;
  const visible = (node) => node && node.getClientRects().length > 0 && node.offsetHeight > 0;
  steps = STEPS.filter((s) => !s.sel || visible(document.querySelector(s.sel)));
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
  // no part: a point in the middle (the ring vanishes, the page still dims)
  const r = step.sel ? document.querySelector(step.sel).getBoundingClientRect()
    : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2, width: 0, height: 0 };
  spot.classList.toggle("none", !step.sel);
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
  let top = below ? r.bottom + PAD + 12 : Math.max(8, r.top - PAD - 12 - ch);
  let left = r.left + r.width / 2 - cw / 2;
  if (!step.sel) top = (innerHeight - ch) / 2;
  // a tall, narrow part (the side columns): the card goes next to it
  if (step.sel && r.height > r.width * 2) {
    top = r.top + r.height / 2 - ch / 2;
    left = r.left < innerWidth / 2 ? r.right + PAD + 12 : r.left - PAD - 12 - cw;
  }
  card.style.top = Math.min(innerHeight - ch - 8, Math.max(8, top)) + "px";
  card.style.left = Math.min(innerWidth - cw - 8, Math.max(8, left)) + "px";
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
