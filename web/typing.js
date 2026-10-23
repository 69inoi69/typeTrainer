// The typing screen: the text stream (portions of words added while you
// type, in rounds of the length chosen in the settings), where the caret
// goes, what every keypress does, the live WPM / accuracy, and sending the
// result when a round ends. Split off: the caret's own movements
// (caret.js), the clean-word streak (streak.js), the Caps Lock and layout
// warning (warn.js); the letters bar is in letters.js, the result screen in
// result.js. The same screen serves all three modes (modes.js): learning
// talks to /portion and /results, Climb to /freeplay/* with the level of the
// round (the server judges the round at its end, freeplay.Standing),
// Freetype to /freetype/* with its word list and kind of text (your own
// text comes from customtext.js, not the server).
// Layer: middle. Imports the bottom layer, keyboard.js, stats.js, result.js,
// letters.js, learnpanel.js, modes.js, modebar.js, settings.js, sound.js,
// customtext.js, caret.js, streak.js and warn.js.
// Called by: input.js (handleChar, backspace, restartRound and the rest
// on keys and clicks) and languages.js (loadExercise when the language
// changes).
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
import { el, S, introOpen, isTouch, roundList } from "./state.js";
import { postJSON } from "./api.js";
import { highlightNextKey, pulseKey, glowKey, requestFit } from "./keyboard.js";
import { refreshStats } from "./stats.js";
import { showResult } from "./result.js";
import { renderLetters, markNewLetter, markMastered } from "./letters.js";
import { renderPanel, roundNews, compareStats, refreshActivity, tickGoal } from "./learnpanel.js";
import { learning, refreshFreeplay } from "./modes.js";
import { renderModeBar } from "./modebar.js";
import { lengthOf, firstRoundDone } from "./settings.js";
import { keySound } from "./sound.js";
import { customPortions, customRoundDone } from "./customtext.js";
import { flinchCaret, breathe, paceGlide, resetGlide, scrollText, stopScroll } from "./caret.js";
import { STREAK_RISE, streakOn, cleanWord, breakStreak } from "./streak.js";
import { showWarn, hideWarn, warnShowing, foreignKey, layoutCheck } from "./warn.js";

// Typing state, used only by the typing code.
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
let afterPause = false;     // the next press ends a pause (pauseRound): its time is not measured
let pausedAt = null;        // when the round was paused, or null
let presses = 0, correctPresses = 0;
let perSecond = [];        // keypresses in each second since startTime (for consistency)

let wordClean = true;      // no mistake in the current word so far (for the streak, streak.js)
// One word back (Backspace at the start of a word): the start of the word
// the caret went back into (-1: none), and the errors it had then. From
// inside that word Backspace cannot go back another word.
let backWord = -1, backErrors = 0;
let fixedWords = new Set(); // starts of words that were gone back into and retyped without a mistake

// The text window always shows TEXT_LINES lines at one font size (typing.css,
// .text): it never changes size between rounds. A text that needs more
// lines scrolls: the line you type stays the second one (as on monkeytype).
// fitText runs on a new text and on resize, never on a keypress: it reads the
// line height once and starts at the top.
const TEXT_LINES = 3;
let lineH = 0;
let caretTop = 0;    // the caret's gap above its letter, px (typing.css .caret top), for the streak badge
export function fitText() {
  if (S.view !== "type") return;
  lineH = parseFloat(getComputedStyle(el.text).lineHeight) || 0;
  caretTop = el.caret.offsetTop || caretTop;   // 0 while the text is hidden (the result)
  stopScroll();
  el.text.scrollTop = 0;                     // a new text starts at the top at once
}

