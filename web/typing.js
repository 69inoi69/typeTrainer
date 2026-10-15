// The typing screen: the text stream (portions of words added while you
// type, in rounds of 30 words), the caret, what every keypress does, the
// clean-word streak, the live WPM / accuracy, the letters bar, and sending
// the result when a round ends.
// Layer: middle. Imports the bottom layer, keyboard.js, stats.js and result.js.

import { t, tPick } from "./i18n.js";
import { FX } from "./fx.js";
import { $, el, S, introOpen } from "./state.js";
import { postJSON } from "./api.js";
import { highlightNextKey, pulseKey, requestFit } from "./keyboard.js";
import { refreshStats } from "./stats.js";
import { showResult } from "./result.js";

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
let popLetter = null;      // letter that was just unlocked (for the animation)

// Rewards (they change nothing in the statistics, they only feel nice)
let streak = 0;            // words in a row typed without a single mistake
let wordClean = true;      // no mistake in the current word so far
let tabsResisted = 0;      // Tab presses during this round (no restart here)
let justMastered = new Set(); // letters just mastered (their chips shine)

// The text window always shows TEXT_LINES lines at one font size (style.css,
// .text): it never changes size between exercises. A text that needs more
// lines scrolls: the line you type stays the second one (as on monkeytype).
// fitText runs on a new text and on resize, never on a keypress: it reads the
// line height once and starts at the top.
const TEXT_LINES = 3;
let lineH = 0;
export function fitText() {
  if (S.view !== "type") return;
  lineH = parseFloat(getComputedStyle(el.text).lineHeight) || 0;
  el.text.style.scrollBehavior = "auto";     // a new text starts at the top at once
  el.text.scrollTop = 0;
  el.text.style.removeProperty("scroll-behavior");
}

// ---------- caret ----------
// One caret element that slides to the current letter (CSS transition on
// transform). We read the letter's position once per animation frame.
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
    // it is the second one (smooth, CSS scroll-behavior)
    if (lineH) {
      const line = Math.round(s.offsetTop / lineH);
      const top = Math.max(0, Math.min(line - 1, Math.ceil(el.text.scrollHeight / lineH) - TEXT_LINES)) * lineH;
      if (Math.abs(el.text.scrollTop - top) > 1) el.text.scrollTop = top;
    }
    if (jump) requestAnimationFrame(() => el.caret.classList.remove("jump"));
  });
}
// ---------- letters bar ----------
const STAT_ICONS = {
  open: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  // focus: a crosshair, the trainer has "locked on" this letter
  focus: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  // next: a key, the one that opens the next letter
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2.5"/>',
};
function renderLetters() {
  if (!S.exercise) return;
  const info = {};
  for (const k of S.lastStats?.keys ?? []) info[k.char] = k;
  const focusHasData = (info[S.exercise.focus]?.count ?? 0) > 0;

  const frag = document.createDocumentFragment();
  const add = (c, cls) => {
    const chip = document.createElement("span");
    chip.className = "chip " + cls;
    chip.textContent = c;
    if (c === popLetter) chip.classList.add("pop");
    if (justMastered.has(c)) chip.classList.add("shine");
    frag.appendChild(chip);
  };
  for (const c of S.exercise.unlocked) {
    let cls = info[c]?.mastered ? "mastered" : "";
    if (c === S.exercise.focus && (focusHasData || c === popLetter)) cls += " focus";
    add(c, cls);
  }
  for (const c of S.exercise.locked) add(c, "locked");
  el.letters.replaceChildren(frag);

  // every key you do not need yet is dimmed on the keyboard
  const open = new Set([...S.exercise.unlocked, " "]);
  const altOf = Object.fromEntries(Object.entries(S.altBase).map(([a, b]) => [b, a]));
  for (const [c, key] of Object.entries(S.keyEls)) key.classList.toggle("locked", !open.has(c) && !open.has(altOf[c]));
  if (S.altgrEl) S.altgrEl.classList.toggle("locked", !S.exercise.unlocked.some((c) => S.altBase[c]));

  // status line: small pills with an icon each (details in their tooltips)
  const openCount = S.exercise.unlocked.length;
  const all = openCount + S.exercise.locked.length;
  const mastered = S.exercise.unlocked.filter((c) => info[c]?.mastered).length;
  const started = (S.lastStats?.keys ?? []).some((k) => k.count > 0);   // anything typed yet
  const pill = (icon, cls, tip, label, value) =>
    `<span class="stat ${cls}" data-tip="${tip}"><svg viewBox="0 0 24 24" aria-hidden="true">${STAT_ICONS[icon]}</svg>` +
    `<span class="lbl">${label}</span>${value}</span>`;
  const parts = [];
  if (!started) {
    parts.push(pill("open", "", "tip.open", t("stat.open"), `<b>${openCount}/${all}</b>`));
    parts.push(`<span class="begin">${t("stat.begin")}</span>`);
    if (S.exercise.locked.length) parts.push(`<span class="begin">${t("openAll")}</span>`); // a button inside
  } else {
    if (focusHasData) parts.push(pill("focus", "focus", "tip.focus", t("stat.focus"), `<b class="lt">${S.exercise.focus}</b>`));
    const pct = openCount ? Math.round((mastered / openCount) * 100) : 0;
    parts.push(pill("check", "ok", "tip.mastered", t("stat.mastered"),
      `<span class="mini"><i style="width:${pct}%"></i></span><b>${mastered}/${openCount}</b>`));
    if (S.exercise.locked.length) parts.push(pill("key", "next", "tip.next", t("stat.next"), `<b class="lt">${S.exercise.locked[0]}</b>`));
  }
  el.lettersCaption.innerHTML = parts.join("");
  popLetter = null;
  justMastered = new Set();
}

