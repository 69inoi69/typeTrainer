// The typing screen: the text stream (portions of words added while you
// type, in rounds of the length chosen in the settings), the caret, what
// every keypress does, the clean-word streak, the live WPM / accuracy, and
// sending the result when a round ends. The letters bar is in letters.js,
// the result screen in result.js. The same screen serves every mode
// (modes.js): learning talks to /portion and /results, free practice and the
// typing test to /freeplay/*.
// Layer: middle. Imports the bottom layer, keyboard.js, stats.js, result.js,
// letters.js, modes.js and settings.js.
// Called by: input.js (handleChar, backspace, nudge, stopRound and the rest
// on keys and clicks) and languages.js (loadExercise, hideWarn when the
// language changes).
//
// Speed rule (AGENTS.md): this code runs on every keypress, so it must stay
// light. A keypress only flips the classes of the 1-2 <span>s that changed;
// the one layout read (where the caret goes) happens once per animation frame
// in placeCaret(); animations are CSS transitions or element.animate, never
// JS timers. Reading layout right after changing classes would force the
// browser to recompute the page on every key, which shows as lag.

import { FEEL } from "./feel.js";
import { t } from "./i18n.js";
import { FX } from "./fx.js";
import { $, el, S, introOpen, isTouch } from "./state.js";
import { postJSON } from "./api.js";
import { highlightNextKey, pulseKey, glowKey, requestFit } from "./keyboard.js";
import { refreshStats } from "./stats.js";
import { showResult, compareStats } from "./result.js";
import { renderLetters, markNewLetter, markMastered } from "./letters.js";
import { learning, refreshFreeplay, setMode } from "./modes.js";
import { lengthOf, firstRoundDone } from "./settings.js";

// Typing state, used only by the typing code.
let wrongScript = 0;       // presses in a row that came from another keyboard layout
let spans = [];            // one <span> per character
let focusMask = new Uint8Array(0); // 1 = this position is the focus letter (tinted until typed)
// Typing never stops on a mistake (as on monkeytype): a wrong letter turns
// red and the cursor moves on. Per position of the text we keep:
let state = new Uint8Array(0); // what is on the screen now: 0 = not typed, 1 = right, 2 = wrong, 3 = skipped
let records = [];          // the sample {char, errors, ms} of each position, or null if never typed.
                           // Backspace changes `state`, never `records`: a mistake stays a mistake.
let extras = new Map();    // index of a space -> extra letters typed before it (red <span>s)
let correctChars = 0;      // positions that are right now (state 1), for WPM
let startTime = null;      // performance.now() of the first keypress
let lastTime = null;       // performance.now() of the previous keypress
let afterBackspace = false; // the next press follows a Backspace: its time is not measured
let presses = 0, correctPresses = 0;
let perSecond = [];        // keypresses in each second since startTime (for consistency)

// Rewards (they change nothing in the statistics, they only feel nice)
let streak = 0;            // words in a row typed without a single mistake
let wordClean = true;      // no mistake in the current word so far
// One word back (Backspace at the start of a word): the start of the word
// the caret went back into (-1: none), and the errors it had then. From
// inside that word Backspace cannot go back another word.
let backWord = -1, backErrors = 0;
let fixedWords = new Set(); // starts of words that were gone back into and retyped without a mistake

// The text window always shows TEXT_LINES lines at one font size (style.css,
// .text): it never changes size between rounds. A text that needs more
// lines scrolls: the line you type stays the second one (as on monkeytype).
// fitText runs on a new text and on resize, never on a keypress: it reads the
// line height once and starts at the top.
const TEXT_LINES = 3;
let lineH = 0;
export function fitText() {
  if (S.view !== "type") return;
  lineH = parseFloat(getComputedStyle(el.text).lineHeight) || 0;
  cancelAnimationFrame(scrollFrame);
  el.text.scrollTop = 0;                     // a new text starts at the top at once
}