// ---------- caret ----------
// One caret element that slides to the current letter (CSS transition on
// translate). We read the letter's position once per animation frame:
// several calls in one frame (fast typing) cost a single layout read.
// jump = true: move at once, without the glide (a new text, a resize).
// last = true: the round's last key; the caret goes just past the letter
// typed, and the text does not scroll (the stream may already hold the next
// words on a line below, which would scroll the finished text away).
// The caret's height and its gap above the letter are in em of the text
// (typing.css .caret), never read from the letter: a space where a line
// wraps, with a mark on every space (body[data-ws]), is drawn on both
// lines, so its offsetHeight is two lines and the caret took it (owner,
// 2026-10-22: "it suddenly gets super long").
let caretFrame = 0;
export function placeCaret(jump, last = false) {
  cancelAnimationFrame(caretFrame);
  caretFrame = requestAnimationFrame(() => {
    if (!spans.length) return;
    // after the extra letters of this word, if there are any
    const extra = last ? null : extras.get(S.pos)?.at(-1);
    const atEnd = last || S.pos >= spans.length || !!extra;
    const s = last ? spans[Math.max(0, S.pos - 1)] : extra || spans[Math.min(S.pos, spans.length - 1)];
    breathe(el.textBox.classList.contains("typing"));
    const x = s.offsetLeft + (atEnd ? s.offsetWidth : 0);
    if (jump) el.caret.classList.add("jump");
    // position in the separate CSS "translate" property, so an animation of
    // "scale" never multiplies the position (the caret flew away once)
    el.caret.style.translate = `${x - 1}px ${s.offsetTop}px`;
    // keep the current line in view: from the third line on, scroll so that
    // it is the second one
    let top = el.text.scrollTop;
    if (lineH && !last) {
      const line = Math.round(s.offsetTop / lineH);
      top = Math.max(0, Math.min(line - 1, Math.ceil(el.text.scrollHeight / lineH) - TEXT_LINES)) * lineH;
      if (Math.abs(el.text.scrollTop - top) > 1) scrollText(top, jump);
    }
    // the streak badge sits just above the caret, outside the text window
    // (that window cuts off whatever is above its first line), so it is
    // placed in the text box with the same numbers (no extra layout read);
    // not at all while it is off (Freetype only, a setting)
    if (jump) requestAnimationFrame(() => el.caret.classList.remove("jump"));
    if (!streakOn()) return;
    if (jump) el.streak.classList.add("jump");
    el.streak.style.translate = `${el.text.offsetLeft + x + 4}px ${el.text.offsetTop + s.offsetTop - top + caretTop - STREAK_RISE}px`;
    if (jump) requestAnimationFrame(() => el.streak.classList.remove("jump"));
  });
}
// A window too short for the whole page (the page zoomed far in, 300-500 %)
// scrolls: the text card is brought into view when a round starts and at
// its first key, so what you type is never below the edge of the window.
// One layout read, once per round, never per key.
function keepTextInView() {
  if (S.view !== "type" || document.documentElement.scrollHeight <= innerHeight) return;
  const r = el.textBox.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= innerHeight) return;
  scrollTo({ top: scrollY + r.top - 8 });
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
// time is up (finishRound()). A long pause pauses it (IDLE_PAUSE_MS), the
// same as leaving the window.
const IDLE_PAUSE_MS = 10000; // no key for this long during a round = the user stepped away: paused
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
let roundNewLap = 0;         // the goal (wpm) of a lap that started during the round
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
  // the words are hidden until reveal() shows them
  const frag = document.createDocumentFragment();   // one DOM update, not one per letter
  for (let i = old; i < S.text.length; i++) {
    const sp = document.createElement("span");
    sp.textContent = S.text[i];
    // words after the end of the round are never typed: not shown either
    sp.className = (focusMask[i] ? "fx" : "") + " later" + (endAt >= 0 && i >= endAt ? " beyond" : "");
    // a gold letter says why it is gold (tools.js shows it only while you are not typing)
    if (focusMask[i]) sp.dataset.tipText = t("tip.fx", { l: S.text[i] });
    else if (S.text[i] === " ") sp.dataset.sp = "";   // a space: typing.css can mark it (the setting body[data-ws])
    frag.appendChild(sp);
    spans.push(sp);
  }
  el.text.insertBefore(frag, el.caret);
  reveal();
  const last = list.at(-1);
  if (last.unlocked) S.exercise = { ...(S.exercise ?? {}), unlocked: last.unlocked, locked: last.locked };  // learning only
}