// ---------- the stream ----------
// The text is not built in one go: it is a stream of short portions (a few
// words around one focus letter, Generator.Portion on the server). When the
// last word of a portion is typed, its samples go to POST /portion, the model
// learns from them at once, and the answer is the next portion, built from
// the UPDATED statistics and added at the end of the text. AheadPortions
// portions are always waiting after the one being typed, so the words you can
// already see never change. A round is RoundPortions portions (30 words); it
// ends with its last word, or earlier with Esc or a long pause, see finishRound().
const IDLE_STOP_MS = 10000;  // no key for this long during a round = the user stopped
const RECENT_SENT = 40;      // words of the round sent as "recent" (the server uses the last RecentWords)
let portions = [];           // {start, end, focus}: positions of each portion; end = its last space
let sentUpTo = 0;            // positions before this were sent to the server (Backspace cannot go there)
let current = 0;             // index of the portion with the caret
let streamId = 0;            // a new round ignores answers that were meant for the old one
let queue = Promise.resolve(); // portion requests go one after another
let round = Infinity;        // portions in a round (from the server)
let roundWords = 0;          // words in a round, for the counter
let wordsTyped = 0;          // words finished in this round
let roundBefore = null;      // the statistics when the round started (for the result)
let roundNewLetter = "";     // a letter that opened during the round

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
  for (let i = old; i < S.text.length; i++) records.push(null);
  let at = old;
  for (const p of list) {
    if (!p.words.length) continue;
    const end = at + p.words.join(" ").length;   // the space after the last word
    portions.push({ start: at, end, focus: p.focus });
    for (let i = at; i < end; i++) if (S.text[i] === p.focus) focusMask[i] = 1;
    at = end + 1;
  }
  const frag = document.createDocumentFragment();   // one DOM update, not one per letter
  for (let i = old; i < S.text.length; i++) {
    const sp = document.createElement("span");
    sp.textContent = S.text[i];
    if (focusMask[i]) sp.className = "fx";
    frag.appendChild(sp);
    spans.push(sp);
  }
  el.text.insertBefore(frag, el.caret);
  const last = list.at(-1);
  S.exercise = { ...(S.exercise ?? {}), unlocked: last.unlocked, locked: last.locked };
}

// The letters bar shows the focus of the portion with the caret.
function showPortion(i) {
  current = i;
  if (portions[i]) S.exercise.focus = portions[i].focus;
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
    if (bad) out.push(S.text.slice(i, end));
    i = end + 1;
  }
  return out;
}