// ---------- caret ----------
// One caret element that slides to the current letter (CSS transition on
// translate). We read the letter's position once per animation frame:
// several calls in one frame (fast typing) cost a single layout read.
// jump = true: move at once, without the glide (a new text, a resize).
let caretFrame = 0;
export function placeCaret(jump) {
  cancelAnimationFrame(caretFrame);
  caretFrame = requestAnimationFrame(() => {
    if (!spans.length) return;
    // after the extra letters of this word, if there are any
    const extra = extras.get(S.pos)?.at(-1);
    const atEnd = S.pos >= spans.length || !!extra;
    const s = extra || spans[Math.min(S.pos, spans.length - 1)];
    const x = s.offsetLeft + (atEnd ? s.offsetWidth : 0);
    const h = s.offsetHeight;
    if (jump) el.caret.classList.add("jump");
    el.caret.style.height = Math.round(h * 0.82) + "px";
    // position in the separate CSS "translate" property: the Tab nudge animates
    // "scale", and scale must not multiply the position (the caret flew away)
    el.caret.style.translate = `${x - 1}px ${s.offsetTop + h * 0.09}px`;
    // keep the current line in view: from the third line on, scroll so that
    // it is the second one
    if (lineH) {
      const line = Math.round(s.offsetTop / lineH);
      const top = Math.max(0, Math.min(line - 1, Math.ceil(el.text.scrollHeight / lineH) - TEXT_LINES)) * lineH;
      if (Math.abs(el.text.scrollTop - top) > 1) scrollText(top, jump);
    }
    if (jump) requestAnimationFrame(() => el.caret.classList.remove("jump"));
  });
}
// Moves the text window to scrollTop = top in FEEL.lineScrollMs, fast at the
// start, soft at the end. The browser's own smooth scroll cannot be timed and
// takes ~400 ms, which felt like honey. scrollTop cannot be animated by CSS or
// element.animate(), so this one is stepped once per animation frame (the
// same frames the caret uses; no timers). A newer target replaces the old one.
let scrollFrame = 0;
function scrollText(top, jump) {
  cancelAnimationFrame(scrollFrame);
  const from = el.text.scrollTop, ms = jump ? 0 : FEEL.lineScrollMs;
  if (!ms) { el.text.scrollTop = top; return; }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    el.text.scrollTop = from + (top - from) * (1 - (1 - k) ** 3);   // ease-out
    if (k < 1) scrollFrame = requestAnimationFrame(step);
  };
  scrollFrame = requestAnimationFrame(step);
}

// ---------- the stream ----------
// The text is not built in one go: it is a stream of short portions (a few
// words around one focus letter, Generator.Portion on the server). When the
// last word of a portion is typed, its samples go to POST /portion, the model
// learns from them at once, and the answer is the next portion, built from
// the UPDATED statistics and added at the end of the text. AheadPortions
// portions are always waiting after the one being typed, so the words you can
// already see never change. A round has the length chosen in the settings
// (settings.js): N words, or N seconds. A words round ends with the last
// letter of its last word (no space needed after it); a time round when the
// time is up. Either ends earlier with Esc or a long pause, see finishRound().
// The typing test is always one full server round (RoundPortions portions,
// 30 words), whatever the settings say.
const IDLE_STOP_MS = 10000;  // no key for this long during a round = the user stopped
const RECENT_SENT = 40;      // words of the round sent as "recent" (the server uses the last RecentWords)
let portions = [];           // {start, end, focus}: positions of each portion; end = its last space
let sentUpTo = 0;            // positions before this were sent to the server (Backspace cannot go there)
let current = 0;             // index of the portion with the caret
let streamId = 0;            // a new round ignores answers that were meant for the old one
let queue = Promise.resolve(); // portion requests go one after another
let limit = { kind: "words", n: 30 }; // this round's length: {kind: "words" | "time", n}
let roundWords = 0;          // words in a words round, for the counter
let wordsLoaded = 0;         // words in the text so far
let endAt = -1;              // a words round: position of the space after its last word (-1: not loaded yet)
let wordsTyped = 0;          // words finished in this round
let roundBefore = null;      // the statistics when the round started (for the result)
let roundNewLetter = "";     // a letter that opened during the round
// Words appear one at a time: the portions come from the server as before,
// but only the words up to SHOWN_AHEAD after the current one are visible;
// finishing a word reveals exactly one more (it fades in). Hidden words keep
// their place in the line (visibility: hidden), so nothing visible ever moves.
// 12 = two portions: the server always has that many words ready.
const SHOWN_AHEAD = 12;
let wordOf = new Int32Array(0); // position -> index of its word in the round
let revealAt = 0;               // first position not shown yet
let shownWords = 0;             // words shown so far

