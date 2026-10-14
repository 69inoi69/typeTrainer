// Typing trainer frontend. Plain JavaScript, no frameworks.
//
// Flow:  load layout -> load exercise -> user types (keydown) -> every
// typed position becomes a "sample" {char, errors, ms} -> exercise done ->
// POST samples to /api/v1/results (server updates the model, maybe unlocks
// a letter) -> GET a new exercise built from the updated model.

import { SPLASH_PHRASES, i18nVars, setUiLang, t, applyI18n } from "./i18n.js";
import { FX, Splash } from "./fx.js";
import { $, el, S, store, introOpen, isTouch, focusText } from "./state.js";
import { getJSON, postJSON } from "./api.js";
import { labelTips } from "./tools.js";
import { makeKey, drawKeyboard, highlightNextKey, pulseKey, applyKb, nearestKb, requestFit } from "./keyboard.js";
import { refreshStats, renderStats } from "./stats.js";

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
let tabMsg = 0;            // which of the Tab messages comes next
let justMastered = new Set(); // letters mastered in the last exercise (chips shine)

// the keyboard size switch
el.kbSwitch.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-kb]");
  if (!b) return;
  b.blur();
  const wasHidden = S.kbHidden;
  S.kbHidden = b.dataset.kb === "off";
  if (!S.kbHidden) S.kbSize = Number(b.dataset.kb);
  applyKb(wasHidden !== S.kbHidden);           // fold / unfold only when that changed
  placeCaret(true);
});
// The exercise text takes at most TEXT_LINES lines: the text box is wide, and
// if the words are still too long the font gets a little smaller (down to
// 80 %; below that, on a narrow window, the text may take more lines). Reads
// the layout a few times, so it runs on a new text and on resize, never on a
// keypress.
const TEXT_LINES = 2;
function fitText() {
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
function placeCaret(jump) {
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
window.addEventListener("resize", () => {
  fitText();
  requestFit();
  placeCaret(true);
  if (S.view === "stats") renderStats();
});

// ---------- letters bar ----------
const STAT_ICONS = {
  open: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
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
    if (S.exercise.locked.length) parts.push(pill("lock", "next", "tip.next", t("stat.next"), `<b class="lt">${S.exercise.locked[0]}</b>`));
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
  if (!el.live.classList.contains("final")) { el.wpm.textContent = "0"; el.raw.textContent = "0"; el.acc.textContent = "100"; }
  highlightNextKey();
  renderLetters();
  placeCaret(true);
}

async function loadExercise() {
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

function handleChar(ch) {
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
function backspace(wholeWord) {
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
    if (streak % 25 === 0) {                 // every 25 clean words: a small party
      FX.burstFrom(el.streak, 40);
      FX.toast(t("toast.streak", { n: streak }), { kind: "streak" });
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
function nudge() {
  if (startTime !== null) tabsResisted++;
  FX.anim(el.caret, [{ scale: "1 1" }, { scale: "2.2 1.3" }, { scale: "1 1" }], { duration: 380, easing: "cubic-bezier(.3,1.6,.5,1)" });
  FX.anim(el.text, [{ translate: "0" }, { translate: "6px" }, { translate: "-4px" }, { translate: "2px" }, { translate: "0" }], { duration: 420, easing: "ease-out" });
  if (FX.idle()) FX.toast(t(`tab.${tabMsg++ % 4}`), { kind: "tab" }); // never pile up messages
}

function showWarn(kind) {
  const info = S.languages.find((l) => l.id === S.lang);
  el.warn.innerHTML = kind === "caps" ? t("warn.caps") : t("warn.layout", { layout: info?.systemLayout ?? S.lang });
  el.warn.classList.add("show");
  $("caption-slot").classList.add("warning");   // the status line fades out under it
}
function hideWarn() {
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
  el.wpm.textContent = Math.round(currentWpm());
  el.raw.textContent = Math.round(currentRaw());
  el.acc.textContent = Math.round(currentAccuracy());
}
// keep WPM ticking while the user pauses
setInterval(() => { if (startTime !== null && S.pos < S.text.length) updateLive(); }, 500);

async function finishExercise() {
  S.busy = true;
  const wpm = Math.round(currentWpm() * 10) / 10;
  const accuracy = Math.round(currentAccuracy() * 10) / 10;
  // the header keeps showing this result until the next exercise starts;
  // the numbers count up from zero, just because it feels good
  el.live.classList.add("final");
  FX.countUp(el.wpm, Math.round(wpm));
  FX.countUp(el.raw, Math.round(currentRaw()));
  FX.countUp(el.acc, Math.round(accuracy));
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
      FX.toast(t("toast.best", { wpm: Math.round(wpm) }), { kind: "best" });
      FX.burstFrom(el.wpm, 80);
    }
    if (res.newLetter) {
      popLetter = res.newLetter;
      FX.toast(t("toast.newLetter", { letter: res.newLetter }), { kind: "letter", badge: res.newLetter });
      FX.burstFrom(el.letters, 60);
    }
    justMastered = new Set(S.lastStats.keys.filter((k) => k.mastered && !prevMastered.has(k.char)).map((k) => k.char));
    if (justMastered.size) FX.toast(t("toast.mastered", { letters: [...justMastered].join(" ") }), { kind: "mastered" });
    if (resisted) FX.toast(t("toast.resisted", { n: resisted }), { kind: "resisted" });

    await loadExercise();   // generated from the UPDATED model
  } catch (err) {
    console.error(err);
    el.hint.textContent = t("err.server");
  } finally {
    S.busy = false;
  }
}

// ---------- views: type / stats ----------
function setView(name) {
  S.view = name;
  const stats = name === "stats";
  el.switch.classList.toggle("stats", stats);
  el.tabType.setAttribute("aria-selected", String(!stats));
  el.tabStats.setAttribute("aria-selected", String(stats));
  el.viewType.hidden = stats;
  el.viewStats.hidden = !stats;
  if (stats) {
    refreshStats().catch(console.error);
    renderStats();
  } else {
    fitText();
    requestFit();
    placeCaret(true);
    focusText();
  }
}
el.tabType.addEventListener("click", (e) => { e.currentTarget.blur(); setView("type"); });
el.tabStats.addEventListener("click", (e) => { e.currentTarget.blur(); setView("stats"); });

// ---------- intro ----------
// Shown once, on the very first visit (it can be reopened with the "?" button).
// It is a short hands-on start, not a text to read: steps 0 and 1 wait for the
// real keys. We look at the PHYSICAL key (e.code), so it works whatever the
// system layout is: "KeyA" is the key under the left pinky on every keyboard.
const HOME_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"];
const HOME_INDEX = [0, 1, 2, 3, 6, 7, 8, 9];   // positions of those keys in the home row
const INTRO_LAST = 3;
let introStep = 0;
let introKeys = {};        // e.code -> key element in the intro home row
let introPressed = new Set();

// The home row of the current layout (A S D F · J K L ; / Ф Ы В А · О Л Д Ж).
function drawIntroKeys() {
  const row = S.layout.rows[1];
  const home = $("intro-home");
  home.innerHTML = "";
  introKeys = {};
  HOME_INDEX.forEach((idx, i) => {
    const key = makeKey(row[idx]);
    if (i === 4) home.appendChild(Object.assign(document.createElement("span"), { className: "gap" }));
    home.appendChild(key);
    introKeys[HOME_CODES[i]] = key;
  });
  // a copy of the hands for step 2, with the fingers lighting up one by one
  $("intro-hands").innerHTML = el.hands.innerHTML;
  $("intro-hands").querySelectorAll("[data-f]").forEach((f, i) => {
    f.classList.remove("on");
    f.style.setProperty("--d", i);       // animation delay: finger after finger
  });
}

function showIntro() {
  introStep = 0;
  introPressed = new Set();
  Object.values(introKeys).forEach((k) => k.classList.remove("hit"));
  $("intro-space").classList.remove("hit");
  const info = S.languages.find((l) => l.id === S.lang);
  $("intro-lang").textContent = info ? " · " + info.name : "";
  renderIntro();
  el.intro.classList.remove("hidden");
  document.activeElement?.blur();
}
function renderIntro() {
  document.querySelectorAll(".intro-step").forEach((s, i) => s.classList.toggle("active", i === introStep));
  document.querySelectorAll("#intro-dots i").forEach((d, i) => d.classList.toggle("on", i === introStep));
  const last = introStep === INTRO_LAST;
  $("intro-next").style.visibility = last ? "hidden" : "visible";
  $("intro-skip").style.visibility = last ? "hidden" : "visible";
  if (last) $("intro-new").focus();
}
function nextIntroStep() {
  if (introStep >= INTRO_LAST) return;
  introStep++;
  renderIntro();
}
// Advance after the key's little "pressed" animation has finished.
function advanceAfter(node) {
  const a = node.animate?.([{ scale: "1" }, { scale: "1.15" }, { scale: "1" }], { duration: 260, easing: "ease-out" });
  const step = introStep;
  const go = () => { if (introStep === step) nextIntroStep(); };
  if (a) a.finished.then(go, go); else go();
}
// Key presses while the intro is open.
function introKey(e) {
  if (e.key === "Escape") { e.preventDefault(); closeIntro(); return; }
  if (introStep === INTRO_LAST || e.key === "Tab") return; // Enter/Tab work on the buttons
  if (["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock"].includes(e.key)) return;
  e.preventDefault();
  if (introStep === 0) {
    const key = introKeys[e.code];
    if (!key) return;
    key.classList.add("hit");
    FX.anim(key, [{ transform: "translateY(2px) scale(.92)" }, { transform: "none" }], { duration: 160 });
    introPressed.add(e.code);
    if (introPressed.size === HOME_CODES.length) advanceAfter($("intro-home"));
  } else if (introStep === 1) {
    if (e.code !== "Space") return;
    $("intro-space").classList.add("hit");
    advanceAfter($("intro-space"));
  } else {
    nextIntroStep();
  }
}

// unlockAll: true = "I can already touch type", false = "Start",
// undefined = closed with skip / Esc (nothing changes).
async function closeIntro(unlockAll) {
  if (!introOpen() || el.intro.classList.contains("closing")) return;
  el.intro.classList.add("closing");             // fade out, then hide
  FX.fadeOut(el.intro).then(() => el.intro.classList.add("hidden"), () => {}).finally(() => el.intro.classList.remove("closing"));
  store.set("tt.introDone", "1");
  if (unlockAll) {
    await openAllLetters();
  } else if (unlockAll === false && store.get(`tt.level.${S.lang}`) === "pro") {
    // reopened the intro and chose to start small after all
    store.set(`tt.level.${S.lang}`, "new");
    try {
      await postJSON("/progress", { unlockAll: false });
      await refreshStats();
      await loadExercise();
    } catch (err) { console.error(err); }
  }
  focusText();
}
$("intro-next").addEventListener("click", (e) => { e.currentTarget.blur(); nextIntroStep(); });
$("intro-skip").addEventListener("click", () => closeIntro());
$("intro-new").addEventListener("click", () => closeIntro(false));
$("intro-pro").addEventListener("click", () => closeIntro(true));
el.btnIntro.addEventListener("click", (e) => { e.currentTarget.blur(); showIntro(); });

// "Already touch typing? open all letters": every letter of this language
// opens at once. Remembered per language (the Pages version forgets progress
// on reload, so loadLanguage applies it again).
async function openAllLetters() {
  store.set(`tt.level.${S.lang}`, "pro");
  try {
    await postJSON("/progress", { unlockAll: true });
    await refreshStats();
    await loadExercise();
    FX.burstFrom(el.letters, 60);
  } catch (err) { console.error(err); }
}
el.lettersCaption.addEventListener("click", (e) => {
  if (e.target.id !== "open-all" || S.busy) return;
  e.target.blur();
  openAllLetters().then(focusText);
});

// ---------- languages ----------
// The switch is built once; changing language only moves the yellow thumb
// (CSS variable --i), so the slide animation can run.
function buildLangSwitch() {
  el.langSwitch.style.setProperty("--n", S.languages.length);
  el.langSwitch.innerHTML = `<span class="switch-thumb" aria-hidden="true"></span>` +
    S.languages.map((l) => `<button type="button" role="tab" data-lang="${l.id}" title="${l.name}">${l.label}</button>`).join("");
  el.langSwitch.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    b.blur();
    switchLanguage(b.dataset.lang);
  }));
}
function switchLanguage(id) {
  if (S.busy || id === S.lang) return;
  loadLanguage(id).catch((err) => console.error(err));
}
function markLangSwitch() {
  el.langSwitch.style.setProperty("--i", Math.max(0, S.languages.findIndex((l) => l.id === S.lang)));
  el.langSwitch.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.lang === S.lang)));
}