// The last space of portion k was typed: send it, get the next portion
// (none once the round has all of them). The last portion ends the round.
function portionDone(k) {
  if (k === round - 1) { finishRound(); return; }
  const por = portions[k];
  const samples = records.slice(sentUpTo, por.end + 1).filter(Boolean);
  sentUpTo = por.end + 1;
  showPortion(k + 1);
  const body = { samples, retry: mistypedWords(por), last: portions.length >= round };
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

// A letter opened: its chip pops now, the result of the round names it.
function newLetter(l) {
  popLetter = roundNewLetter = l;
  FX.burstFrom(el.letters, 60);
}

// A new round: an empty text, then AheadPortions + 1 portions at once.
function resetStream() {
  streamId++;
  queue = Promise.resolve();
  S.text = ""; S.pos = 0; wordClean = true; tabsResisted = 0; wordsTyped = 0;
  state = new Uint8Array(0); focusMask = new Uint8Array(0); records = []; spans = [];
  portions = []; sentUpTo = 0; current = 0; roundNewLetter = "";
  extras = new Map(); correctChars = 0; afterBackspace = false;
  startTime = null; lastTime = null; presses = 0; correctPresses = 0;
  el.text.replaceChildren(el.caret);          // the caret lives inside the text
}

export async function loadExercise() {
  resetStream();
  const id = streamId;
  const res = await postJSON("/portion", { start: true, recent: [] });
  if (id !== streamId) return;
  roundBefore = S.lastStats;
  round = res.round || Infinity;
  roundWords = round * (res.portions[0]?.words.length ?? 0);
  appendPortions(res.portions);
  renderProgress();
  fitText();                                 // back to the first line
  requestFit();                              // more lines (narrow window) leave less room for the keyboard
  el.text.classList.remove("swap");
  void el.text.offsetWidth;                  // restart the fade-in (once per round)
  el.text.classList.add("swap");
  el.textBox.classList.remove("typing");
  setTyping(false);
  el.caret.classList.remove("fast");
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
    // not measured: the first press of the exercise, and a press right after a
    // Backspace (that time is spent correcting, not moving a finger)
    const ms = lastTime === null || afterBackspace ? 0 : Math.round(now - lastTime);
    r = records[i] = { char: S.text[i], errors: 0, ms };
  }
  if (wrong) r.errors++;
}
const wordHasError = (start, end) =>
  state.subarray(start, end).some((s) => s >= 2) || (extras.get(end)?.length ?? 0) > 0;
function mistake() {
  if (wordClean) breakStreak();
  wordClean = false;
}

export function handleChar(ch) {
  if (!canType()) return;
  const expected = S.text[S.pos];
  // space at the start of a word means nothing (as on monkeytype)
  if (ch === " " && expected !== " " && S.pos === wordStart(S.pos)) return;
  const now = performance.now();
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
      if (space) endWord();
      S.pos++;
      if (space && S.pos - 1 === portions[current]?.end) portionDone(current);
    }
  }
  lastTime = now; afterBackspace = false;
  highlightNextKey();
  placeCaret(false);
}

