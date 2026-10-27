// The typing screen: text, caret and keypresses.

import { FEEL } from "./feel.js";
import { t } from "./i18n.js";
import { FX } from "./fx.js";
import { el, S, introOpen, isTouch, roundList, boxState } from "./state.js";
import { postJSON, saveRound, retryable } from "./api.js";
import { highlightNextKey, pulseKey, glowKey, requestFit, autoKb } from "./keyboard.js";
import { refreshStats } from "./stats.js";
import { showResult } from "./result.js";
import { renderLetters, markNewLetter, markMastered } from "./letters.js";
import { renderPanel, roundNews, compareStats, refreshActivity, tickGoal } from "./learnpanel.js";
import { learning, refreshFreeplay } from "./modes.js";
import { renderModeBar } from "./modebar.js";
import { lengthOf, firstRoundDone } from "./settings.js";
import { keySound } from "./sound.js";
import { customPortions, customRoundDone } from "./customtext.js";
import { flinchCaret, paceGlide, resetGlide, scrollText, stopScroll } from "./caret.js";
import { STREAK_RISE, streakOn, cleanWord, breakStreak } from "./streak.js";
import { showWarn, hideWarn, warnShowing, foreignKey, layoutCheck } from "./warn.js";

let spans = [];
let focusMask = new Uint8Array(0);
let state = new Uint8Array(0);
let records = [];
let extras = new Map();
let correctChars = 0;
let startTime = null;
let lastTime = null;
let afterBackspace = false;
let afterPause = false;
let pausedAt = null;
let presses = 0, correctPresses = 0;
let perSecond = [];

let wordClean = true;
let backWord = -1, backErrors = 0;
let fixedWords = new Set();

const TEXT_LINES = 3;
let lineH = 0;
let caretTop = 0;
export function fitText() {
  if (S.view !== "type") return;
  lineH = parseFloat(getComputedStyle(el.text).lineHeight) || 0;
  caretTop = el.caret.offsetTop || caretTop;
  stopScroll();
  el.text.scrollTop = 0;
}

// ---------- caret ----------
let caretFrame = 0;
export function placeCaret(jump, last = false) {
  cancelAnimationFrame(caretFrame);
  caretFrame = requestAnimationFrame(() => {
    if (!spans.length) return;
    const extra = last ? null : extras.get(S.pos)?.at(-1);
    const atEnd = last || S.pos >= spans.length || !!extra;
    const s = last ? spans[Math.max(0, S.pos - 1)] : extra || spans[Math.min(S.pos, spans.length - 1)];
    const x = s.offsetLeft + (atEnd ? s.offsetWidth : 0);
    if (jump) el.caret.classList.add("jump");
    el.caret.style.translate = `${x - 1}px ${s.offsetTop}px`;
    let top = el.text.scrollTop;
    if (lineH && !last) {
      const line = Math.round(s.offsetTop / lineH);
      top = Math.max(0, Math.min(line - 1, Math.ceil(el.text.scrollHeight / lineH) - TEXT_LINES)) * lineH;
      if (Math.abs(el.text.scrollTop - top) > 1) scrollText(top, jump);
    }
    if (jump) requestAnimationFrame(() => el.caret.classList.remove("jump"));
    if (!streakOn()) return;
    if (jump) el.streak.classList.add("jump");
    el.streak.style.translate = `${el.text.offsetLeft + x + 4}px ${el.text.offsetTop + s.offsetTop - top + caretTop - STREAK_RISE}px`;
    if (jump) requestAnimationFrame(() => el.streak.classList.remove("jump"));
  });
}
function keepTextInView() {
  if (S.view !== "type" || document.documentElement.scrollHeight <= innerHeight) return;
  const r = el.textBox.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= innerHeight) return;
  scrollTo({ top: scrollY + r.top - 8 });
}