// First choice: what was used last time, else the browser's language, else the first one.
function initialLanguage() {
  const ids = S.languages.map((l) => l.id);
  const saved = store.get("tt.lang");
  if (ids.includes(saved)) return saved;
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  return ids.includes(browser) ? browser : ids[0];
}

async function loadLanguage(id) {
  S.busy = true;
  try {
    S.lang = id;
    store.set("tt.lang", id);
    const info = S.languages.find((l) => l.id === id);
    S.alphabet = new Set(info.alphabet);
    document.documentElement.lang = id;
    setUiLang(id);                        // the interface follows the typing language
    markLangSwitch();
    hideWarn();
    el.live.classList.remove("final");
    S.layout = await getJSON("/layout");
    drawKeyboard();
    drawIntroKeys();                        // the intro shows the home row of this layout
    // switching language: the new keyboard and letters fade in (not at start)
    if (S.languages.length && S.exercise) {
      FX.anim(el.keyboard, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
      FX.anim(el.letters, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    }
    // home-row keys for the intro text ("bumps on F and J" / "on А and О")
    const home = S.layout.rows.flat().filter((k) => k.home).map((k) => k.char.toUpperCase());
    [i18nVars.f, i18nVars.j] = home;
    el.motto.textContent = t(`splash.${S.mottoIndex}`);   // in the interface language
    const row = S.layout.rows[1].map((k) => k.char.toUpperCase());
    i18nVars.l = row.slice(0, 4).join(" ");
    i18nVars.r = row.slice(6, 10).join(" ");
    applyI18n();
    labelTips();
    applyKb();                              // re-translates "off"
    await refreshStats();
    await loadExercise();
    if (S.view === "stats") renderStats();

    if (store.get(`tt.level.${id}`) === "pro" && S.exercise.locked.length && !S.lastStats.sessionCount) {
      // the GitHub Pages version forgets progress on reload: re-apply the choice
      await postJSON("/progress", { unlockAll: true });
      await refreshStats();
      await loadExercise();
    }
  } finally {
    S.busy = false;
  }
}

// ---------- input ----------
// Desktop: keydown gives us the real key. preventDefault stops the character
// from ALSO arriving through the hidden input (and space from scrolling).
document.addEventListener("keydown", (e) => {
  if (introOpen()) { introKey(e); return; }
  if (document.body.classList.contains("splashing")) return;
  // shortcuts: Shift+Tab = type <-> stats, Alt+1...4 = language
  if (e.key === "Tab" && e.shiftKey) {
    e.preventDefault();
    setView(S.view === "type" ? "stats" : "type");
    return;
  }
  const altGr = e.getModifierState?.("AltGraph");
  if (e.altKey && !e.ctrlKey && !e.metaKey && !altGr && /^Digit[1-9]$/.test(e.code)) {
    const l = S.languages[Number(e.code.slice(5)) - 1];
    if (l) { e.preventDefault(); switchLanguage(l.id); }
    return;
  }
  if (S.view !== "type") return;
  if (e.key === "Escape") { e.preventDefault(); newExercise(); return; }
  if (e.key === "Tab") { e.preventDefault(); nudge(); return; }   // no restart, see nudge()
  if (e.key === "Backspace") { e.preventDefault(); focusText(); backspace(e.ctrlKey || e.altKey); return; } // Alt = Option on a Mac
  // AltGr (Polish ą, ę, ...) is reported as Ctrl+Alt on Windows; let it through,
  // but keep real browser shortcuts like Ctrl+R working.
  if ((e.ctrlKey || e.metaKey || e.altKey) && !altGr) return;
  if (e.key.length !== 1) return;                     // Shift, Tab, "Unidentified"...
  e.preventDefault();
  focusText();
  handleChar(e.key);
});

// Phones: virtual keyboards often report "Unidentified" on keydown, so the
// character only shows up here, in the hidden input. We read it and clear it.
// Backspace on a phone keyboard: the input is empty, so it arrives only here.
el.input.addEventListener("beforeinput", (e) => {
  if (e.inputType === "deleteContentBackward") { e.preventDefault(); backspace(false); }
  if (e.inputType === "deleteWordBackward") { e.preventDefault(); backspace(true); }
});
el.input.addEventListener("input", () => {
  for (const ch of el.input.value) handleChar(ch);
  el.input.value = "";
});

el.textBox.addEventListener("click", () => { el.input.focus({ preventScroll: true }); focusText(); });
el.input.addEventListener("blur", () => { if (isTouch()) el.textBox.classList.add("blurred"); });

function newExercise() {
  if (S.busy) return;
  el.live.classList.remove("final");
  loadExercise().catch(console.error);
}
el.btnNew.addEventListener("click", (e) => { e.currentTarget.blur(); newExercise(); });
// ---------- start ----------
(async function init() {
  // interface language for the splash, before the server answers
  const guess = store.get("tt.lang") || (navigator.language || "").slice(0, 2).toLowerCase();
  setUiLang(guess);
  // the small phrase over the logo: the same one the start screen showed
  S.mottoIndex = Math.floor(Math.random() * SPLASH_PHRASES);
  const splash = Splash.start();
  if (splash.phrase !== undefined) S.mottoIndex = splash.phrase;   // the logo keeps the start phrase
  // keyboard size from last time (an old saved 0 meant "hidden")
  const saved = Number(store.get("tt.kbSize") ?? 100) || 0;
  // never chosen yet: hidden on phones (no physical keys to look up), shown elsewhere
  const hiddenSaved = store.get("tt.kbHidden");
  S.kbHidden = hiddenSaved === null ? isTouch() : hiddenSaved === "1" || saved === 0;
  S.kbSize = saved ? nearestKb(saved) : 100;
  applyKb();
  labelTips();
  if (isTouch()) el.textBox.classList.add("blurred"); // phone: tap to open the keyboard
  try {
    S.languages = await getJSON("/languages", true);
    buildLangSwitch();
    await loadLanguage(initialLanguage());
  } catch (err) {
    console.error(err);
    el.text.textContent = t("err.load");
  }
  await splash.done();
  const flash = store.get("tt.flash");                     // set by a finished import
  if (flash) {
    store.set("tt.flash", "");
    FX.toast(t("toast.imported", { n: flash }));
  }
  if (!store.get("tt.introDone") && S.layout) showIntro();   // only the very first visit
})();
