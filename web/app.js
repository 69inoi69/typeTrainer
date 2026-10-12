// Typing trainer frontend. Plain JavaScript, no frameworks.
//
// Flow:  load layout -> load exercise -> user types (keydown) -> every
// character becomes a "sample" {char, errors, ms} -> exercise done ->
// POST samples to /api/v1/results (server updates the model, maybe unlocks
// a letter) -> GET a new exercise built from the updated model.
"use strict";

const API = "/api/v1";

// ---------- page elements ----------
const $ = (id) => document.getElementById(id);
const el = {
  textBox: $("text-box"), text: $("text"), caret: $("caret"), input: $("hidden-input"),
  keyboard: $("keyboard"), hint: $("finger-hint"),
  live: $("live"), wpm: $("wpm"), acc: $("acc"),
  letters: $("letters"), lettersCaption: $("letters-caption"),
  tooltip: $("tooltip"),
  btnNew: $("btn-new"), btnIntro: $("btn-intro"), heat: $("heat-toggle"),
  kbSmaller: $("kb-smaller"), kbLarger: $("kb-larger"), kbToggle: $("kb-toggle"),
  kbSizeOut: $("kb-size-out"), hands: $("hands"),
  intro: $("intro"),
  switch: document.querySelector(".switch"), tabType: $("tab-type"), tabStats: $("tab-stats"),
  viewType: $("view-type"), viewStats: $("view-stats"),
  tiles: $("tiles"), chart: $("chart"), chartNote: $("chart-note"), letterGrid: $("letter-grid"),
  langSwitch: $("lang-switch"), warn: $("layout-warn"),
  streak: $("streak"), streakN: $("streak-n"),
};

// ---------- state ----------
let languages = [];       // from /api/v1/languages
let lang = "en";           // id of the current language
let alphabet = new Set();  // letters of the current language
let layout = null;         // keyboard layout of the current language
let keyEls = {};           // char -> key <div> (the letter printed on the key)
let fingerOf = {};         // char -> finger id
let altBase = {};          // AltGr letter -> base key char ("ą" -> "a")
let altgrEl = null;        // the AltGr key, if the layout has one
let wrongScript = 0;       // presses in a row that came from another keyboard layout

let exercise = null;       // last /exercise answer: text, focus, unlocked, locked
let lastStats = null;      // last /stats answer
let text = "";
let spans = [];            // one <span> per character
let pos = 0;               // index of the character to type next
let wrongHere = 0;         // wrong presses at the current position
let samples = [];          // one {char, errors, ms} per character typed
let startTime = null;      // performance.now() of the first keypress
let lastTime = null;       // performance.now() of the previous correct keypress
let presses = 0, correctPresses = 0;
let busy = false;          // true while talking to the server between exercises
let popLetter = null;      // letter that was just unlocked (for the animation)
let view = "type";         // "type" or "stats"

// Rewards (they change nothing in the statistics, they only feel nice)
let streak = 0;            // words in a row typed without a single mistake
let wordClean = true;      // no mistake in the current word so far
let tabsResisted = 0;      // Tab presses during this exercise (no restart here)
let tabMsg = 0;            // which of the Tab messages comes next
let justMastered = new Set(); // letters mastered in the last exercise (chips shine)