// Adds portions at the end of the text: text, per-position arrays and spans.
// The focus letter of each portion is tinted in that portion, so you see what
// you practise.
function appendPortions(list) {
  const old = S.text.length;
  const add = list.map((p) => p.words.join(" ") + " ").join("");
  if (!add) return;
  S.text += add;
  const grow = (a) => { const g = new Uint8Array(S.text.length); g.set(a); return g; };
  state = grow(state);
  focusMask = grow(focusMask);
  const w = new Int32Array(S.text.length); w.set(wordOf); wordOf = w;
  for (let i = old, n = old ? wordOf[old - 1] + 1 : 0; i < S.text.length; i++) {
    wordOf[i] = n;
    if (S.text[i] === " ") n++;              // the space belongs to the word before it
  }
  for (let i = old; i < S.text.length; i++) records.push(null);
  let at = old;
  for (const p of list) {
    if (!p.words.length) continue;
    const end = at + p.words.join(" ").length;   // the space after the last word
    portions.push({ start: at, end, focus: p.focus });
    for (let i = at; i < end; i++) if (S.text[i] === p.focus) focusMask[i] = 1;
    // the round's last word is in this portion: remember where it ends
    if (limit.kind === "words" && endAt < 0 && wordsLoaded + p.words.length >= limit.n) {
      endAt = at + p.words.slice(0, limit.n - wordsLoaded).join(" ").length;
    }
    wordsLoaded += p.words.length;
    at = end + 1;
  }
  // the words are hidden until reveal() shows them; the first words of a
  // round come with the fade of the whole text (.swap)
  const frag = document.createDocumentFragment();   // one DOM update, not one per letter
  for (let i = old; i < S.text.length; i++) {
    const sp = document.createElement("span");
    sp.textContent = S.text[i];
    // words after the end of the round are never typed: not shown either
    sp.className = (focusMask[i] ? "fx" : "") + " later" + (endAt >= 0 && i >= endAt ? " beyond" : "");
    frag.appendChild(sp);
    spans.push(sp);
  }
  el.text.insertBefore(frag, el.caret);
  reveal(old > 0);
  const last = list.at(-1);
  if (last.unlocked) S.exercise = { ...(S.exercise ?? {}), unlocked: last.unlocked, locked: last.locked };  // learning only
}

// Shows the words up to SHOWN_AHEAD after the current one (never hides one
// again). fade: the newly shown words fade in (not the first words of a
// round: the whole text fades in then).
function reveal(fade) {
  shownWords = Math.max(shownWords, wordsTyped + SHOWN_AHEAD);
  for (; revealAt < spans.length && wordOf[revealAt] < shownWords; revealAt++) {
    spans[revealAt].classList.remove("later");
    if (fade) spans[revealAt].classList.add("new");
  }
}

// The letters bar shows the focus of the portion with the caret.
function showPortion(i) {
  current = i;
  if (portions[i] && S.exercise) S.exercise.focus = portions[i].focus;
  renderLetters();
}

// The words of the round so far (the server avoids repeating them).
function recentWords() {
  return S.text.trim().split(" ").slice(-RECENT_SENT);
}

// The words of a portion typed with a mistake: a wrong or extra letter, or
// skipped letters. Read from the samples, so a mistake fixed with Backspace
// still counts. They come back in a later portion.
function mistypedWords(por) {
  const out = [];
  for (let i = por.start; i <= por.end; ) {
    const end = wordEnd(i);
    let bad = false;
    for (let j = i; j <= end; j++) if (records[j] ? records[j].errors > 0 : j < end) bad = true;
    if (bad && !fixedWords.has(i)) out.push(S.text.slice(i, end));   // fixed in place: practised already
    i = end + 1;
  }
  return out;
}

// Does the round need more words than the text has? A time round always
// does: it goes on until the time is up.
const needMore = () => limit.kind === "time" || wordsLoaded < limit.n;

// The last space of portion k was typed: send it, get the next portion
// (none once the round has all its words).
function portionDone(k) {
  if (!learning()) return freePortionDone(k);
  const por = portions[k];
  const samples = records.slice(sentUpTo, por.end + 1).filter(Boolean);
  sentUpTo = por.end + 1;
  showPortion(k + 1);
  const body = { samples, retry: mistypedWords(por), last: !needMore() };
  const id = streamId;
  queue = queue.then(async () => {
    if (id !== streamId) return;
    body.recent = recentWords();
    const res = await postJSON("/portion", body);
    if (id !== streamId) return;
    appendPortions(res.portions);
    await refreshStats();
    if (id !== streamId) return;
    if (res.newLetter) newLetter(res.newLetter);
    renderLetters();
  }).catch((err) => { console.error(err); el.hint.textContent = t("err.server"); });
}

