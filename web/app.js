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
  toast: $("toast"), tooltip: $("tooltip"),
  btnNew: $("btn-new"), btnIntro: $("btn-intro"), heat: $("heat-toggle"),
  kbSize: $("kb-size"), kbSizeOut: $("kb-size-out"),
  intro: $("intro"),
  switch: document.querySelector(".switch"), tabType: $("tab-type"), tabStats: $("tab-stats"),
  viewType: $("view-type"), viewStats: $("view-stats"),
  tiles: $("tiles"), chart: $("chart"), chartNote: $("chart-note"), letterGrid: $("letter-grid"),
  langSwitch: $("lang-switch"), warn: $("layout-warn"),
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

// ---------- small helpers ----------
const store = { // localStorage can be blocked; the app must work without it
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const introOpen = () => !el.intro.classList.contains("hidden");

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
  // the intro shows the home row (A S D F ... ; ) with the same colors
  const home = $("intro-home");
  home.innerHTML = "";
  for (const k of layout.rows[1].slice(0, 10)) home.appendChild(makeKey(k));
}

// The key that types ch: its own key, or the base key for an AltGr letter.
const keyFor = (ch) => keyEls[ch] || keyEls[altBase[ch]] || null;

let nextKeyEl = null;
function highlightNextKey() {
  if (nextKeyEl) nextKeyEl.classList.remove("next");
  if (altgrEl) altgrEl.classList.remove("next");
  const ch = text[pos];
  const base = altBase[ch] ?? ch;      // "ą" is typed on the "a" key
  nextKeyEl = keyEls[base] || null;
  if (!nextKeyEl) { el.hint.innerHTML = "&nbsp;"; return; }
  nextKeyEl.classList.add("next");
  const fingerId = fingerOf[base];
  el.hint.style.setProperty("--fc", layout.fingers[fingerId].color);
  const vars = { key: ch === " " ? t("key.space") : ch, base, finger: t(`finger.${fingerId}`) };
  if (altBase[ch]) {
    if (altgrEl) altgrEl.classList.add("next");
    el.hint.innerHTML = t("hint.alt", vars);
  } else {
    el.hint.innerHTML = t("hint.press", vars);
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

// Keyboard size: 0 = hidden, 100 = default. Remembered in this browser.
function applyKbSize(v) {
  v = Number(v);
  document.documentElement.style.setProperty("--kb-scale", Math.max(v, 10) / 100);
  el.keyboard.classList.toggle("off", v === 0);
  el.hint.style.visibility = v === 0 ? "hidden" : "";
  el.kbSizeOut.textContent = v === 0 ? t("kb.off") : v + "%";
  el.kbSize.value = v;
}
el.kbSize.addEventListener("input", () => {
  applyKbSize(el.kbSize.value);
  store.set("tt.kbSize", el.kbSize.value);
  placeCaret(true);
});
el.kbSize.addEventListener("change", () => el.kbSize.blur()); // keys go back to typing

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
    el.caret.style.transform = `translate(${x - 1}px, ${s.offsetTop + h * 0.09}px)`;
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
  el.lettersCaption.innerHTML = caption;
  popLetter = null;
}

// ---------- exercise ----------
function showExercise(ex) {
  exercise = ex;
  text = ex.text;
  pos = 0; wrongHere = 0; samples = [];
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
  if (busy || pos >= text.length || introOpen() || view !== "type") return;
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
    if (pos === text.length) finishExercise();
  } else {
    wrongHere++;
    spans[pos].classList.add("bad");
    pulseKey(ch, false);
  }
  updateLive();
}

function showWarn(kind) {
  const info = languages.find((l) => l.id === lang);
  el.warn.innerHTML = kind === "caps" ? t("warn.caps") : t("warn.layout", { layout: info?.systemLayout ?? lang });
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
  // the header keeps showing this result until the next exercise starts
  el.wpm.textContent = Math.round(wpm);
  el.acc.textContent = Math.round(accuracy);
  el.live.classList.add("final");
  try {
    const res = await postJSON("/results", { samples, wpm, accuracy });
    if (res.newLetter) {
      popLetter = res.newLetter;
      toast(t("toast.newLetter", { letter: res.newLetter }));
    }
    await refreshStats();
    await loadExercise();   // generated from the UPDATED model
  } catch (err) {
    console.error(err);
    el.hint.textContent = t("err.server");
  } finally {
    busy = false;
  }
}