// ---------- small helpers ----------
const store = { // localStorage can be blocked; the app must work without it
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const introOpen = () => !el.intro.classList.contains("hidden") && !el.intro.classList.contains("closing");

// ---------- server calls ----------
// Every call except /languages is about one language: add ?lang= to it.
function withLang(path) {
  return path + (path.includes("?") ? "&" : "?") + "lang=" + encodeURIComponent(lang);
}
async function getJSON(path, global = false) {
  const res = await fetch(API + (global ? path : withLang(path)));
  if (!res.ok) throw new Error(path + " -> " + res.status);
  return res.json();
}
async function postJSON(path, body) {
  const res = await fetch(API + withLang(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(path + " -> " + res.status);
  return res.json();
}

// ---------- keyboard ----------
function makeKey(k) {
  const finger = layout.fingers[k.finger];
  const key = document.createElement("div");
  key.className = "key" + (k.home ? " home" : "");
  key.style.setProperty("--fc", finger.color);
  if (k.width) key.style.width = `calc(var(--u) * ${k.width} + var(--u) * .12 * ${k.width - 1})`;
  key.innerHTML = `<span class="heat"></span><span class="lbl"></span>`;
  key.querySelector(".lbl").textContent = k.char === " " ? t("key.space") : (k.label || k.char);
  if (k.alt) {                         // second letter, typed with AltGr
    const alt = document.createElement("span");
    alt.className = "alt";
    alt.textContent = k.alt;
    key.appendChild(alt);
  }
  if (k.modifier) key.classList.add("mod");
  key.title = t(`fingerName.${k.finger}`);
  return key;
}

function drawKeyboard() {
  el.keyboard.innerHTML = "";
  keyEls = {}; fingerOf = {}; altBase = {}; altgrEl = null; nextKeyEl = null;
  layout.rows.forEach((row, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row";
    rowEl.style.paddingLeft = `calc(var(--u) * ${layout.offsets?.[i] ?? 0})`;
    for (const k of row) {
      const key = makeKey(k);
      rowEl.appendChild(key);
      if (k.modifier) { altgrEl = key; continue; }
      keyEls[k.char] = key;
      fingerOf[k.char] = k.finger;
      if (k.alt) altBase[k.alt] = k.char;
    }
    el.keyboard.appendChild(rowEl);
  });
  // the hands take the finger colors of this layout (both thumbs: "th")
  handFingers = {};
  for (const f of el.hands.querySelectorAll("i[data-f]")) {
    const id = f.dataset.f;
    f.style.setProperty("--fc", layout.fingers[id.startsWith("th") ? "th" : id].color);
    handFingers[id] = f;
  }
  drawIntroKeys();
}

// The key that types ch: its own key, or the base key for an AltGr letter.
const keyFor = (ch) => keyEls[ch] || keyEls[altBase[ch]] || null;

// Which finger presses the next key: that finger lights up on the two
// hands above the keyboard. Space = both thumbs; an AltGr letter = the right
// thumb (holding AltGr) plus the finger of the base key. The same thing is
// also written as a sentence, but only for screen readers.
let nextKeyEl = null;
let handFingers = {};      // finger id ("lp", ..., "thl", "thr") -> <i> on the hands
let litFingers = [];       // fingers that are lit now
function highlightNextKey() {
  if (nextKeyEl) nextKeyEl.classList.remove("next");
  if (altgrEl) altgrEl.classList.remove("next");
  for (const f of litFingers) f.classList.remove("on");
  litFingers = [];
  const ch = text[pos];
  const base = altBase[ch] ?? ch;      // "ą" is typed on the "a" key
  nextKeyEl = keyEls[base] || null;
  if (!nextKeyEl) { el.hint.innerHTML = "&nbsp;"; return; }
  nextKeyEl.classList.add("next");
  const fingerId = fingerOf[base];
  let ids = fingerId === "th" ? ["thl", "thr"] : [fingerId];
  const vars = { key: ch === " " ? t("key.space") : ch, base, finger: t(`finger.${fingerId}`) };
  if (altBase[ch]) {
    if (altgrEl) altgrEl.classList.add("next");
    ids = [...ids, "thr"];
    el.hint.innerHTML = t("hint.alt", vars);
  } else {
    el.hint.innerHTML = t("hint.press", vars);
  }
  for (const id of ids) {
    const f = handFingers[id];
    if (f) { f.classList.add("on"); litFingers.push(f); }
  }
}

// Key feedback with the Web Animations API: runs on the compositor and
// needs no class juggling or layout reads, so it costs almost nothing.
function pulseKey(ch, ok) {
  const k = keyFor(ch);
  if (!k || !k.animate) return;
  if (ok) {
    k.animate([{ transform: "translateY(1px) scale(.93)" }, { transform: "none" }],
      { duration: 130, easing: "cubic-bezier(.2,.8,.2,1)" });
  } else {
    k.animate([{ transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }],
      { duration: 160, easing: "ease-out" });
  }
}

// Keyboard size: 70 % ... 150 % in steps of 10 (smaller is unreadable), and a
// separate on/off button for keyboard + hands. Both remembered in this browser.
const KB_MIN = 70, KB_MAX = 150, KB_STEP = 10;
let kbSize = 100, kbHidden = false;
// animate = true on a click: the keyboard folds away / unfolds smoothly
function applyKb(animate = false) {
  document.documentElement.style.setProperty("--kb-scale", kbSize / 100); // CSS transitions it
  if (animate) {
    FX.collapse(el.keyboard, kbHidden);
    FX.collapse(el.hands, kbHidden);
  } else {
    el.keyboard.classList.toggle("off", kbHidden);
    el.hands.classList.toggle("off", kbHidden);
  }
  el.kbToggle.setAttribute("aria-pressed", String(!kbHidden));
  el.kbSizeOut.textContent = kbHidden ? t("kb.off") : kbSize + "%";
  el.kbSmaller.disabled = kbHidden || kbSize <= KB_MIN;
  el.kbLarger.disabled = kbHidden || kbSize >= KB_MAX;
  store.set("tt.kbSize", kbSize);
  store.set("tt.kbHidden", kbHidden ? "1" : "");
}
function resizeKb(delta) {
  kbSize = Math.min(KB_MAX, Math.max(KB_MIN, kbSize + delta));
  applyKb();
  placeCaret(true);
}
el.kbSmaller.addEventListener("click", (e) => { e.currentTarget.blur(); resizeKb(-KB_STEP); });
el.kbLarger.addEventListener("click", (e) => { e.currentTarget.blur(); resizeKb(KB_STEP); });
el.kbToggle.addEventListener("click", (e) => {
  e.currentTarget.blur();
  kbHidden = !kbHidden;
  applyKb(true);
  FX.bump(el.kbToggle, 1.12);
  placeCaret(true);
});

// ---------- caret ----------
// One caret element that slides to the current letter (CSS transition on
// transform). We read the letter's position once per animation frame.
let caretFrame = 0;
function placeCaret(jump) {
  cancelAnimationFrame(caretFrame);
  caretFrame = requestAnimationFrame(() => {
    if (!spans.length) return;
    const atEnd = pos >= spans.length;
    const s = spans[Math.min(pos, spans.length - 1)];
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
  placeCaret(true);
  if (view === "stats") renderStats();
});

// ---------- letters bar ----------
function renderLetters() {
  if (!exercise) return;
  const info = {};
  for (const k of lastStats?.keys ?? []) info[k.char] = k;
  const focusHasData = (info[exercise.focus]?.count ?? 0) > 0;

  const frag = document.createDocumentFragment();
  const add = (c, cls) => {
    const chip = document.createElement("span");
    chip.className = "chip " + cls;
    chip.textContent = c;
    if (c === popLetter) chip.classList.add("pop");
    if (justMastered.has(c)) chip.classList.add("shine");
    frag.appendChild(chip);
  };
  for (const c of exercise.unlocked) {
    let cls = info[c]?.mastered ? "mastered" : "";
    if (c === exercise.focus && (focusHasData || c === popLetter)) cls += " focus";
    add(c, cls);
  }
  for (const c of exercise.locked) add(c, "locked");
  el.letters.replaceChildren(frag);

  // every key you do not need yet is dimmed on the keyboard
  const open = new Set([...exercise.unlocked, " "]);
  const altOf = Object.fromEntries(Object.entries(altBase).map(([a, b]) => [b, a]));
  for (const [c, key] of Object.entries(keyEls)) key.classList.toggle("locked", !open.has(c) && !open.has(altOf[c]));
  if (altgrEl) altgrEl.classList.toggle("locked", !exercise.unlocked.some((c) => altBase[c]));

  const openCount = exercise.unlocked.length;
  const all = openCount + exercise.locked.length;
  const mastered = exercise.unlocked.filter((c) => info[c]?.mastered).length;
  const started = (lastStats?.sessionCount ?? 0) > 0;
  let caption;
  if (!started) caption = t("caption.start", { open: openCount, all });
  else {
    caption = t("caption.mastered", { m: mastered, n: openCount });
    if (focusHasData) caption = t("caption.focus", { letter: exercise.focus }) + " · " + caption;
  }
  if (exercise.locked.length && started) caption += " · " + t("caption.next", { letter: exercise.locked[0] });
  if (exercise.locked.length && !started) caption += " · " + t("openAll"); // a button inside the caption
  el.lettersCaption.innerHTML = caption;
  popLetter = null;
  justMastered = new Set();
}

// ---------- exercise ----------
function showExercise(ex) {
  exercise = ex;
  text = ex.text;
  pos = 0; wrongHere = 0; samples = []; wordClean = true; tabsResisted = 0;
  startTime = null; lastTime = null; presses = 0; correctPresses = 0;

  // build all spans at once with a fragment: one DOM update, not hundreds
  const frag = document.createDocumentFragment();
  spans = [...text].map((ch) => {
    const s = document.createElement("span");
    s.textContent = ch;
    frag.appendChild(s);
    return s;
  });
  el.text.replaceChildren(frag, el.caret);   // the caret lives inside the text
  el.text.classList.remove("swap");
  void el.text.offsetWidth;                  // restart the fade-in (once per exercise)
  el.text.classList.add("swap");
  el.textBox.classList.remove("typing");
  if (!el.live.classList.contains("final")) { el.wpm.textContent = "0"; el.acc.textContent = "100"; }
  highlightNextKey();
  renderLetters();
  placeCaret(true);
}

async function loadExercise() {
  showExercise(await getJSON("/exercise"));
}

// The core of the app, called once per typed character. Kept small on
// purpose: it only flips classes on 1-2 spans; the caret is moved in the
// next animation frame.
function handleChar(ch) {
  if (busy || pos >= text.length || introOpen() || view !== "type" || document.body.classList.contains("splashing")) return;
  const now = performance.now();
  if (startTime === null) {
    startTime = now;
    el.live.classList.remove("final");
  }
  el.textBox.classList.add("typing");

  const expected = text[pos];

  // Not a typing mistake but a wrong keyboard setting: Caps Lock, or the
  // system layout is set to another language. Not counted, just explained.
  if (ch !== expected && /\p{L}/u.test(ch)) {
    if (ch.toLowerCase() === expected) { showWarn("caps"); return; }
    if (!alphabet.has(ch.toLowerCase())) {
      if (++wrongScript >= 2) showWarn("layout");
      return;
    }
  }
  presses++;

  if (ch === expected) {
    if (wrongScript || el.warn.classList.contains("show")) hideWarn();
    // ms = time since the previous correct press. Not measured (0) for the
    // first character; after a mistake the server ignores the time anyway.
    const ms = lastTime !== null ? now - lastTime : 0;
    samples.push({ char: expected, errors: wrongHere, ms: Math.round(ms) });
    correctPresses++;
    const span = spans[pos];
    span.classList.remove("bad");
    span.classList.add(wrongHere ? "fixed" : "ok");
    pos++; wrongHere = 0; lastTime = now;
    pulseKey(expected, true);
    highlightNextKey();
    placeCaret(false);
    if (expected === " " || pos === text.length) endWord();
    if (pos === text.length) finishExercise();
  } else {
    wrongHere++;
    spans[pos].classList.add("bad");
    pulseKey(ch, false);
    if (wordClean) breakStreak();
    wordClean = false;
  }
  updateLive();
}

// ---------- streak: clean words in a row ----------
function endWord() {
  if (wordClean) {
    streak++;
    renderStreak();
    if (streak >= 3) FX.bump(el.streakN);
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
  el.streakN.textContent = "×" + streak;
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
  const info = languages.find((l) => l.id === lang);
  // two wrappers: the outer one folds its height open/closed (style.css)
  el.warn.innerHTML = `<div class="warn-clip"><div class="warn-box">${kind === "caps" ? t("warn.caps") : t("warn.layout", { layout: info?.systemLayout ?? lang })}</div></div>`;
  el.warn.classList.add("show");
}
function hideWarn() {
  wrongScript = 0;
  el.warn.classList.remove("show");
}

// WPM uses the standard definition: 5 characters = 1 word.
function currentWpm() {
  if (startTime === null) return 0;
  const minutes = (performance.now() - startTime) / 60000;
  return minutes > 0 ? (pos / 5) / minutes : 0;
}
function currentAccuracy() {
  return presses ? (correctPresses / presses) * 100 : 100;
}
function updateLive() {
  el.wpm.textContent = Math.round(currentWpm());
  el.acc.textContent = Math.round(currentAccuracy());
}
// keep WPM ticking while the user pauses
setInterval(() => { if (startTime !== null && pos < text.length) updateLive(); }, 500);

async function finishExercise() {
  busy = true;
  const wpm = Math.round(currentWpm() * 10) / 10;
  const accuracy = Math.round(currentAccuracy() * 10) / 10;
  // the header keeps showing this result until the next exercise starts;
  // the numbers count up from zero, just because it feels good
  el.live.classList.add("final");
  FX.countUp(el.wpm, Math.round(wpm));
  FX.countUp(el.acc, Math.round(accuracy));
  // remember the state before, to see what this exercise achieved
  const prevBest = Math.max(0, ...(lastStats?.sessions ?? []).map((x) => x.wpm));
  const hadSessions = (lastStats?.sessionCount ?? 0) > 0;
  const prevMastered = new Set((lastStats?.keys ?? []).filter((k) => k.mastered).map((k) => k.char));
  const resisted = tabsResisted;
  try {
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
    justMastered = new Set(lastStats.keys.filter((k) => k.mastered && !prevMastered.has(k.char)).map((k) => k.char));
    if (justMastered.size) FX.toast(t("toast.mastered", { letters: [...justMastered].join(" ") }), { kind: "mastered" });
    if (resisted) FX.toast(t("toast.resisted", { n: resisted }), { kind: "resisted" });

    await loadExercise();   // generated from the UPDATED model
  } catch (err) {
    console.error(err);
    el.hint.textContent = t("err.server");
  } finally {
    busy = false;
  }
}

async function refreshStats() {
  lastStats = await getJSON("/stats");
  i18nVars.target = lastStats.targetWpm;
  applyI18n(el.intro);
  const heat = new Map();               // one key can carry two letters (a, ą): show the harder
  for (const k of lastStats.keys) {
    const key = keyFor(k.char);
    if (key) heat.set(key, Math.max(heat.get(key) ?? 0, k.count ? k.difficulty : 0));
  }
  for (const [key, d] of heat) key.style.setProperty("--heat", d.toFixed(3));
  if (view === "stats") renderStats();
}

// ---------- views: type / stats ----------
function setView(name) {
  view = name;
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
    placeCaret(true);
    focusText();
  }
}
el.tabType.addEventListener("click", (e) => { e.currentTarget.blur(); if (view !== "type") squishThumb(el.switch); setView("type"); });
el.tabStats.addEventListener("click", (e) => { e.currentTarget.blur(); if (view !== "stats") squishThumb(el.switch); setView("stats"); });
const squishThumb = (sw) => FX.squish(sw.querySelector(".switch-thumb"));

function renderStats() {
  const s = lastStats;
  if (!s) return;
  const sessions = [...s.sessions].reverse(); // oldest first
  const last10 = sessions.slice(-10);
  const avg = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : null;
  const fmt = (v, suffix = "") => v === null ? "—" : Math.round(v) + suffix;
  const best = sessions.length ? Math.max(...sessions.map((x) => x.wpm)) : null;
  el.tiles.innerHTML = [
    [s.sessionCount, t("tile.exercises")],
    [fmt(best), t("tile.best")],
    [fmt(avg(last10, (x) => x.wpm)), t("tile.avgWpm")],
    [fmt(avg(last10, (x) => x.accuracy), "%"), t("tile.avgAcc")],
  ].map(([v, l]) => `<div class="tile"><b>${v}</b><small>${l}</small></div>`).join("");

  drawChart(sessions, s.targetWpm, s.sessionCount);
  drawLetterGrid(s.keys);
}

// Bar chart of WPM per exercise, drawn as SVG by hand (no chart library).
function drawChart(sessions, target, total) {
  if (!sessions.length) {
    el.chart.innerHTML = `<div class="empty">${t("chart.empty")}</div>`;
    el.chartNote.textContent = "";
    return;
  }
  const first = total - sessions.length + 1; // number of the oldest shown exercise
  const scope = sessions.length === total ? t("chart.all") : t("chart.last", { n: sessions.length });
  el.chartNote.textContent = t("chart.note", { scope, target });

  // draw at the real pixel width, so text stays 11px on a phone too
  const W = Math.max(280, el.chart.clientWidth || 860), H = 200, padL = 34, padR = 8, padT = 10, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = niceMax(Math.max(target, ...sessions.map((x) => x.wpm)));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const slot = plotW / Math.max(sessions.length, 10);    // few bars stay thin, not giant
  const bw = Math.max(3, Math.min(28, slot - 2));         // 2px gap between bars

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="WPM per exercise">`;
  for (let i = 0; i <= 4; i++) {                          // grid + y labels
    const v = (max / 4) * i, yy = y(v);
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>`;
    svg += `<text class="axis" x="${padL - 6}" y="${yy + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  sessions.forEach((x, i) => {
    const bx = padL + i * slot + (slot - bw) / 2, top = y(x.wpm), base = y(0);
    const r = Math.min(4, bw / 2, base - top);           // rounded top, flat on the baseline
    const d = `M${bx},${base} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + bw - r} Q${bx + bw},${top} ${bx + bw},${top + r} V${base} Z`;
    svg += `<path class="bar${i === sessions.length - 1 ? " last" : ""}" data-i="${i}" d="${d}"/>`;
  });
  svg += `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>`;
  // x labels: first and last exercise number
  svg += `<text class="axis" x="${padL + slot / 2}" y="${H - 6}" text-anchor="middle">#${first}</text>`;
  if (sessions.length > 1)
    svg += `<text class="axis" x="${padL + (sessions.length - 0.5) * slot}" y="${H - 6}" text-anchor="middle">#${total}</text>`;
  // invisible full-height hover targets, wider than the bars
  sessions.forEach((_, i) => {
    svg += `<rect class="hit" data-i="${i}" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}"/>`;
  });
  svg += `</svg>`;
  el.chart.innerHTML = svg;

  const bars = el.chart.querySelectorAll(".bar");
  el.chart.querySelectorAll(".hit").forEach((h) => {
    const i = Number(h.dataset.i), x = sessions[i];
    h.addEventListener("pointerenter", () => bars[i].classList.add("hover"));
    h.addEventListener("pointerleave", () => { bars[i].classList.remove("hover"); el.tooltip.classList.remove("show"); });
    h.addEventListener("pointermove", (e) => {
      el.tooltip.innerHTML = `<span>#${first + i}</span> ${Math.round(x.wpm)} wpm <span>·</span> ${Math.round(x.accuracy)}%`;
      el.tooltip.style.left = e.clientX + "px";
      el.tooltip.style.top = e.clientY + "px";
      el.tooltip.classList.remove("below");
      el.tooltip.classList.add("show");
    });
  });
}
function niceMax(v) {                 // round the axis up to 20, 40, 60, 80, 100, 150, 200...
  const steps = [20, 40, 60, 80, 100, 120, 150, 200, 250, 300, 400];
  return steps.find((s) => s >= v * 1.05) ?? Math.ceil(v / 100) * 100;
}

function drawLetterGrid(keys) {
  // open letters first (weakest first, as the server sorts them), locked ones last
  keys = [...keys.filter((k) => k.unlocked), ...keys.filter((k) => !k.unlocked)];
  el.letterGrid.innerHTML = keys.map((k) => {
    let meta;
    if (!k.unlocked) meta = t("letter.locked");
    else if (!k.count) meta = t("letter.noData");
    else meta = t("letter.err", { e: Math.round(k.errorRate * 100) }) +
      (k.avgMs ? " · " + t("letter.ms", { ms: Math.round(k.avgMs) }) : "");
    const width = k.count ? Math.round(k.difficulty * 100) : 0;
    return `<div class="lcard${k.unlocked ? "" : " locked"}${k.mastered ? " mastered" : ""}" title="${k.mastered ? t("letter.mastered") : ""}">
      <span class="ch">${k.char}</span>
      <div class="meter" title="${t("letter.difficulty")} ${k.difficulty.toFixed(2)}"><i style="width:${width}%"></i></div>
      <div class="meta">${meta}</div>
    </div>`;
  }).join("");
}

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
  const row = layout.rows[1];
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
  $("intro-hands").querySelectorAll("i").forEach((f, i) => {
    f.classList.remove("on");
    f.style.setProperty("--d", i);       // animation delay: finger after finger
  });
}

function showIntro() {
  introStep = 0;
  introPressed = new Set();
  Object.values(introKeys).forEach((k) => k.classList.remove("hit"));
  $("intro-space").classList.remove("hit");
  const info = languages.find((l) => l.id === lang);
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
  } else if (unlockAll === false && store.get(`tt.level.${lang}`) === "pro") {
    // reopened the intro and chose to start small after all
    store.set(`tt.level.${lang}`, "new");
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
  store.set(`tt.level.${lang}`, "pro");
  try {
    await postJSON("/progress", { unlockAll: true });
    await refreshStats();
    await loadExercise();
    FX.burstFrom(el.letters, 60);
  } catch (err) { console.error(err); }
}
el.lettersCaption.addEventListener("click", (e) => {
  if (e.target.id !== "open-all" || busy) return;
  e.target.blur();
  openAllLetters().then(focusText);
});

// ---------- tooltips ----------
// Icon buttons have no text, so their meaning (and the shortcut) is shown in a
// small tooltip: data-tip="key" in index.html, text from i18n.js.
let tipFor = null;
function showTip(node) {
  tipFor = node;
  const r = node.getBoundingClientRect();
  el.tooltip.textContent = t(node.dataset.tip);
  // keep a long tooltip inside the window (measured on hover, never per keypress)
  const half = el.tooltip.offsetWidth / 2 + 8;
  el.tooltip.style.left = Math.min(innerWidth - half, Math.max(half, r.left + r.width / 2)) + "px";
  const below = r.top < 60;                         // header: no room above
  el.tooltip.classList.toggle("below", below);
  el.tooltip.style.top = (below ? r.bottom : r.top) + "px";
  el.tooltip.classList.add("show");
}
function hideTip() {
  tipFor = null;
  el.tooltip.classList.remove("show");
}
document.addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch") return;            // no sticky tooltips on phones
  const node = e.target.closest?.("[data-tip]");
  if (node && node !== tipFor) showTip(node);
  else if (!node && tipFor) hideTip();
});
document.addEventListener("pointerdown", hideTip);
// screen readers: the tooltip text is also the button's name
function labelTips() {
  document.querySelectorAll("button[data-tip]").forEach((b) => b.setAttribute("aria-label", t(b.dataset.tip)));
}