// Backspace: one character back in the current word (extra letters go
// first); with Ctrl the whole word. From the start of a word it goes back
// into the previous word, but only if that word has a mistake and its
// portion was not sent to the server yet. Only the screen changes: the
// samples (records) keep every mistake.
export function backspace(wholeWord) {
  if (!canType() || startTime === null) return;
  if (S.pos === wordStart(S.pos)) {
    const space = S.pos - 1;
    if (S.pos <= sentUpTo || !wordHasError(wordStart(space), space)) return;
    setState(space, 0);
    S.pos = space;
    while (S.pos > 0 && state[S.pos - 1] === 3) setState(--S.pos, 0);   // skipped = not typed
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
// words typed in this round, out of the words in the round
function renderProgress() {
  el.progress.textContent = `${Math.min(wordsTyped, roundWords)}/${roundWords}`;
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
// answers with a small animation and a kind message, and counts the urge.
export function nudge() {
  if (startTime !== null) tabsResisted++;
  FX.anim(el.caret, [{ scale: "1 1" }, { scale: "2.2 1.3" }, { scale: "1 1" }], { duration: 380, easing: "cubic-bezier(.3,1.6,.5,1)" });
  FX.anim(el.text, [{ translate: "0" }, { translate: "6px" }, { translate: "-4px" }, { translate: "2px" }, { translate: "0" }], { duration: 420, easing: "ease-out" });
}

function showWarn(kind) {
  const info = S.languages.find((l) => l.id === S.lang);
  el.warn.innerHTML = kind === "caps" ? t("warn.caps") : t("warn.layout", { layout: info?.systemLayout ?? S.lang });
  el.warn.classList.add("show");
  $("caption-slot").classList.add("warning");   // the status line fades out under it
}
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
function currentAccuracy() {
  return presses ? (correctPresses / presses) * 100 : 100;
}
// Called once per word, not per keypress. The caret turns green while the
// speed is at or over the goal of the trainer (targetWpm), so you can feel
// the pace without looking at the numbers.
function updateLive() {
  const wpm = currentWpm();
  el.wpm.textContent = Math.round(wpm);
  el.raw.textContent = Math.round(currentRaw());
  el.acc.textContent = Math.round(currentAccuracy());
  const goal = S.lastStats?.targetWpm;
  el.caret.classList.toggle("fast", !!goal && wpm >= goal);
}

// ---------- "typing now": the header steps back ----------
// From the first keypress to the end of the exercise the body has the class
// "typing-now": the logo turns grey and the header controls almost vanish
// (style.css), and the small phrase over the logo changes to a typing one.
let typingNow = false;
export function setTyping(on) {
  if (on === typingNow) return;
  typingNow = on;
  document.body.classList.toggle("typing-now", on);
  setMotto(on);
}
// The small phrase over the logo: a random "typing" one while you type, the
// start phrase otherwise. Changes with a short fade.
export function setMotto(typing = typingNow) {
  el.motto.textContent = typing ? tPick("motto.typing") : t(`splash.${S.mottoIndex}`);
  FX.anim(el.motto, [{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 250, easing: "ease-out" });
}

// What one round changed: a new record, letters mastered, and which
// letters got faster or slower (smoothed time per letter, avgMs, before and
// after). Only letters typed in this round count. Display only.
const CHANGE_MIN = 0.03;   // a letter must change by 3 % or more to be named
function compareStats(before, after, samples) {
  const prev = Object.fromEntries((before?.keys ?? []).map((k) => [k.char, k]));
  const typed = new Set(samples.map((x) => x.char).filter((c) => c !== " "));
  const best = (before?.sessionCount ?? 0) > 0 &&
    (after.sessions[0]?.wpm ?? 0) > Math.max(0, ...before.sessions.map((x) => x.wpm));   // /stats: newest first
  const mastered = after.keys.filter((k) => k.mastered && !prev[k.char]?.mastered).map((k) => k.char);
  const change = after.keys
    .filter((k) => typed.has(k.char) && prev[k.char]?.count > 0 && prev[k.char].avgMs > 0)
    .map((k) => ({ c: k.char, pct: Math.round((1 - k.avgMs / prev[k.char].avgMs) * 100) }))
    .filter((x) => Math.abs(x.pct) >= CHANGE_MIN * 100);
  const faster = change.filter((x) => x.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const slower = change.filter((x) => x.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 2);
  return { best, mastered, faster, slower };
}

// a long pause ends the round
setInterval(() => {
  if (startTime !== null && !S.busy && performance.now() - lastTime > IDLE_STOP_MS) finishRound();
}, 500);

// Esc: ends the round early (or, before the first key, just gives a new text).
export function stopRound() {
  if (S.busy) return;
  if (startTime === null) {
    el.live.classList.remove("final");
    loadExercise().catch(console.error);
  } else finishRound();
}

// The round is over (its last word, Esc or a long pause): the numbers of the
// round go to the history, the result screen shows what changed, then the
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
  const resisted = tabsResisted;
  const typed = records.filter(Boolean);              // every sample of the round
  const samples = records.slice(sentUpTo).filter(Boolean); // the ones not sent with a portion yet
  try {
    await queue;                                       // portions still on their way
    streamId++;                                        // nothing more for this round
    if (!typed.length) { await loadExercise(); return; } // nothing typed: nothing to keep
    const res = await postJSON("/results", { samples, chars: typed.length, wpm, accuracy });
    await refreshStats();
    if (res.newLetter) newLetter(res.newLetter);

    const r = compareStats(roundBefore, S.lastStats, typed);
    justMastered = new Set(r.mastered);
    if (r.best) FX.burstFrom(el.wpm, 80);
    await showResult({ wpm, accuracy, newLetter: roundNewLetter, resisted, ...r });
    await loadExercise();   // built from the UPDATED model
  } catch (err) {
    console.error(err);
    el.hint.textContent = t("err.server");
  } finally {
    S.busy = false;
  }
}