let toastTimer = null;
function toast(html) {
  el.toast.innerHTML = html;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 4000);
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
el.tabType.addEventListener("click", (e) => { e.currentTarget.blur(); setView("type"); });
el.tabStats.addEventListener("click", (e) => { e.currentTarget.blur(); setView("stats"); });

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
// Shown in full on the very first visit. For a language you have not used
// yet, only the last step (new / can already type) is shown.
let introStep = 0;
function showIntro(step = 0) {
  introStep = step;
  const info = languages.find((l) => l.id === lang);
  $("intro-lang").textContent = info ? " · " + info.name : "";
  renderIntro();
  el.intro.classList.remove("hidden");
  if (step < 2) $("intro-next").focus();
}
function renderIntro() {
  document.querySelectorAll(".intro-step").forEach((s, i) => s.classList.toggle("active", i === introStep));
  document.querySelectorAll("#intro-dots i").forEach((d, i) => d.classList.toggle("on", i === introStep));
  const last = introStep === 2;
  $("intro-next").style.visibility = last ? "hidden" : "visible";
  $("intro-skip").style.visibility = last ? "hidden" : "visible";
  if (last) $("intro-new").focus();
}
async function closeIntro(unlockAll) {
  el.intro.classList.add("hidden");
  store.set("tt.introDone", "1");
  // remember the answer per language (skipping counts as "new")
  store.set(`tt.level.${lang}`, unlockAll ? "pro" : "new");
  if (unlockAll !== undefined) {
    try {
      const res = await postJSON("/progress", { unlockAll });
      // only swap the text if the set of letters really changed
      if (res.unlocked !== exercise?.unlocked.length) {
        await refreshStats();
        await loadExercise();
      }
    } catch (err) { console.error(err); }
  }
  focusText();
}
$("intro-next").addEventListener("click", () => { introStep++; renderIntro(); });
$("intro-skip").addEventListener("click", () => closeIntro());
$("intro-new").addEventListener("click", () => closeIntro(false));
$("intro-pro").addEventListener("click", () => closeIntro(true));
el.btnIntro.addEventListener("click", (e) => { e.currentTarget.blur(); showIntro(); });

// ---------- languages ----------
// The switch is built once; changing language only moves the yellow thumb
// (CSS variable --i), so the slide animation can run.
function buildLangSwitch() {
  el.langSwitch.style.setProperty("--n", languages.length);
  el.langSwitch.innerHTML = `<span class="switch-thumb" aria-hidden="true"></span>` +
    languages.map((l) => `<button type="button" role="tab" data-lang="${l.id}" title="${l.name}">${l.label}</button>`).join("");
  el.langSwitch.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    b.blur();
    if (busy || b.dataset.lang === lang) return;
    loadLanguage(b.dataset.lang).catch((err) => console.error(err));
  }));
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
    // home-row keys for the intro text ("bumps on F and J" / "on А and О")
    const home = layout.rows.flat().filter((k) => k.home).map((k) => k.char.toUpperCase());
    [i18nVars.f, i18nVars.j] = home;
    applyI18n();
    applyKbSize(el.kbSize.value);           // re-translates "off"
    await refreshStats();
    await loadExercise();
    if (view === "stats") renderStats();

    const level = store.get(`tt.level.${id}`);
    if (!level) {
      showIntro(store.get("tt.introDone") ? 2 : 0);
    } else if (level === "pro" && exercise.locked.length && !lastStats.sessionCount) {
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
  if (introOpen()) {
    if (e.key === "Escape") closeIntro();
    return; // let Enter/Tab work on the intro buttons
  }
  if (view !== "type") return;
  if (document.activeElement === el.kbSize) return;  // arrows move the slider
  if (e.key === "Escape") { e.preventDefault(); newExercise(); return; }
  // AltGr (Polish ą, ę, ...) is reported as Ctrl+Alt on Windows; let it through,
  // but keep real browser shortcuts like Ctrl+R working.
  const altGr = e.getModifierState?.("AltGraph");
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
el.heat.addEventListener("change", () => {
  el.keyboard.classList.toggle("show-heat", el.heat.checked);
  el.heat.blur();
});

// ---------- start ----------
(async function init() {
  applyKbSize(store.get("tt.kbSize") ?? 100);
  if (isTouch()) el.textBox.classList.add("blurred"); // phone: tap to open the keyboard
  if (location.protocol === "file:") {                 // opened by double-click, no server
    el.text.textContent = t("err.file");
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
})();
