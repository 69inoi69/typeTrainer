// Your own text in Freetype (after keybr and monkeytype): you paste a text
// and type it, word by word in its order.
// The text stays in this browser (tt.custom.<lang>), it is never sent: the
// words come from here, not from /freetype/portion, and only the round's
// results go to the server (variant "custom", one history for every text
// you paste). A round carries on where the last finished one stopped
// (tt.customAt.<lang>); at the end of the text it starts over.
// What can be typed: the letters of the language, small and capital, and
// the marks . , ? ! ; : ' - (the server accepts the same,
// api.freetypeAlphabet); anything else is taken out when you save.
// Layer: middle. Imports the bottom layer.
// Called by: typing.js (customPortions, customRoundDone), input.js
// (openCustomText from the round bar), modebar.js (hasCustomText).

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";

const MAX = 5000;                      // characters kept: a few pages, many rounds
// portions as the server cuts its words (config.go PortionWords, and
// AheadPortions + 1 at the start of a round): a line of the text each
const PORTION_WORDS = 6, START_PORTIONS = 3;
const MARKS = ".,?!;:'-";
const key = (k) => `tt.${k}.${S.lang}`;

// The words of a pasted text that can be typed in this language: curly
// quotes and long dashes become ' and -, other characters go, and a word
// left without a letter goes too ("—", "1999"), giving the word before it
// the mark that ended a sentence ("wife — 1813. However" -> "wife. However").
export function cleanText(raw, alphabet) {
  const out = [];
  for (const w of raw.slice(0, MAX).replace(/[‘’ʼ`]/g, "'").replace(/[–—]/g, "-").split(/\s+/)) {
    const word = [...w].filter((c) => alphabet.has(c.toLowerCase()) || MARKS.includes(c)).join("");
    if ([...word].some((c) => alphabet.has(c.toLowerCase()))) out.push(word);
    else if (out.length && /[.?!]$/.test(word) && !/[.,?!;:]$/.test(out.at(-1))) out[out.length - 1] += word.at(-1);
  }
  return out;
}

let words = [], wordsFor = null;      // the saved text's words, cut once per text and language
function savedWords() {
  const text = store.get(key("custom")) ?? "";
  if (wordsFor !== S.lang + text) { words = cleanText(text, S.alphabet); wordsFor = S.lang + text; }
  return words;
}
export const hasCustomText = () => savedWords().length > 0;

// The answer /freetype/portion would give, from your text: start = a new
// round (its first portions, from where the last round stopped), else one
// more portion.
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

// A round of your text was finished with typed words: the next one starts after them.
export function customRoundDone(typed) {
  const n = savedWords().length;
  if (n) store.set(key("customAt"), String((roundAt + typed) % n));
}

// ---------- the editor ----------
const dlg = $("custom-dialog"), area = $("custom-area"), count = $("custom-count");
let onSave = () => {};

// Opens the editor with the saved text; fn runs after a save that left
// something to type.
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
  if (text !== (store.get(key("custom")) ?? "")) store.set(key("customAt"), "0");   // a new text starts at its beginning
  store.set(key("custom"), text);
  dlg.close();
  onSave();
});