// ---------- languages ----------
// The switch is built once; changing language only moves the yellow thumb
// (CSS variable --i), so the slide animation can run.
function buildLangSwitch() {
  el.langSwitch.style.setProperty("--n", languages.length);
  el.langSwitch.innerHTML = `<span class="switch-thumb" aria-hidden="true"></span>` +
    languages.map((l) => `<button type="button" role="tab" data-lang="${l.id}" title="${l.name}">${l.label}</button>`).join("");
  el.langSwitch.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    b.blur();
    switchLanguage(b.dataset.lang);
  }));
}
function switchLanguage(id) {
  if (busy || id === lang) return;
  squishThumb(el.langSwitch);
  loadLanguage(id).catch((err) => console.error(err));
}
function markLangSwitch() {
  el.langSwitch.style.setProperty("--i", Math.max(0, languages.findIndex((l) => l.id === lang)));
  el.langSwitch.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.lang === lang)));
}

// First choice: what was used last time, else the browser's language, else the first one.
function initialLanguage() {
  const ids = languages.map((l) => l.id);
  const saved = store.get("tt.lang");
  if (ids.includes(saved)) return saved;
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  return ids.includes(browser) ? browser : ids[0];
}

async function loadLanguage(id) {
  busy = true;
  try {
    lang = id;
    store.set("tt.lang", id);
    const info = languages.find((l) => l.id === id);
    alphabet = new Set(info.alphabet);
    document.documentElement.lang = id;
    uiLang = I18N[id] ? id : "en";        // the interface follows the typing language
    markLangSwitch();
    hideWarn();
    el.live.classList.remove("final");
    layout = await getJSON("/layout");
    drawKeyboard();
    // switching language: the new keyboard and letters fade in (not at start)
    if (languages.length && exercise) {
      FX.anim(el.keyboard, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
      FX.anim(el.letters, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    }
    // home-row keys for the intro text ("bumps on F and J" / "on А and О")
    const home = layout.rows.flat().filter((k) => k.home).map((k) => k.char.toUpperCase());
    [i18nVars.f, i18nVars.j] = home;
    const row = layout.rows[1].map((k) => k.char.toUpperCase());
    i18nVars.l = row.slice(0, 4).join(" ");
    i18nVars.r = row.slice(6, 10).join(" ");
    applyI18n();
    labelTips();
    applyKb();                              // re-translates "off"
    await refreshStats();
    await loadExercise();
    if (view === "stats") renderStats();

    if (store.get(`tt.level.${id}`) === "pro" && exercise.locked.length && !lastStats.sessionCount) {
      // the GitHub Pages version forgets progress on reload: re-apply the choice
      await postJSON("/progress", { unlockAll: true });
      await refreshStats();
      await loadExercise();
    }
  } finally {
    busy = false;
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
    squishThumb(el.switch);
    setView(view === "type" ? "stats" : "type");
    return;
  }
  const altGr = e.getModifierState?.("AltGraph");
  if (e.altKey && !e.ctrlKey && !e.metaKey && !altGr && /^Digit[1-9]$/.test(e.code)) {
    const l = languages[Number(e.code.slice(5)) - 1];
    if (l) { e.preventDefault(); switchLanguage(l.id); }
    return;
  }
  if (view !== "type") return;
  if (e.key === "Escape") { e.preventDefault(); newExercise(); return; }
  if (e.key === "Tab") { e.preventDefault(); nudge(); return; }   // no restart, see nudge()
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
el.input.addEventListener("input", () => {
  for (const ch of el.input.value) handleChar(ch);
  el.input.value = "";
});

const isTouch = () => matchMedia("(pointer: coarse)").matches;
function focusText() {
  if (isTouch() && document.activeElement !== el.input) el.input.focus({ preventScroll: true });
  el.textBox.classList.remove("blurred");
}
el.textBox.addEventListener("click", () => { el.input.focus({ preventScroll: true }); focusText(); });
el.input.addEventListener("blur", () => { if (isTouch()) el.textBox.classList.add("blurred"); });

function newExercise() {
  if (busy) return;
  el.live.classList.remove("final");
  loadExercise().catch(console.error);
}
el.btnNew.addEventListener("click", (e) => { e.currentTarget.blur(); newExercise(); });
// ---------- reset ----------
// Back to the very first visit: the server forgets every language, the
// browser forgets its settings (keys starting with "tt."), the page reloads.
// The first click only "arms" the button (red, new tooltip); the second one
// resets. Moving the mouse away disarms it.
const btnReset = $("btn-reset");
function disarmReset() {
  btnReset.classList.remove("armed");
  btnReset.dataset.tip = "tip.reset";
  if (tipFor === btnReset) showTip(btnReset);
}
btnReset.addEventListener("click", async () => {
  if (!btnReset.classList.contains("armed")) {
    btnReset.classList.add("armed");
    btnReset.dataset.tip = "tip.resetConfirm";
    FX.shake(btnReset);
    showTip(btnReset);
    return;
  }
  if (busy) return;
  busy = true;
  try {
    for (const l of languages) {
      await fetch(`${API}/reset?lang=${encodeURIComponent(l.id)}`, { method: "POST" });
    }
  } catch (err) { console.error(err); }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("tt.")) localStorage.removeItem(k);
  } catch { /* storage blocked: nothing saved anyway */ }
  location.reload();
});
btnReset.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") disarmReset(); }); // a tap "leaves" at once
btnReset.addEventListener("blur", disarmReset);

function applyHeat(on) {
  el.keyboard.classList.toggle("show-heat", on);
  el.heat.setAttribute("aria-pressed", String(on));
  store.set("tt.heat", on ? "1" : "");
}
el.heat.addEventListener("click", () => {
  el.heat.blur();
  applyHeat(el.heat.getAttribute("aria-pressed") !== "true");
  FX.bump(el.heat, 1.15);
});

// ---------- start ----------
(async function init() {
  // interface language for the splash, before the server answers
  const guess = store.get("tt.lang") || (navigator.language || "").slice(0, 2).toLowerCase();
  uiLang = I18N[guess] ? guess : "en";
  const splash = Splash.start();
  // keyboard size from last time (an old saved 0 meant "hidden")
  const saved = Number(store.get("tt.kbSize") ?? 100) || 0;
  kbHidden = store.get("tt.kbHidden") === "1" || saved === 0;
  kbSize = saved ? Math.min(KB_MAX, Math.max(KB_MIN, Math.round(saved / KB_STEP) * KB_STEP)) : 100;
  applyKb();
  applyHeat(store.get("tt.heat") === "1");
  labelTips();
  if (isTouch()) el.textBox.classList.add("blurred"); // phone: tap to open the keyboard
  if (location.protocol === "file:") {                 // opened by double-click, no server
    el.text.textContent = t("err.file");
    await splash.done();
    return;
  }
  try {
    languages = await getJSON("/languages", true);
    buildLangSwitch();
    await loadLanguage(initialLanguage());
  } catch (err) {
    console.error(err);
    el.text.textContent = t("err.load");
  }
  await splash.done();
  if (!store.get("tt.introDone") && layout) showIntro();   // only the very first visit
})();
