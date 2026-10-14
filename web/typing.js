// The typing screen: the exercise text, the caret, what every keypress does,
// the clean-word streak, the live WPM / accuracy, the letters bar, and
// sending the result when the exercise is done.
// Layer: middle. Imports the bottom layer, keyboard.js and stats.js.

import { t, tPick, hasText } from "./i18n.js";
import { FX } from "./fx.js";
import { $, el, S, introOpen } from "./state.js";
import { getJSON, postJSON } from "./api.js";
import { highlightNextKey, pulseKey, requestFit } from "./keyboard.js";
import { refreshStats } from "./stats.js";

// Typing state, used only by the typing code.
let wrongScript = 0;       // presses in a row that came from another keyboard layout
let spans = [];            // one <span> per character
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
let tabsResisted = 0;      // Tab presses during this exercise (no restart here)
let justMastered = new Set(); // letters mastered in the last exercise (chips shine)

// The exercise text takes at most TEXT_LINES lines: the text box is wide, and
// if the words are still too long the font gets a little smaller (down to
// 80 %; below that, on a narrow window, the text may take more lines). Reads
// the layout a few times, so it runs on a new text and on resize, never on a
// keypress.
const TEXT_LINES = 2;
export function fitText() {
  if (!spans.length || S.view !== "type") return;
  el.text.style.removeProperty("font-size");
  const cs = getComputedStyle(el.text);
  const base = parseFloat(cs.fontSize);
  const lines = () => Math.round((spans.at(-1).offsetTop - spans[0].offsetTop) / parseFloat(cs.lineHeight)) + 1;
  for (let size = base; lines() > TEXT_LINES && size > base * .8; ) {
    size -= 1;
    el.text.style.fontSize = size + "px";
  }
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
  const started = (S.lastStats?.sessionCount ?? 0) > 0;
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

// ---------- exercise ----------
function showExercise(ex) {
  S.exercise = ex;
  S.text = ex.text;
  S.pos = 0; wordClean = true; tabsResisted = 0;
  state = new Uint8Array(S.text.length); records = new Array(S.text.length).fill(null);
  extras = new Map(); correctChars = 0; afterBackspace = false;
  startTime = null; lastTime = null; presses = 0; correctPresses = 0;

  // build all spans at once with a fragment: one DOM update, not hundreds
  const frag = document.createDocumentFragment();
  spans = [...S.text].map((ch) => {
    const s = document.createElement("span");
    s.textContent = ch;
    frag.appendChild(s);
    return s;
  });
  el.text.replaceChildren(frag, el.caret);   // the caret lives inside the text
  fitText();                                 // at most 2 lines
  requestFit();                              // more lines (narrow window) leave less room for the keyboard
  el.text.classList.remove("swap");
  void el.text.offsetWidth;                  // restart the fade-in (once per exercise)
  el.text.classList.add("swap");
  el.textBox.classList.remove("typing");
  setTyping(false);
  if (!el.live.classList.contains("final")) { FX.roll(el.wpm, 0); FX.roll(el.raw, 0); FX.roll(el.acc, 100); }
  highlightNextKey();
  renderLetters();
  placeCaret(true);
}

export async function loadExercise() {
  showExercise(await getJSON("/exercise"));
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
const MAX_EXTRA = 10;
const ADVICE_CHANCE = 0.35; // after an exercise with no other message: chance of a tip      // extra letters shown after a word, more are only counted
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
  spans[i].className = ["", "ok", "bad", "miss"][s];
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
      if (S.text[S.pos] === " ") endWord();
      S.pos++;
    }
  }
  lastTime = now; afterBackspace = false;
  highlightNextKey();
  placeCaret(false);
  updateLive();
  if (S.pos === S.text.length) {
    endWord();
    finishExercise();
  }
}