// Shows the words up to SHOWN_AHEAD after the current one (never hides one
// again). They appear at once: a fade-in made the browser paint the text
// again for a few frames on every word (owner, 2026-10-18: smoothness first).
function reveal() {
  shownWords = Math.max(shownWords, wordsTyped + SHOWN_AHEAD);
  for (; revealAt < spans.length && wordOf[revealAt] < shownWords; revealAt++) spans[revealAt].classList.remove("later");
}

// The letters bar and the Learn panel show the focus of the portion with
// the caret.
function showPortion(i) {
  current = i;
  if (portions[i] && S.exercise) S.exercise.focus = portions[i].focus;
  renderTop();
}
// Everything above the text that follows the letters: the row and the panel
// (with the time typed in this round so far, for its "Today").
function renderTop() {
  S.roundSeconds = startTime === null ? 0 : (performance.now() - startTime) / 1000;
  renderLetters();
  renderPanel();
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
    if (res.newLap) roundNewLap = res.newLap;
    renderTop();
  }).catch((err) => { console.error(err); el.hint.textContent = t("err.server"); });
}

// Climb and Freetype: nothing is learned about letters. What is sent is
// the words of the round (not to repeat them) and its level (Climb) or
// word list (Freetype), only while the round needs more words.
function freePortionDone(k) {
  const por = portions[k];
  sentUpTo = por.end + 1;
  showPortion(k + 1);
  if (!needMore()) return;
  const how = S.mode === "climb" ? { level: S.climbLevel } : { list: roundList(), variant: S.freetypeVariant };
  const id = streamId;
  queue = queue.then(async () => {
    if (id !== streamId) return;
    const res = await getPortions({ recent: recentWords(), ...how });
    if (id !== streamId) return;
    appendPortions(res.portions);
  }).catch((err) => { console.error(err); el.hint.textContent = t("err.server"); });
}

// Where the words of the current mode come from.
const portionRoute = () => ({ learn: "/portion", climb: "/freeplay/portion", freetype: "/freetype/portion" })[S.mode];
const ownText = () => S.mode === "freetype" && S.freetypeVariant === "custom";
// The next portions of Climb or Freetype: from the server, or from your own text.
const getPortions = (body) => ownText() ? Promise.resolve(customPortions(body.start)) : postJSON(portionRoute(), body);

// Has the user typed anything in this round yet?
export const roundStarted = () => startTime !== null;

// A time round: is the time up?
const timeUp = (now) => limit.kind === "time" && startTime !== null && now - startTime >= limit.n * 1000;

// A letter opened: its chip pops with a soft ring (renderLetters, .chip.pop),
// its key glows once, and the Learn panel names it after the round. Calm on purpose:
// a new letter is good news, not a party.
function newLetter(l) {
  roundNewLetter = l;
  // the round's last answer (/results) opens it but brings no portion, so
  // S.exercise still had it locked: the letters row and the result showed
  // it as the next letter after it had opened
  const ex = S.exercise;
  if (ex?.locked?.includes(l)) S.exercise = { ...ex, unlocked: [...ex.unlocked, l], locked: ex.locked.filter((c) => c !== l) };
  markNewLetter(l);
  glowKey(l);
}

// A new round: an empty text, then AheadPortions + 1 portions at once.
function resetStream() {
  streamId++;
  queue = Promise.resolve();
  S.text = ""; S.pos = 0; wordClean = true; wordsTyped = 0;
  state = new Uint8Array(0); focusMask = new Uint8Array(0); records = []; spans = [];
  portions = []; sentUpTo = 0; current = 0; roundNewLetter = ""; roundNewLap = 0; wordsLoaded = 0; endAt = -1;
  wordOf = new Int32Array(0); revealAt = 0; shownWords = 0;
  extras = new Map(); correctChars = 0; afterBackspace = false; afterPause = false;
  pausedAt = null; el.textBox.classList.remove("snap", "paused");
  backWord = -1; backErrors = 0; fixedWords = new Set();
  startTime = null; lastTime = null; presses = 0; correctPresses = 0; perSecond = [];
  resetGlide();                               // a new round starts at the full glide
  el.text.replaceChildren(el.caret);          // the caret lives inside the text
}