// ---------- the stream ----------
const IDLE_PAUSE_MS = 10000;
const RECENT_SENT = 40;
let portions = [];
let sentUpTo = 0;
let current = 0;
let streamId = 0;
let queue = Promise.resolve();
let limit = { kind: "words", n: 30 };
let roundWords = 0;
let wordsLoaded = 0;
let endAt = -1;
let wordsTyped = 0;
let roundBefore = null;
let roundNewLetter = "";
let roundNewLap = 0;
const SHOWN_AHEAD = 12;
let wordOf = new Int32Array(0);
let revealAt = 0;
let shownWords = 0;

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
    if (S.text[i] === " ") n++;
  }
  for (let i = old; i < S.text.length; i++) records.push(null);
  let at = old;
  for (const p of list) {
    if (!p.words.length) continue;
    const end = at + p.words.join(" ").length;
    portions.push({ start: at, end, focus: p.focus });
    for (let i = at; i < end; i++) if (S.text[i] === p.focus) focusMask[i] = 1;
    if (limit.kind === "words" && endAt < 0 && wordsLoaded + p.words.length >= limit.n) {
      endAt = at + p.words.slice(0, limit.n - wordsLoaded).join(" ").length;
    }
    wordsLoaded += p.words.length;
    at = end + 1;
  }
  const frag = document.createDocumentFragment();
  for (let i = old; i < S.text.length; i++) {
    const sp = document.createElement("span");
    sp.textContent = S.text[i];
    sp.className = (focusMask[i] ? "fx" : "") + " later" + (endAt >= 0 && i >= endAt ? " beyond" : "");
    if (focusMask[i]) sp.dataset.tipText = t("tip.fx", { l: S.text[i] });
    else if (S.text[i] === " ") sp.dataset.sp = "";
    frag.appendChild(sp);
    spans.push(sp);
  }
  el.text.insertBefore(frag, el.caret);
  reveal();
  const last = list.at(-1);
  if (last.unlocked) S.exercise = { ...(S.exercise ?? {}), unlocked: last.unlocked, locked: last.locked };
}

function reveal() {
  shownWords = Math.max(shownWords, wordsTyped + SHOWN_AHEAD);
  for (; revealAt < spans.length && wordOf[revealAt] < shownWords; revealAt++) spans[revealAt].classList.remove("later");
}

function showPortion(i) {
  current = i;
  if (portions[i] && S.exercise) S.exercise.focus = portions[i].focus;
  renderTop();
}
function renderTop() {
  S.roundSeconds = startTime === null ? 0 : (performance.now() - startTime) / 1000;
  renderLetters();
  renderPanel();
  autoKb(true);
}

function recentWords() {
  return S.text.trim().split(" ").slice(-RECENT_SENT);
}

function mistypedWords(por) {
  const out = [];
  for (let i = por.start; i <= por.end; ) {
    const end = wordEnd(i);
    let bad = false;
    for (let j = i; j <= end; j++) if (records[j] ? records[j].errors > 0 : j < end) bad = true;
    if (bad && !fixedWords.has(i)) out.push(S.text.slice(i, end));
    i = end + 1;
  }
  return out;
}

const needMore = () => limit.kind === "time" || wordsLoaded < limit.n;

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

const portionRoute = () => ({ learn: "/portion", climb: "/freeplay/portion", freetype: "/freetype/portion" })[S.mode];
const ownText = () => S.mode === "freetype" && S.freetypeVariant === "custom";
const getPortions = (body) => ownText() ? Promise.resolve(customPortions(body.start)) : postJSON(portionRoute(), body);

export const roundStarted = () => startTime !== null;

const timeUp = (now) => limit.kind === "time" && startTime !== null && now - startTime >= limit.n * 1000;

function newLetter(l) {
  roundNewLetter = l;
  const ex = S.exercise;
  if (ex?.locked?.includes(l)) S.exercise = { ...ex, unlocked: [...ex.unlocked, l], locked: ex.locked.filter((c) => c !== l) };
  markNewLetter(l);
  glowKey(l);
}

function resetStream() {
  streamId++;
  queue = Promise.resolve();
  S.text = ""; S.pos = 0; wordClean = true; wordsTyped = 0;
  state = new Uint8Array(0); focusMask = new Uint8Array(0); records = []; spans = [];
  portions = []; sentUpTo = 0; current = 0; roundNewLetter = ""; roundNewLap = 0; wordsLoaded = 0; endAt = -1;
  wordOf = new Int32Array(0); revealAt = 0; shownWords = 0;
  extras = new Map(); correctChars = 0; afterBackspace = false; afterPause = false;
  pausedAt = null; boxState(false, "snap", "paused");
  backWord = -1; backErrors = 0; fixedWords = new Set();
  startTime = null; lastTime = null; presses = 0; correctPresses = 0; perSecond = [];
  resetGlide();
  el.text.replaceChildren(el.caret);
}