// Backspace: one character back in the current word (extra letters go
// first); with Ctrl the whole word. From the start of a word it goes back
// into the previous word, but only if that word has a mistake. Only the
// screen changes: the samples (records) keep every mistake.
export function backspace(wholeWord) {
  if (!canType() || startTime === null) return;
  if (S.pos === wordStart(S.pos)) {
    const space = S.pos - 1;
    if (S.pos === 0 || !wordHasError(wordStart(space), space)) return;
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
  updateLive();
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
  if (wordClean) {
    const before = streakTier(streak);
    streak++;
    renderStreak();
    if (streakTier(streak) > before) FX.bump(el.streak, 1.25);   // next tier: a bigger jump
    else if (streak >= 3) FX.bump(el.streakN);
    if (streak === 10 || streak % 25 === 0) {   // at 10, then every 25 clean words: a small party
      FX.burstFrom(el.streak, 40);
      FX.toast(tPick("toast.streak", { n: streak }), { kind: "streak" });
    }
  }
  wordClean = true;
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
  if (FX.idle()) FX.toast(tPick("tab"), { kind: "tab" }); // never pile up messages
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
function currentWpm() {
  if (startTime === null) return 0;
  const minutes = (performance.now() - startTime) / 60000;
  return minutes > 0 ? (correctChars / 5) / minutes : 0;   // only what is right counts
}
// raw: every keypress counts, the wrong ones too (as on monkeytype).
// Shown in the header only; never sent to the server.
function currentRaw() {
  if (startTime === null) return 0;
  const minutes = (performance.now() - startTime) / 60000;
  return minutes > 0 ? (presses / 5) / minutes : 0;
}
function currentAccuracy() {
  return presses ? (correctPresses / presses) * 100 : 100;
}
function updateLive() {
  FX.roll(el.wpm, currentWpm());
  FX.roll(el.raw, currentRaw());
  FX.roll(el.acc, currentAccuracy());
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
// keep WPM ticking while the user pauses
setInterval(() => { if (startTime !== null && S.pos < S.text.length) updateLive(); }, 500);

async function finishExercise() {
  S.busy = true;
  const wpm = Math.round(currentWpm() * 10) / 10;
  const accuracy = Math.round(currentAccuracy() * 10) / 10;
  // the live line keeps showing this result (in white) until the next
  // exercise starts
  el.live.classList.add("final");
  setTyping(false);
  FX.roll(el.wpm, wpm);
  FX.roll(el.raw, currentRaw());
  FX.roll(el.acc, accuracy);
  // remember the state before, to see what this exercise achieved
  const prevBest = Math.max(0, ...(S.lastStats?.sessions ?? []).map((x) => x.wpm));
  const hadSessions = (S.lastStats?.sessionCount ?? 0) > 0;
  const prevMastered = new Set((S.lastStats?.keys ?? []).filter((k) => k.mastered).map((k) => k.char));
  const resisted = tabsResisted;
  // one sample per typed position, in text order (skipped letters have none)
  const samples = records.filter(Boolean);
  try {
    if (!samples.length) { await loadExercise(); return; }   // nothing typed: nothing to learn from
    const res = await postJSON("/results", { samples, wpm, accuracy });
    await refreshStats();

    if (hadSessions && wpm > prevBest) {
      FX.toast(tPick("toast.best", { wpm: Math.round(wpm) }), { kind: "best" });
      FX.burstFrom(el.wpm, 80);
    }
    if (res.newLetter) {
      popLetter = res.newLetter;
      // a joke about this letter if there is one, else a random one
      const l = res.newLetter;
      const joke = hasText(`joke.${l}`) ? t(`joke.${l}`) : tPick("joke", { letter: l });
      FX.toast(t("toast.newLetter", { letter: l, joke }), { kind: "letter", badge: l });
      FX.burstFrom(el.letters, 60);
    }
    justMastered = new Set(S.lastStats.keys.filter((k) => k.mastered && !prevMastered.has(k.char)).map((k) => k.char));
    if (justMastered.size) FX.toast(tPick("toast.mastered", { letters: [...justMastered].join(" ") }), { kind: "mastered" });
    if (resisted) FX.toast(tPick("toast.resisted", { n: resisted }), { kind: "resisted" });
    // now and then, when nothing else happened: a tip or a joke
    if (FX.idle() && Math.random() < ADVICE_CHANCE) FX.toast(tPick("advice"), { kind: "tip" });

    await loadExercise();   // generated from the UPDATED model
  } catch (err) {
    console.error(err);
    el.hint.textContent = t("err.server");
  } finally {
    S.busy = false;
  }
}