// Free practice and the test: nothing is learned, so nothing is sent but the
// words of the round (not to repeat them). Once the round has all its
// portions, nothing more is asked for.
function freePortionDone(k) {
  sentUpTo = portions[k].end + 1;
  showPortion(k + 1);
  if (!needMore()) return;
  const id = streamId;
  queue = queue.then(async () => {
    if (id !== streamId) return;
    const res = await postJSON("/freeplay/portion", { recent: recentWords() });
    if (id !== streamId) return;
    appendPortions(res.portions);
  }).catch((err) => { console.error(err); el.hint.textContent = t("err.server"); });
}

// Has the user typed anything in this round yet?
export const roundStarted = () => startTime !== null;

// A time round: is the time up?
const timeUp = (now) => limit.kind === "time" && startTime !== null && now - startTime >= limit.n * 1000;

// A letter opened: its chip pops with a soft ring (renderLetters, .chip.pop),
// its key glows once, and the result of the round names it. Calm on purpose:
// a new letter is good news, not a party.
function newLetter(l) {
  roundNewLetter = l;
  markNewLetter(l);
  glowKey(l);
}

// A new round: an empty text, then AheadPortions + 1 portions at once.
function resetStream() {
  streamId++;
  queue = Promise.resolve();
  S.text = ""; S.pos = 0; wordClean = true; wordsTyped = 0;
  state = new Uint8Array(0); focusMask = new Uint8Array(0); records = []; spans = [];
  portions = []; sentUpTo = 0; current = 0; roundNewLetter = ""; wordsLoaded = 0; endAt = -1;
  wordOf = new Int32Array(0); revealAt = 0; shownWords = 0;
  extras = new Map(); correctChars = 0; afterBackspace = false;
  backWord = -1; backErrors = 0; fixedWords = new Set();
  startTime = null; lastTime = null; presses = 0; correctPresses = 0; perSecond = [];
  el.text.replaceChildren(el.caret);          // the caret lives inside the text
}

// Starts a new round in the current mode: an empty text and the first
// portions from the server. (The name is older than the word "round".)
// Called on start, on a language or mode change, by Esc before the first key
// and after every result screen.
export async function loadExercise() {
  resetStream();
  const id = streamId;
  const res = await postJSON(learning() ? "/portion" : "/freeplay/portion", { start: true, recent: [] });
  if (id !== streamId) return;
  roundBefore = S.lastStats;
  // the test is one full server round; everything else follows the settings
  limit = S.mode === "test"
    ? { kind: "words", n: res.round * (res.portions[0]?.words.length ?? 0) }
    : lengthOf(S.settings.length);
  roundWords = limit.kind === "words" ? limit.n : 0;
  appendPortions(res.portions);
  renderProgress();
  fitText();                                 // back to the first line
  requestFit();                              // more lines (narrow window) leave less room for the keyboard
  el.text.classList.remove("swap");
  void el.text.offsetWidth;                  // restart the fade-in (once per round)
  el.text.classList.add("swap");
  el.textBox.classList.remove("typing");
  setTyping(false);
  if (!el.live.classList.contains("final")) { el.wpm.textContent = "0"; el.raw.textContent = "0"; el.acc.textContent = "100"; }
  highlightNextKey();
  showPortion(0);
  placeCaret(true);
}

// ---------- typing ----------
// The core of the app, called once per typed character. Kept small on
// purpose: it only flips classes on 1-2 spans; the caret is moved in the
// next animation frame.
//
// Monkeytype rules: a wrong letter turns red and the cursor moves on; space
// in the middle of a word jumps to the next word (the rest is "skipped");
// letters typed where a space belongs are "extra" and appear in red after the
// word; Backspace fixes the current word (see backspace()).
//
// What is measured: one sample {char, errors, ms} per position that was
// typed. errors = wrong presses at that position (also after a Backspace);
// ms = time from the previous press to the FIRST press at that position.
const MAX_EXTRA = 10;      // extra letters shown after a word, more are only counted
const canType = () => !(S.busy || S.pos >= S.text.length || introOpen() || S.view !== "type" || document.body.classList.contains("splashing"));

// the word around position i is text[wordStart(i) .. wordEnd(i)); wordEnd is
// the space after it (or the end of the text)
function wordStart(i) { while (i > 0 && S.text[i - 1] !== " ") i--; return i; }
function wordEnd(i) { while (i < S.text.length && S.text[i] !== " ") i++; return i; }