export async function loadExercise() {
  resetStream();
  const id = streamId;
  const body = { start: true, recent: [], list: roundList(), variant: S.freetypeVariant, level: S.climbLevel ?? 0 };
  const res = await getPortions(body);
  if (id !== streamId) return;
  roundBefore = S.lastStats;
  if (S.mode === "climb" && res.level !== S.climbLevel) { S.climbLevel = res.level; renderModeBar(); renderLetters(); }
  limit = lengthOf(S.settings.length);
  roundWords = limit.kind === "words" ? limit.n : 0;
  appendPortions(res.portions);
  renderProgress();
  fitText();
  requestFit();
  el.text.classList.remove("swap");
  void el.text.offsetWidth;
  el.text.classList.add("swap");
  el.textBox.classList.remove("typing");
  setTyping(false);
  if (!el.live.classList.contains("final")) { setLive(el.wpm, 0, true); setLive(el.raw, 0, true); setLive(el.acc, 100, true); }
  lightNext();
  showPortion(0);
  placeCaret(true);
  requestAnimationFrame(keepTextInView);
}

// ---------- typing ----------
const MAX_EXTRA = 10;
const canType = () => !(S.busy || S.pos >= S.text.length || introOpen() || S.view !== "type" || document.body.classList.contains("splashing"));

function wordStart(i) { while (i > 0 && S.text[i - 1] !== " ") i--; return i; }
function wordEnd(i) { while (i < S.text.length && S.text[i] !== " ") i++; return i; }

function setState(i, s) {
  if (state[i] === 1) correctChars--;
  if (s === 1) correctChars++;
  state[i] = s;
  spans[i].className = s === 0 && focusMask[i] ? "fx" : ["", "ok", "bad", "miss"][s];
}
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

function record(i, wrong, now, typed) {
  let r = records[i];
  if (!r) {
    const ms = lastTime === null || afterBackspace || afterPause ? 0 : Math.round(now - lastTime);
    r = records[i] = { char: S.text[i], errors: 0, ms };
  }
  if (wrong) {
    r.errors++;
    if (r.typed === undefined) r.typed = typed;
  }
}
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
  if (ch === " " && expected !== " " && S.pos === wordStart(S.pos)) return;
  const now = performance.now();
  if (timeUp(now)) { finishRound(); return; }
  paceGlide(now);

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
  setTyping(true);
  if (ch === expected && warnShowing()) hideWarn();
  presses++;
  const sec = Math.floor((now - startTime) / 1000);
  perSecond[sec] = (perSecond[sec] ?? 0) + 1;
  let roundOver = false;

  if (S.settings.stop && ch !== expected) {
    record(S.pos, true, now, ch);
    setState(S.pos, 2);
    pulseKey(ch, false);
    mistake();
    lastTime = now; afterBackspace = false; afterPause = false;
    return;
  }

  if (expected === " " && ch !== " ") {
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
      if (space && S.pos - 1 === endAt) roundOver = true;
      else if (space && S.pos - 1 === portions[current]?.end) portionDone(current);
      else if (!space && S.pos === endAt) { endWord(); roundOver = true; }
    }
  }
  lastTime = now; afterBackspace = false; afterPause = false;
  if (roundOver) { placeCaret(false, true); finishRound(true); return; }
  lightNext();
  placeCaret(false);
}

