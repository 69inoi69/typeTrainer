// The three modes and their tabs.

import { el, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { autoKb } from "./keyboard.js";
import { lengthFor } from "./settings.js";
import { renderModeBar } from "./modebar.js";
import { hasCustomText } from "./customtext.js";

const MODES = ["learn", "climb", "freetype"];

export const learning = () => S.mode === "learn";

export const freetypeUrl = (length, list, variant) =>
  `/freetype/stats?length=${length}${list ? `&list=${list}` : ""}${variant ? `&variant=${variant}` : ""}`;

export const toggledVariant = (cur, what) => cur === what ? "" : what;

export async function refreshFreeplay() {
  const climbLength = lengthFor("climb"), length = lengthFor("freetype");
  const list = Number(store.get(`tt.list.${S.lang}`)) || 0;
  let variant = store.get(`tt.variant.${S.lang}`) ?? "";
  if (variant === "custom" && !hasCustomText()) variant = "";
  if (variant === "sentences" && S.freetype && !S.freetype.sentences) variant = "";
  const [climb, freetype] = await Promise.all([
    getJSON(`/freeplay/stats?length=${climbLength}`),
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

export async function setFreetypeList(n) {
  S.freetypeList = n;
  store.set(`tt.list.${S.lang}`, String(n));
  S.freetype = await getJSON(freetypeUrl(lengthFor("freetype"), n, S.freetypeVariant));
}

export async function setFreetypeVariant(v) {
  S.freetypeVariant = v;
  store.set(`tt.variant.${S.lang}`, v);
  S.freetype = await getJSON(freetypeUrl(lengthFor("freetype"), S.freetypeList, v));
}

export function restoreMode() {
  const saved = store.get(`tt.mode.${S.lang}`);
  S.mode = saved === "free" ? "climb" : MODES.includes(saved) ? saved : "learn";
  S.settings.length = lengthFor(S.mode);
  renderModeBar();
  autoKb();
  renderNav();
}

export function setMode(m) {
  S.mode = m;
  S.settings.length = lengthFor(m);
  renderModeBar();
  store.set(`tt.mode.${S.lang}`, m);
  autoKb(true);
  renderNav();
}

export function renderNav() {
  const i = S.view === "stats" ? MODES.length : MODES.indexOf(S.mode);
  el.nav.style.setProperty("--i", i);
  [el.tabLearn, el.tabClimb, el.tabFreetype, el.tabStats].forEach((b, k) => b.setAttribute("aria-selected", String(k === i)));
  document.body.dataset.mode = S.mode;
}