// Starts a new round in the current mode: an empty text and the first
// portions from the server. (The name is older than the word "round".)
// Called on start, on a language or mode change, by Esc before the first key
// and after every result screen.
export async function loadExercise() {
  resetStream();
  const id = streamId;
  // Climb: the level picked or reached (S.climbLevel), or where the user
  // stands (0: the server knows, at the first round in this language)
  const body = { start: true, recent: [], list: roundList(), variant: S.freetypeVariant, level: S.climbLevel ?? 0 };
  const res = await getPortions(body);
  if (id !== streamId) return;
  roundBefore = S.lastStats;
  if (S.mode === "climb" && res.level !== S.climbLevel) { S.climbLevel = res.level; renderModeBar(); renderLetters(); }
  limit = lengthOf(S.settings.length);
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
  if (!el.live.classList.contains("final")) { setLive(el.wpm, 0, true); setLive(el.raw, 0, true); setLive(el.acc, 100, true); }
  lightNext();
  showPortion(0);
  placeCaret(true);
  requestAnimationFrame(keepTextInView);     // after the keyboard has its size for this window
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
// The next key on the keyboard (keyboard.js) and the next letter in the
// colour of its finger (a setting, on while the keyboard is shown): the
// finger is seen without looking down from the text (owner, 2026-10-22).
// Only the old and the new letter change.
let tinted = null;
export function lightNext() {
  highlightNextKey();
  if (tinted) { tinted.classList.remove("fnext"); tinted = null; }
  if (!S.settings.fingerText || S.kbHidden || !S.nextFc) return;
  const s = spans[S.pos];
  if (!s) return;
  s.style.setProperty("--fc", S.nextFc);
  s.classList.add("fnext");
  tinted = s;
}

// The sample of position i. Created at the first press there and never
// deleted, so a mistake fixed with Backspace still counts for the letter.
// typed: the key pressed; the first wrong one at a place is kept, so the
// stats can show which keys you mix up (history.Confusions on the server)
function record(i, wrong, now, typed) {
  let r = records[i];
  if (!r) {
    // not measured: the first press of the round, and a press right after a
    // Backspace (that time is spent correcting, not moving a finger)
    const ms = lastTime === null || afterBackspace || afterPause ? 0 : Math.round(now - lastTime);
    r = records[i] = { char: S.text[i], errors: 0, ms };
  }
  if (wrong) {
    r.errors++;
    if (r.typed === undefined) r.typed = typed;
  }
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
  keySound(false);
  if (wordClean) breakStreak();
  wordClean = false;
  flinchCaret();
}
export function handleChar(ch) {
  if (!canType()) return;
  if (pausedAt !== null) resumeRound(performance.now());
  const expected = S.text[S.pos];
  // space at the start of a word means nothing (as on monkeytype)
  if (ch === " " && expected !== " " && S.pos === wordStart(S.pos)) return;
  const now = performance.now();
  if (timeUp(now)) { finishRound(); return; }   // a key after the time is up does not count
  paceGlide(now);                              // the caret's glide follows the pace (caret.js)

  // Not a typing mistake but a wrong keyboard setting: Caps Lock, or the
  // system layout is set to another language. Not counted, just explained.
  // Checked before the round starts: such a key must not start it (it did,
  // with no time of a last key, so the pause check ended the empty round at
  // once and loaded a new text on every key; owner, 2026-10-18).
  if (ch !== expected && /\p{L}/u.test(ch)) {
    if (ch.toLowerCase() === expected) { showWarn("caps"); return; }
    if (!S.alphabet.has(ch.toLowerCase())) {
      foreignKey();
      return;
    }
  }
  if (startTime === null) {
    startTime = now;
    el.live.classList.remove("final");
    keepTextInView();
  }
  el.textBox.classList.add("typing");
  setTyping(true);                         // does nothing if it is on already
  if (ch === expected && warnShowing()) hideWarn();
  presses++;
  const sec = Math.floor((now - startTime) / 1000);
  perSecond[sec] = (perSecond[sec] ?? 0) + 1;   // real keys only: skipped letters are not presses
  let roundOver = false;

  // "Stop on a mistake" (a setting): a wrong key, a space inside a word or
  // a letter where the space belongs leaves the caret where it is, red
  // until the right key comes. The mistake is counted exactly as without
  // the setting: one more wrong press at this position (record), and the
  // time of the letter is the time to its first press.
  if (S.settings.stop && ch !== expected) {
    record(S.pos, true, now, ch);
    setState(S.pos, 2);
    pulseKey(ch, false);
    mistake();
    lastTime = now; afterBackspace = false; afterPause = false;
    return;
  }

  if (expected === " " && ch !== " ") {
    // a letter where the space belongs: an "extra" letter, the cursor stays
    record(S.pos, true, now, ch);
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
      record(S.pos, !ok, now, ch);
      setState(S.pos, ok ? 1 : 2);
      if (ok) { correctPresses++; keySound(true); }
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
  lastTime = now; afterBackspace = false; afterPause = false;
  // after lastTime: the time of the round ends with this keypress
  if (roundOver) { placeCaret(false, true); finishRound(true); return; }   // the caret goes past the last letter too
  lightNext();
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
  if (pausedAt !== null) resumeRound(performance.now());
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
  lightNext();
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

// ---------- the end of a word ----------
function endWord() {
  wordsTyped++;
  reveal();                                  // one word finished: one more appears
  renderProgress();
  updateLive();                              // the numbers change once per word: calm, readable
  if (wordClean) cleanWord();
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
// ---------- Tab: start the round again ----------
// As on monkeytype (owner, 2026-10-16, reversing the earlier "no restart"
// rule): Tab drops the round being typed and starts a fresh one. The dropped
// round is not saved as a round (no history, no result). The keypresses
// already sent with its portions stay with the letter model: they were
// real presses, and the server learned them on the way (/portion).
export function restartRound() {
  if (S.busy) return;
  el.live.classList.remove("final");
  loadExercise().catch(console.error);
}

// The Caps Lock / wrong layout warning lives in warn.js. Its check of the
// system layout runs once a second, only while no round is being typed
// (input.js also asks when the window comes back).
export function checkLayout() {
  if (startTime === null) layoutCheck();
}
setInterval(checkLayout, 1000);   // a clock, not an animation: one small question a second

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
  setLive(el.wpm, Math.round(currentWpm()));
  setLive(el.raw, Math.round(currentRaw()));
  setLive(el.acc, Math.round(currentAccuracy()));
}
// A live number counts smoothly to its new value (owner, 2026-10-18: the
// jump once per word looked choppy): the value is the CSS property --v,
// registered as an integer, and a transition counts through the numbers in
// between (layout.css .metric > span::after). instant: no counting (a new
// round starting from 0). A browser without @property shows the new number
// at once.
function setLive(node, n, instant = false) {
  if (instant) {
    node.classList.add("snap");
    requestAnimationFrame(() => node.classList.remove("snap"));
  }
  node.style.setProperty("--v", n);
  node.dataset.v = n;          // the number as text, for tests and screen readers (aria-label below)
  node.setAttribute("aria-label", n);
}

// ---------- "typing now": the header steps back ----------
// From the first keypress to the end of the round the body has the class
// "typing-now": the logo turns grey, the languages, the account and the
// navigation almost vanish (layout.css).
let typingNow = false;
export function setTyping(on) {
  if (on === typingNow) return;
  typingNow = on;
  document.body.classList.toggle("typing-now", on);
}

// Twice a second: the end of the time in a time round (whose counter shows
// the seconds left) ends it, a long pause pauses it, and Learn's daily
// goal shows the round's time so far (learnpanel.js tickGoal). A long pause used
// to END the round (owner, 2026-10-18: "it ends by itself, at random"): it
// is now the pause screen, from the last key on, so none of the time away
// counts. A timer is fine here: it is a clock, not an animation, and it
// never runs per keypress. It also catches a time round that ends while no
// key is pressed.
setInterval(() => {
  if (startTime === null || S.busy || pausedAt !== null) return;
  const now = performance.now();
  if (limit.kind === "time") renderProgress();
  S.roundSeconds = (now - startTime) / 1000;
  // the daily goal's time runs on with the round (Learn); reached, it
  // pauses the round and says why (owner, 2026-10-22)
  if (tickGoal()) { pauseRound(now, "goal"); return; }
  if (timeUp(now)) finishRound();
  else if (now - lastTime > IDLE_PAUSE_MS) pauseRound(lastTime);
}, 500);

// Leaving the window (Alt+Tab, another app, a hidden tab; input.js) or a
// long pause pauses the round: its clock stops, so a time round does not
// run out and the pause is not in the round's speed (owner, 2026-10-18).
// Before the first key too (owner: "at the start it does not pause"):
// then there is no clock yet, only the pause screen. The text blurs under a
// "paused" note (typing.css .text-box.paused). It is put on at once, with no
// fade: a window out of sight draws nothing, so a fade would only start
// when you come back (owner: "the text shows for a second, then blurs").
// The letter model is safe either way (the engine ignores gaps over
// MaxIntervalMs). since: when the pause began (default: now).
export function pauseRound(since, why) {
  if (pausedAt !== null || S.busy || !S.text) return;
  if (S.view !== "type" || el.textBox.classList.contains("resulting")) return;   // nothing being typed
  pausedAt = typeof since === "number" ? since : performance.now();
  el.textBox.classList.add("snap", "paused");
  el.textBox.classList.toggle("goal", why === "goal");   // the note says why: the daily goal reached
}
// The first key after a pause goes on with the round: the time away is
// taken out (the start and the last key move forward by it, as if it never
// happened), and this key's own time is not measured (it is finding the
// place again, not moving a finger).
function resumeRound(now) {
  const away = now - pausedAt;
  if (startTime !== null) {                 // a round already begun: take the time away out
    startTime += away;
    if (lastTime !== null) lastTime += away;
    afterPause = true;
  }
  pausedAt = null;
  el.textBox.classList.remove("snap", "paused", "goal");   // coming back fades in as usual
}

// The round is over (the last letter of its last word, or the end of the
// time): the numbers of the round go to the history, then the next round
// starts: in Learn at once, with what changed on the Learn panel
// (learnpanel.js; owner, 2026-10-20: no result screen in Learn), in Climb
// and Freetype after their result screen. The time of the round ends at
// its last keypress, so a quiet end of a time round does not lower the WPM.
// byLastKey: it ended with its last letter; the finished text then stays
// for FEEL.resultHoldMs (the last letter turns white, the caret arrives).
// Before a result screen it also fades out in its second half (class
// "ending", a CSS transition), the keyboard and hands with it; Learn keeps
// them, its next text simply fades in. A plain wait before a screen
// change, not an animation; S.busy keeps every key and the clock out of
// it. result.js takes "ending" off when the result opens, the finally
// below otherwise.
async function finishRound(byLastKey = false) {
  S.busy = true;
  const end = lastTime;
  if (byLastKey && FEEL.resultHoldMs > 0) {
    if (!learning()) el.textBox.classList.add("ending");
    await new Promise((r) => setTimeout(r, FEEL.resultHoldMs));
  }
  const wpm = Math.round(currentWpm(end) * 10) / 10;
  const accuracy = Math.round(currentAccuracy() * 10) / 10;
  // the live line keeps showing this result (in white) until the next
  // round starts
  el.live.classList.add("final");
  setTyping(false);
  setLive(el.wpm, Math.round(wpm));
  setLive(el.raw, Math.round(currentRaw(end)));
  setLive(el.acc, Math.round(accuracy));
  if (limit.kind === "time") renderProgress();          // the seconds left when it stopped (0: time is up)
  const typed = records.filter(Boolean);              // every sample of the round
  const samples = records.slice(sentUpTo).filter(Boolean); // the ones not sent with a portion yet
  try {
    await queue;                                       // portions still on their way
    streamId++;                                        // nothing more for this round
    if (!typed.length) { await loadExercise(); return; } // nothing typed: nothing to keep
    restCheck((end - startTime) / 1000);
    if (S.mode === "climb") { await finishFree(wpm, accuracy, typed, fullSeconds(end)); return; }
    if (S.mode === "freetype") { await finishFreetype(wpm, accuracy, typed, fullSeconds(end)); return; }
    // keys: the whole round, kept by the server as its raw record (it learns only from samples)
    const res = await postJSON("/results", {
      samples, keys: typed, chars: typed.length, wpm, accuracy, perSecond: fullSeconds(end), length: S.settings.length, device: device(),
    });
    firstRoundDone();
    await refreshStats();
    if (res.newLetter) newLetter(res.newLetter);
    if (res.newLap) roundNewLap = res.newLap;

    const r = compareStats(roundBefore, S.lastStats);
    markMastered(r.mastered);                 // their chips shine when the next round is drawn
    const milestone = roundNews({ ...r, wpm, newLetter: roundNewLetter, newLap: roundNewLap });
    if (r.best || milestone) FX.burstFrom(el.wpm, 80);
    refreshActivity();      // today's minutes on the panel (it draws itself when they come)
    // the panel has the round's numbers now; the live line starts again at 0
    el.live.classList.remove("final");
    await loadExercise();   // built from the UPDATED model
  } catch (err) {
    // said where the eyes are (it used to go only to the screen-reader
    // line), and a fresh round starts, so the screen never stays frozen
    console.error(err);
    FX.toast(t("err.save"));
    loadExercise().catch(console.error);
  } finally {
    el.textBox.classList.remove("ending");
    S.busy = false;
  }
}

// The rest reminder (a setting, S.settings.rest minutes, "0" = off): after
// that much typing with no break, one calm message suggests a rest. A gap
// of REST_BREAK_MS between rounds is a break and starts the count again.
// Called once per finished round, never per key.
const REST_BREAK_MS = 5 * 60 * 1000;
let restTyped = 0, restAt = 0;   // seconds typed since the last break; when the last round ended
function restCheck(seconds) {
  const now = Date.now();
  if (now - restAt - seconds * 1000 > REST_BREAK_MS) restTyped = 0;
  restAt = now;
  restTyped += seconds;
  const limit = Number(S.settings.rest);
  if (limit && restTyped >= limit * 60) {
    restTyped = 0;
    FX.toast(t("toast.rest", { m: limit }));
  }
}

// The end of a Climb round: it goes to Climb's history only (POST
// /freeplay/results) with the level it was typed at, never to the letter
// statistics. The answer says what the round counted for and where the
// next one starts (freeplay.Standing).
// What the round is typed on, stored with it (recorded only, for later:
// phone rounds may later count differently, docs/ALGORITHM.md section 9)
const device = () => (isTouch() ? "touch" : "keyboard");

async function finishFree(wpm, accuracy, keys, perSecond) {
  const before = S.climb?.sessions ?? [];
  const level = S.climbLevel;
  const res = await postJSON("/freeplay/results", { wpm, accuracy, chars: keys.length, perSecond, keys, length: S.settings.length, device: device(), level });
  firstRoundDone();
  S.climbLevel = res.place.level;                // the next round
  refreshActivity();        // the daily goal counts every mode
  await refreshFreeplay();
  renderLetters();
  const best = before.length > 0 && wpm > Math.max(...before.map((x) => x.wpm));
  if (best) FX.burstFrom(el.wpm, 80);
  await showResult({ wpm, accuracy, consistency: res.consistency, best, climb: { level, verdict: res.verdict, place: res.place, weak: res.weak }, words: typedWords(), ...roundFacts() });
  await loadExercise();
}

// The end of a Freetype round: it goes to the history of its word list and
// kind of text (POST /freetype/results; your own text has no list). A
// personal best is the fastest round of this history and length.
async function finishFreetype(wpm, accuracy, keys, perSecond) {
  const variant = S.freetypeVariant, list = roundList();
  const before = S.freetype?.sessions ?? [];
  const res = await postJSON("/freetype/results", { wpm, accuracy, chars: keys.length, perSecond, keys, length: S.settings.length, device: device(), list, variant });
  if (variant === "custom") customRoundDone(wordsTyped);    // saved: the next round goes on from here
  firstRoundDone();
  refreshActivity();        // the daily goal counts every mode
  await refreshFreeplay();
  const best = before.length > 0 && wpm > Math.max(...before.map((x) => x.wpm));
  if (best) FX.burstFrom(el.wpm, 80);
  await showResult({ wpm, accuracy, consistency: res.consistency, best, list, variant, words: typedWords(), ...roundFacts() });
  await loadExercise();
}