export function backspace(wholeWord) {
  if (!canType() || startTime === null) return;
  if (pausedAt !== null) resumeRound(performance.now());
  if (S.pos === wordStart(S.pos)) {
    const space = S.pos - 1;
    if (space < 0 || backWord >= 0) return;
    setState(space, 0);
    S.pos = space;
    while (S.pos > 0 && state[S.pos - 1] === 3) setState(--S.pos, 0);
    backWord = wordStart(space);
    backErrors = wordErrors(backWord, space);
    wordsTyped--;
    renderProgress();
    wordClean = false;
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
function wordErrors(start, end) {
  let n = 0;
  for (let j = start; j <= end; j++) n += records[j]?.errors ?? 0;
  return n;
}
function leaveBackWord() {
  if (backWord < 0 || wordStart(S.pos) !== backWord) return;
  if (wordErrors(backWord, S.pos) === backErrors && !wordHasError(backWord, S.pos)) fixedWords.add(backWord);
  backWord = -1;
}
function clearWord() {
  (extras.get(S.pos) ?? []).splice(0).forEach((s) => s.remove());
  const start = wordStart(S.pos);
  while (S.pos > start) setState(--S.pos, 0);
}

// ---------- the end of a word ----------
function endWord() {
  wordsTyped++;
  reveal();
  renderProgress();
  updateLive();
  if (wordClean) cleanWord();
  wordClean = true;
}
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
export function restartRound() {
  if (S.busy) return;
  el.live.classList.remove("final");
  loadExercise().catch(console.error);
}

export function checkLayout() {
  if (startTime === null) layoutCheck();
}
setInterval(checkLayout, 1000);

function currentWpm(end = performance.now()) {
  if (startTime === null) return 0;
  const minutes = (end - startTime) / 60000;
  return minutes > 0 ? (correctChars / 5) / minutes : 0;
}
function currentRaw(end = performance.now()) {
  if (startTime === null) return 0;
  const minutes = (end - startTime) / 60000;
  return minutes > 0 ? (presses / 5) / minutes : 0;
}
function fullSeconds(end) {
  const n = startTime === null ? 0 : Math.floor((end - startTime) / 1000);
  return Array.from({ length: n }, (_, i) => perSecond[i] ?? 0);
}
function currentAccuracy() {
  return presses ? (correctPresses / presses) * 100 : 100;
}
function updateLive() {
  setLive(el.wpm, Math.round(currentWpm()));
  setLive(el.raw, Math.round(currentRaw()));
  setLive(el.acc, Math.round(currentAccuracy()));
}
function setLive(node, n, instant = false) {
  if (instant) {
    node.classList.add("snap");
    requestAnimationFrame(() => node.classList.remove("snap"));
  }
  node.style.setProperty("--v", n);
  node.dataset.v = n;
  node.setAttribute("aria-label", n);
}

// ---------- "typing now": the header steps back ----------
let typingNow = false;
export function setTyping(on) {
  if (on === typingNow) return;
  typingNow = on;
  document.body.classList.toggle("typing-now", on);
}

setInterval(() => {
  if (startTime === null || S.busy || pausedAt !== null) return;
  const now = performance.now();
  if (limit.kind === "time") renderProgress();
  S.roundSeconds = (now - startTime) / 1000;
  if (tickGoal()) { pauseRound(now, "goal"); return; }
  if (timeUp(now)) finishRound();
  else if (now - lastTime > IDLE_PAUSE_MS) pauseRound(lastTime);
}, 500);

export function pauseRound(since, why) {
  if (pausedAt !== null || S.busy || !S.text) return;
  if (S.view !== "type" || el.textBox.classList.contains("resulting")) return;
  pausedAt = typeof since === "number" ? since : performance.now();
  boxState(true, "snap", "paused");
  el.textBox.classList.toggle("goal", why === "goal");
}
function resumeRound(now) {
  const away = now - pausedAt;
  if (startTime !== null) {
    startTime += away;
    if (lastTime !== null) lastTime += away;
    afterPause = true;
  }
  pausedAt = null;
  boxState(false, "snap", "paused");
  el.textBox.classList.remove("goal");
}

async function finishRound(byLastKey = false) {
  S.busy = true;
  const end = lastTime;
  if (byLastKey && FEEL.resultHoldMs > 0) {
    if (!learning()) boxState(true, "ending");
    await new Promise((r) => setTimeout(r, FEEL.resultHoldMs));
  }
  const wpm = Math.round(currentWpm(end) * 10) / 10;
  const accuracy = Math.round(currentAccuracy() * 10) / 10;
  el.live.classList.add("final");
  setTyping(false);
  setLive(el.wpm, Math.round(wpm));
  setLive(el.raw, Math.round(currentRaw(end)));
  setLive(el.acc, Math.round(accuracy));
  if (limit.kind === "time") renderProgress();
  const typed = records.filter(Boolean);
  const samples = records.slice(sentUpTo).filter(Boolean);
  try {
    await queue;
    streamId++;
    if (!typed.length) { await loadExercise(); return; }
    restCheck((end - startTime) / 1000);
    if (S.mode === "climb") { await finishFree(wpm, accuracy, typed, fullSeconds(end)); return; }
    if (S.mode === "freetype") { await finishFreetype(wpm, accuracy, typed, fullSeconds(end)); return; }
    const body = { samples, keys: typed, chars: typed.length, wpm, accuracy, perSecond: fullSeconds(end), length: S.settings.length, device: device(), round: roundId() };
    learnRound++;
    let res;
    try {
      res = await saveRound("/results", body);
    } catch (err) {
      learnUnsaved(err, body);
      el.live.classList.remove("final");
      await loadExercise();
      return;
    }
    firstRoundDone();
    await refreshStats();
    if (res.newLetter) newLetter(res.newLetter);
    if (res.newLap) roundNewLap = res.newLap;

    const r = compareStats(roundBefore, S.lastStats);
    markMastered(r.mastered);
    const milestone = roundNews({ ...r, wpm, newLetter: roundNewLetter, newLap: roundNewLap });
    if (r.best || milestone) FX.burstFrom(el.wpm, 80);
    refreshActivity();
    el.live.classList.remove("final");
    await loadExercise();
  } catch (err) {
    console.error(err);
    FX.toast(t("err.load"));
    loadExercise().catch(console.error);
  } finally {
    boxState(false, "ending");
    S.busy = false;
  }
}

let learnRound = 0;
function learnUnsaved(err, body) {
  console.error(err);
  if (!retryable(err)) { FX.toast(t("save.impossible")); return; }
  const round = learnRound;
  FX.toast(`${t("save.learnFailed")} <button type="button" class="note-act">${t("save.again")}</button>`, () => {
    if (round !== learnRound) { FX.toast(t("save.late")); return; }
    saveRound("/results", body).then((res) => {
      firstRoundDone();
      refreshStats().catch(console.error);
      refreshActivity();
      if (res.newLetter) newLetter(res.newLetter);
      FX.toast(t("save.done"));
    }, (again) => learnUnsaved(again, body));
  });
}

const REST_BREAK_MS = 5 * 60 * 1000;
let restTyped = 0, restAt = 0;
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

const device = () => (isTouch() ? "touch" : "keyboard");
const roundId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

async function finishFree(wpm, accuracy, keys, perSecond) {
  const before = S.climb?.sessions ?? [];
  const level = S.climbLevel;
  const body = { wpm, accuracy, chars: keys.length, perSecond, keys, length: S.settings.length, device: device(), level, round: roundId() };
  const saved = async (res) => {
    firstRoundDone();
    S.climbLevel = res.place.level;
    refreshActivity();
    await refreshFreeplay();
    renderLetters();
    return { verdict: res.verdict, place: res.place, weak: res.weak };
  };
  const shown = { wpm, accuracy, words: typedWords(), ...roundFacts() };
  const { res, unsaved } = await trySave("/freeplay/results", body, saved);
  if (res) {
    const best = before.length > 0 && wpm > Math.max(...before.map((x) => x.wpm));
    if (best) FX.burstFrom(el.wpm, 80);
    await showResult({ ...shown, consistency: res.consistency, best, climb: { level, ...(await saved(res)) } });
  } else {
    await showResult({ ...shown, consistency: null, climb: { level }, unsaved });
  }
  await loadExercise();
}

async function trySave(path, body, saved) {
  const why = (err) => { console.error(err); return t(retryable(err) ? "save.failed" : "save.impossible"); };
  try {
    return { res: await saveRound(path, body) };
  } catch (err) {
    const retry = async () => {
      try {
        return await saved(await saveRound(path, body));
      } catch (again) {
        throw Object.assign(new Error(why(again)), { retryable: retryable(again) });
      }
    };
    return { unsaved: { text: why(err), retry: retryable(err) ? retry : null } };
  }
}

async function finishFreetype(wpm, accuracy, keys, perSecond) {
  const variant = S.freetypeVariant, list = roundList();
  const before = S.freetype?.sessions ?? [];
  const body = { wpm, accuracy, chars: keys.length, perSecond, keys, length: S.settings.length, device: device(), list, variant, round: roundId() };
  const done = wordsTyped;
  const saved = async () => {
    if (variant === "custom") customRoundDone(done);
    firstRoundDone();
    refreshActivity();
    await refreshFreeplay();
    return {};
  };
  const shown = { wpm, accuracy, list, variant, words: typedWords(), ...roundFacts() };
  const { res, unsaved } = await trySave("/freetype/results", body, saved);
  if (res) {
    await saved();
    const best = before.length > 0 && wpm > Math.max(...before.map((x) => x.wpm));
    if (best) FX.burstFrom(el.wpm, 80);
    await showResult({ ...shown, consistency: res.consistency, best });
  } else {
    await showResult({ ...shown, consistency: null, unsaved });
  }
  await loadExercise();
}