// What one position shows. Keeps the number of right positions for WPM.
function setState(i, s) {
  if (state[i] === 1) correctChars--;
  if (s === 1) correctChars++;
  state[i] = s;
  spans[i].className = s === 0 && focusMask[i] ? "fx" : ["", "ok", "bad", "miss"][s];
}
// The sample of position i. Created at the first press there and never
// deleted, so a mistake fixed with Backspace still counts for the letter.
function record(i, wrong, now) {
  let r = records[i];
  if (!r) {
    // not measured: the first press of the round, and a press right after a
    // Backspace (that time is spent correcting, not moving a finger)
    const ms = lastTime === null || afterBackspace ? 0 : Math.round(now - lastTime);
    r = records[i] = { char: S.text[i], errors: 0, ms };
  }
  if (wrong) r.errors++;
}
// The words of the round as typed, for the result screen (as on
// monkeytype): each word, which of its letters had a mistake, and its own
// speed. Display only, read once when the round ends.
// The speed of a word is the average time per measured press of its letters
// and of the space after it, as wpm (one word = 5 presses: 60000 / 5 = 12000).
// Unmeasured presses (ms 0: the first of the round, right after a Backspace)
// are left out; a word with none measured has no speed (null).
export function typedWords() {
  const out = [];
  for (let start = 0; start < S.pos; ) {
    const end = wordEnd(start), upTo = Math.min(end, S.pos);
    const letters = [];
    let ms = 0, n = 0;
    for (let i = start; i <= Math.min(end, S.pos - 1); i++) {
      const r = records[i];
      if (i < upTo) letters.push({ c: S.text[i], bad: (r?.errors ?? 0) > 0 });
      if (r?.ms > 0) { ms += r.ms; n++; }
    }
    if (letters.length) out.push({ letters, wpm: n ? Math.round(12000 / (ms / n)) : null });
    start = end + 1;
  }
  return out;
}
// The characters and the time of the round, for the result screen (as on
// monkeytype): how many letters are right, wrong, extra (typed past the end
// of a word) and missed (skipped with a space), and how long the round took
// from the first to the last press. Display only, read once at the end.
export function roundFacts(end = lastTime) {
  const chars = { correct: 0, wrong: 0, extra: 0, missed: 0 };
  for (let i = 0; i < S.pos; i++) {
    if (state[i] === 1) chars.correct++;
    else if (state[i] === 2) chars.wrong++;
    else if (state[i] === 3) chars.missed++;
  }
  for (const list of extras.values()) chars.extra += list.length;
  const seconds = startTime === null || end === null ? 0 : (end - startTime) / 1000;
  return { chars, seconds };
}
const wordHasError = (start, end) =>
  state.subarray(start, end).some((s) => s >= 2) || (extras.get(end)?.length ?? 0) > 0;
function mistake() {
  if (wordClean) breakStreak();
  wordClean = false;
  flinchCaret();
}
// The caret flinches for an instant on a mistake (knobs: FEEL.caretFlinch*).
// It animates "scale" only, so the glide ("translate") is not touched.
function flinchCaret() {
  if (!FEEL.caretFlinchMs || !el.caret.animate) return;
  el.caret.animate([{ scale: `1 ${FEEL.caretFlinchScale}` }, { scale: "1 1" }],
    { duration: FEEL.caretFlinchMs, easing: "ease-out" });
}

export function handleChar(ch) {
  if (!canType()) return;
  const expected = S.text[S.pos];
  // space at the start of a word means nothing (as on monkeytype)
  if (ch === " " && expected !== " " && S.pos === wordStart(S.pos)) return;
  const now = performance.now();
  if (timeUp(now)) { finishRound(); return; }   // a key after the time is up does not count
  if (startTime === null) {
    startTime = now;
    el.live.classList.remove("final");
  }
  el.textBox.classList.add("typing");
  setTyping(true);                         // does nothing if it is on already

  // Not a typing mistake but a wrong keyboard setting: Caps Lock, or the
  // system layout is set to another language. Not counted, just explained.
  if (ch !== expected && /\p{L}/u.test(ch)) {
    if (ch.toLowerCase() === expected) { showWarn("caps"); return; }
    if (!S.alphabet.has(ch.toLowerCase())) {
      if (++wrongScript >= 2) showWarn("layout");
      return;
    }
  }
  if (ch === expected && (wrongScript || el.warn.classList.contains("show"))) hideWarn();
  presses++;
  const sec = Math.floor((now - startTime) / 1000);
  perSecond[sec] = (perSecond[sec] ?? 0) + 1;   // real keys only: skipped letters are not presses
  let roundOver = false;

  if (expected === " " && ch !== " ") {
    // a letter where the space belongs: an "extra" letter, the cursor stays
    record(S.pos, true, now);
    const list = extras.get(S.pos) ?? [];
    if (list.length < MAX_EXTRA) {
      const s = document.createElement("span");
      s.className = "extra";
      s.textContent = ch;
      el.text.insertBefore(s, spans[S.pos]);
      list.push(s);
      extras.set(S.pos, list);
    }
    pulseKey(ch, false);
    mistake();
  } else {
    if (ch === " " && expected !== " ") {
      // space inside a word: skip the rest of it. Skipped letters were never
      // typed, so they give no sample, but each counts as a wrong press.
      const end = wordEnd(S.pos);
      presses += end - S.pos;
      while (S.pos < end) setState(S.pos++, 3);
      mistake();
    }
    if (S.pos < S.text.length) {
      const ok = ch === S.text[S.pos];
      record(S.pos, !ok, now);
      setState(S.pos, ok ? 1 : 2);
      if (ok) correctPresses++;
      else mistake();
      pulseKey(ch, ok);
      const space = S.text[S.pos] === " ";
      if (space) { leaveBackWord(); endWord(); }
      S.pos++;
      if (space && S.pos - 1 === endAt) roundOver = true;          // the last word, skipped with a space
      else if (space && S.pos - 1 === portions[current]?.end) portionDone(current);
      else if (!space && S.pos === endAt) { endWord(); roundOver = true; }  // the last letter of the round
    }
  }
  lastTime = now; afterBackspace = false;
  // after lastTime: the time of the round ends with this keypress
  if (roundOver) { finishRound(); return; }
  highlightNextKey();
  placeCaret(false);
}

