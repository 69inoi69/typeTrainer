// Freetype's own text.

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";

const MAX = 5000;
const PORTION_WORDS = 6, START_PORTIONS = 3;
const MARKS = ".,?!;:'-";
const key = (k) => `tt.${k}.${S.lang}`;

export function cleanText(raw, alphabet) {
  const out = [];
  for (const w of raw.slice(0, MAX).replace(/[‘’ʼ`]/g, "'").replace(/[–—]/g, "-").split(/\s+/)) {
    const word = [...w].filter((c) => alphabet.has(c.toLowerCase()) || MARKS.includes(c)).join("");
    if ([...word].some((c) => alphabet.has(c.toLowerCase()))) out.push(word);
    else if (out.length && /[.?!]$/.test(word) && !/[.,?!;:]$/.test(out.at(-1))) out[out.length - 1] += word.at(-1);
  }
  return out;
}

let words = [], wordsFor = null;
function savedWords() {
  const text = store.get(key("custom")) ?? "";
  if (wordsFor !== S.lang + text) { words = cleanText(text, S.alphabet); wordsFor = S.lang + text; }
  return words;
}
export const hasCustomText = () => savedWords().length > 0;

let next = 0, roundAt = 0;
export function customPortions(start) {
  const all = savedWords();
  if (!all.length) return { portions: [] };
  if (start) next = roundAt = Math.min(Number(store.get(key("customAt"))) || 0, all.length - 1);
  return {
    portions: Array.from({ length: start ? START_PORTIONS : 1 }, () => ({
      words: Array.from({ length: PORTION_WORDS }, () => { const w = all[next]; next = (next + 1) % all.length; return w; }),
    })),
  };
}

export function customRoundDone(typed) {
  const n = savedWords().length;
  if (n) store.set(key("customAt"), String((roundAt + typed) % n));
}

// ---------- the editor ----------
const dlg = $("custom-dialog"), area = $("custom-area"), count = $("custom-count");
let onSave = () => {};

export function openCustomText(fn) {
  onSave = fn;
  area.value = store.get(key("custom")) ?? "";
  update();
  dlg.showModal();
}
function update() {
  const n = cleanText(area.value, S.alphabet).length;
  count.textContent = t("custom.count", { n, max: MAX.toLocaleString("en") });
  $("custom-save").disabled = n === 0;
}
area.addEventListener("input", update);
area.maxLength = MAX;
$("custom-cancel").addEventListener("click", () => dlg.close());
$("custom-save").addEventListener("click", () => {
  const text = area.value.slice(0, MAX);
  if (!cleanText(text, S.alphabet).length) return;
  if (text !== (store.get(key("custom")) ?? "")) store.set(key("customAt"), "0");
  store.set(key("custom"), text);
  dlg.close();
  onSave();
});
