// The three modes of the trainer and the navigation tabs that show them
// (nav.rail in index.html; the clicks are handled in input.js):
//   learn    - for beginners: the adaptive trainer (internal/engine),
//              letters open one by one; its progress is the letters row,
//              no stats;
//   climb    - for people who can already type (internal/freeplay): the
//              text gets harder while you type well and easier when you
//              struggle (a level, 1 to 100);
//   freetype - as on monkeytype: words from a list you choose (the 200 to
//              25 000 most common ones), nothing adapts.
// All are always open; the stats screen is Climb's and Freetype's. The
// chosen mode and Freetype's list and kind of text are remembered per
// language in this browser (tt.mode.<lang>, tt.list.<lang>,
// tt.variant.<lang>), each mode's round length for
// all languages (settings.js lengthFor); the round bar above the text
// shows the mode's choices (modebar.js).
// Layer: middle. Imports the bottom layer, keyboard.js, settings.js and
// modebar.js.
// Called by: languages.js (refreshFreeplay, restoreMode on a language
// change), input.js (setMode, setFreetypeList and renderNav on a click),
// typing.js (learning() and the mode to choose the routes), letters.js
// (learning()).

import { el, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { restoreKb } from "./keyboard.js";
import { lengthFor } from "./settings.js";
import { renderModeBar } from "./modebar.js";
import { hasCustomText } from "./customtext.js";

const MODES = ["learn", "climb", "freetype"];

// Is the current mode learning (the adaptive trainer)?
export const learning = () => S.mode === "learn";

// Freetype's history of a round length, list and kind of text.
export const freetypeUrl = (length, list, variant) =>
  `/freetype/stats?length=${length}${list ? `&list=${list}` : ""}${variant ? `&variant=${variant}` : ""}`;

// The kind of text after a click on one of its switches in the round bar
// (what: "long", "sentences" or "custom"): one kind at a time, a click on
// the one that is on goes back to plain words.
export const toggledVariant = (cur, what) => cur === what ? "" : what;

// The history of the two modes outside learning in this language, each
// of its own round length: Climb's (with its level) and the chosen
// Freetype list's and kind of text's (with the lists offered).
export async function refreshFreeplay() {
  const climbLength = lengthFor("climb"), length = lengthFor("freetype");
  const list = Number(store.get(`tt.list.${S.lang}`)) || 0;   // the one chosen last time in this language
  let variant = store.get(`tt.variant.${S.lang}`) ?? "";
  if (variant === "custom" && !hasCustomText()) variant = "";   // its text is gone (another browser, cleared data)
  if (variant === "sentences" && S.freetype && !S.freetype.sentences) variant = "";   // a language without sentences
  const [climb, freetype] = await Promise.all([
    getJSON(`/freeplay/stats?length=${climbLength}`),
    // a list or kind remembered from before that is not offered any more: the plain first list
    getJSON(freetypeUrl(length, list, variant))
      .catch(() => getJSON(freetypeUrl(length, 0, ""))),
  ]);
  S.climb = climb;
  S.freetype = freetype;
  S.freetypeList = freetype.list || S.freetypeList || list || freetype.lists?.[0] || 0;
  S.freetypeVariant = freetype.variant ?? "";
  renderNav();
  renderModeBar();
}

// Chooses Freetype's word list (its n most common words) and remembers it
// for this language. The caller starts the new round.
export async function setFreetypeList(n) {
  S.freetypeList = n;
  store.set(`tt.list.${S.lang}`, String(n));
  S.freetype = await getJSON(freetypeUrl(lengthFor("freetype"), n, S.freetypeVariant));
}

// Chooses Freetype's kind of text and remembers it for this language. The
// caller starts the new round.
export async function setFreetypeVariant(v) {
  S.freetypeVariant = v;
  store.set(`tt.variant.${S.lang}`, v);
  S.freetype = await getJSON(freetypeUrl(lengthFor("freetype"), S.freetypeList, v));
}

// The mode saved for this language ("free" is Climb's first name, kept by
// browsers from before).
export function restoreMode() {
  const saved = store.get(`tt.mode.${S.lang}`);
  S.mode = saved === "free" ? "climb" : MODES.includes(saved) ? saved : "learn";
  S.settings.length = lengthFor(S.mode);
  renderModeBar();
  restoreKb();                                  // learning and the other modes each have their keyboard on / off
  renderNav();
}

// Switches to mode m (one of MODES) and remembers it for this language.
// The caller starts the new round.
export function setMode(m) {
  S.mode = m;
  S.settings.length = lengthFor(m);
  renderModeBar();
  store.set(`tt.mode.${S.lang}`, m);
  restoreKb(true);
  renderNav();
}

// The navigation tabs: "stats" on the stats screen, else the tab of the
// mode.
export function renderNav() {
  const i = S.view === "stats" ? MODES.length : MODES.indexOf(S.mode);
  el.nav.style.setProperty("--i", i);
  [el.tabLearn, el.tabClimb, el.tabFreetype, el.tabStats].forEach((b, k) => b.setAttribute("aria-selected", String(k === i)));
  document.body.dataset.mode = S.mode;        // style.css hides what a mode does not use
}