// Backspace: one character back in the current word (extra letters go
// first); with Ctrl the whole word. From the start of a word it goes back
// into the previous word of the round, at most ONE word back: from inside
// that word it does nothing more. Only the screen changes: the samples
// (records) keep every mistake of the first pass, and a letter is only
// measured once (its first press), so nothing is counted twice. A word whose
// portion was already sent to the server can be fixed on the screen too; its
// new presses are not sent again.
export function backspace(wholeWord) {
  if (!canType() || startTime === null) return;
  if (S.pos === wordStart(S.pos)) {
    const space = S.pos - 1;
    if (space < 0 || backWord >= 0) return;
    setState(space, 0);
    S.pos = space;
    while (S.pos > 0 && state[S.pos - 1] === 3) setState(--S.pos, 0);   // skipped = not typed
    backWord = wordStart(space);
    backErrors = wordErrors(backWord, space);
    wordsTyped--;                            // it is finished again when its space is typed
    renderProgress();
    wordClean = false;                       // a word fixed afterwards does not extend the streak
    if (wholeWord) clearWord();
  } else if (wholeWord) {
    clearWord();
  } else if (extras.get(S.pos)?.length) {
    extras.get(S.pos).pop().remove();
  } else {
    setState(--S.pos, 0);
  }
  afterBackspace = true;
  highlightNextKey();
  placeCaret(false);
}
// mistakes recorded for the word start..end (its space included: extra letters)
function wordErrors(start, end) {
  let n = 0;
  for (let j = start; j <= end; j++) n += records[j]?.errors ?? 0;
  return n;
}
// The space of a word is typed: if it was the word gone back into, the
// one-word-back is over, and the word counts as fixed when the second pass
// added no mistake and nothing on it is red or skipped. A fixed word does not
// come back later as a mistyped word.
function leaveBackWord() {
  if (backWord < 0 || wordStart(S.pos) !== backWord) return;
  if (wordErrors(backWord, S.pos) === backErrors && !wordHasError(backWord, S.pos)) fixedWords.add(backWord);
  backWord = -1;
}
// Ctrl+Backspace: the cursor goes back to the start of its word, extra letters vanish
function clearWord() {
  (extras.get(S.pos) ?? []).splice(0).forEach((s) => s.remove());
  const start = wordStart(S.pos);
  while (S.pos > start) setState(--S.pos, 0);
}

// ---------- streak: clean words in a row ----------
// Shown from 3 words; at 10, 25 and 50 it gets "hotter" (colour, flicker,
// glow: see .streak[data-tier] in style.css). Visual only, nothing is sent.
const STREAK_TIERS = [10, 25, 50];
const streakTier = (n) => STREAK_TIERS.filter((x) => n >= x).length;
function endWord() {
  wordsTyped++;
  reveal(true);                              // one word finished: one more appears
  renderProgress();
  updateLive();                              // the numbers change once per word: calm, readable
  if (wordClean) {
    const before = streakTier(streak);
    streak++;
    renderStreak();
    if (streakTier(streak) > before) FX.bump(el.streak, 1.25);   // next tier: a bigger jump
    else if (streak >= 3) FX.bump(el.streakN);
    if (streak === 10 || streak % 25 === 0) FX.burstFrom(el.streak, 40);   // at 10, then every 25: a small party
  }
  wordClean = true;
}
// A words round: words typed, out of the words in the round. A time round:
// the seconds left (refreshed by the timer below, twice a second).
function renderProgress() {
  const time = limit.kind === "time";
  const key = time ? "metric.seconds" : "metric.words";
  if (el.progressLabel.dataset.i18n !== key) {
    el.progressLabel.dataset.i18n = key;
    el.progressLabel.innerHTML = t(key);
  }
  if (!time) el.progress.textContent = `${Math.min(wordsTyped, roundWords)}/${roundWords}`;
  else {
    const passed = startTime === null ? 0 : (performance.now() - startTime) / 1000;
    el.progress.textContent = Math.max(0, Math.ceil(limit.n - passed));
  }
}
function breakStreak() {
  if (streak >= 3) FX.shake(el.streak);
  streak = 0;
  renderStreak();
}
function renderStreak() {
  el.streakN.textContent = streak;
  el.streak.dataset.tier = streakTier(streak);
  el.streak.classList.toggle("show", streak >= 3);
}

// ---------- Tab: no restarts here ----------
// Monkeytype habit: Tab restarts the test when typing gets messy. Restarting
// throws away exactly the mistakes this trainer learns from, so Tab only
// answers with a small animation.
export function nudge() {
  FX.anim(el.caret, [{ scale: "1 1" }, { scale: "2.2 1.3" }, { scale: "1 1" }], { duration: 380, easing: "cubic-bezier(.3,1.6,.5,1)" });
  FX.anim(el.text, [{ translate: "0" }, { translate: "6px" }, { translate: "-4px" }, { translate: "2px" }, { translate: "0" }], { duration: 420, easing: "ease-out" });
}

function showWarn(kind) {
  const info = S.languages.find((l) => l.id === S.lang);
  el.warn.innerHTML = kind === "caps" ? t("warn.caps") : t("warn.layout", { layout: info?.systemLayout ?? S.lang });
  el.warn.classList.add("show");
  $("caption-slot").classList.add("warning");   // the status line fades out under it
}
// Hides the Caps Lock / wrong system layout warning (also on a language change).
export function hideWarn() {
  wrongScript = 0;
  el.warn.classList.remove("show");
  $("caption-slot").classList.remove("warning");
}

// WPM uses the standard definition: 5 characters = 1 word.
// `end`: when the round ended (default: now).
function currentWpm(end = performance.now()) {
  if (startTime === null) return 0;
  const minutes = (end - startTime) / 60000;
  return minutes > 0 ? (correctChars / 5) / minutes : 0;   // only what is right counts
}
// raw: every keypress counts, the wrong ones too (as on monkeytype).
// Shown in the header only; never sent to the server.
function currentRaw(end = performance.now()) {
  if (startTime === null) return 0;
  const minutes = (end - startTime) / 60000;
  return minutes > 0 ? (presses / 5) / minutes : 0;
}
// Keypresses in every FULL second up to `end`, a second without keys = 0.
// The last, unfinished second is left out: it would always look slow. The
// server turns the list into consistency (engine.Consistency).
function fullSeconds(end) {
  const n = startTime === null ? 0 : Math.floor((end - startTime) / 1000);
  return Array.from({ length: n }, (_, i) => perSecond[i] ?? 0);
}
function currentAccuracy() {
  return presses ? (correctPresses / presses) * 100 : 100;
}
// Called once per word, not per keypress. The caret keeps one colour all
// the time: a caret that changed colour with the speed looked random.
function updateLive() {
  el.wpm.textContent = Math.round(currentWpm());
  el.raw.textContent = Math.round(currentRaw());
  el.acc.textContent = Math.round(currentAccuracy());
}

// ---------- "typing now": the header steps back ----------
// From the first keypress to the end of the round the body has the class
// "typing-now": the logo turns grey, the languages, the account and the
// navigation almost vanish (style.css).
let typingNow = false;
export function setTyping(on) {
  if (on === typingNow) return;
  typingNow = on;
  document.body.classList.toggle("typing-now", on);
}

// Twice a second: a long pause ends the round, and so does the end of the
// time in a time round (whose counter shows the seconds left). A timer is
// fine here: it is a clock, not an animation, and it never runs per keypress.
// It also catches a time round that ends while no key is pressed.
setInterval(() => {
  if (startTime === null || S.busy) return;
  const now = performance.now();
  if (limit.kind === "time") renderProgress();
  if (now - lastTime > IDLE_STOP_MS || timeUp(now)) finishRound();
}, 500);

// Esc: ends the round early (or, before the first key, just gives a new text).
export function stopRound() {
  if (S.busy) return;
  if (startTime === null) {
    el.live.classList.remove("final");
    loadExercise().catch(console.error);
  } else finishRound();
}

// The round is over (the last letter of its last word, Esc or a long
// pause): the numbers of the round go to the history, the result screen shows what changed, then the
// next round starts. The time of the round ends at its last keypress, so the
// pause that ended it early does not lower the WPM.
async function finishRound() {
  S.busy = true;
  const end = lastTime;
  const wpm = Math.round(currentWpm(end) * 10) / 10;
  const accuracy = Math.round(currentAccuracy() * 10) / 10;
  // the live line keeps showing this result (in white) until the next
  // round starts
  el.live.classList.add("final");
  setTyping(false);
  el.wpm.textContent = Math.round(wpm);
  el.raw.textContent = Math.round(currentRaw(end));
  el.acc.textContent = Math.round(accuracy);
  if (limit.kind === "time") renderProgress();          // the seconds left when it stopped (0: time is up)
  const typed = records.filter(Boolean);              // every sample of the round
  const samples = records.slice(sentUpTo).filter(Boolean); // the ones not sent with a portion yet
  try {
    await queue;                                       // portions still on their way
    streamId++;                                        // nothing more for this round
    if (!typed.length) { await loadExercise(); return; } // nothing typed: nothing to keep
    if (S.mode === "test") { await finishTest(wpm, accuracy, typed.length); return; }
    if (S.mode === "free") { await finishFree(wpm, accuracy, typed, fullSeconds(end)); return; }
    // keys: the whole round, kept by the server as its raw record (it learns only from samples)
    const res = await postJSON("/results", {
      samples, keys: typed, chars: typed.length, wpm, accuracy, perSecond: fullSeconds(end), length: S.settings.length, device: device(),
    });
    firstRoundDone();
    await refreshStats();
    if (res.newLetter) newLetter(res.newLetter);

    const r = compareStats(roundBefore, S.lastStats, typed);
    markMastered(r.mastered);
    renderLetters();        // the letters bar agrees with the result at once, not only after it closes
    if (r.best) FX.burstFrom(el.wpm, 80);
    await showResult({ wpm, accuracy, consistency: res.consistency, newLetter: roundNewLetter, ...r, words: typedWords(), ...roundFacts(end) });
    await loadExercise();   // built from the UPDATED model
  } catch (err) {
    // said where the eyes are (it used to go only to the screen-reader
    // line), and a fresh round starts, so the screen never stays frozen
    console.error(err);
    FX.toast(t("err.save"));
    loadExercise().catch(console.error);
  } finally {
    S.busy = false;
  }
}

// The end of a free practice round: it goes to the free practice history
// only (POST /freeplay/results), never to the letter statistics.
// What the round is typed on, stored with it (recorded only, for the thesis:
// phone rounds may later count differently, docs/ALGORITHM.md section 9)
const device = () => (isTouch() ? "touch" : "keyboard");

async function finishFree(wpm, accuracy, keys, perSecond) {
  const before = S.free?.sessions ?? [];
  const res = await postJSON("/freeplay/results", { wpm, accuracy, chars: keys.length, perSecond, keys, length: S.settings.length, device: device() });
  firstRoundDone();
  await refreshFreeplay();
  const best = before.length > 0 && wpm > Math.max(...before.map((x) => x.wpm));
  if (best) FX.burstFrom(el.wpm, 80);
  await showResult({ wpm, accuracy, consistency: res.consistency, best, words: typedWords(), ...roundFacts() });
  await loadExercise();
}

// The end of the typing test. Only a full round counts (Esc or a long pause
// stops the test). The server checks the numbers (freeplay.Passed) and
// remembers a pass; the test is in no history. A pass goes on to free
// practice; otherwise the next round is the test again ("Try again" on the
// result, owner 2026-10-16), and the Learn tab leaves it.
async function finishTest(wpm, accuracy, chars) {
  const full = wordsTyped >= roundWords;
  const res = full ? await postJSON("/freeplay/test", { wpm, accuracy, chars }) : { passed: false };
  await refreshFreeplay();
  if (res.passed) FX.burstFrom(el.wpm, 80);
  await showResult({ wpm, accuracy, test: !full ? "stopped" : res.passed ? "pass" : "fail", words: typedWords(), ...roundFacts() });
  if (res.passed) setMode("free");
  await loadExercise();
}
