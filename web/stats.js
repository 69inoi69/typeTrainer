// The stats screen, a page that scrolls (as monkeytype's account page): the
// personal best of every round length (the cells also pick the length shown
// below), all time (time typing, rounds, words, days in a row and the
// activity calendar of the last year), then the picked length in detail
// (tiles and the WPM chart), the difficulty heatmap keyboard and the letter
// chips. The exact numbers live in tooltips (hover, or keyboard focus).
// refreshStats() also keeps S.lastStats fresh for the typing screen. Rounds
// of different lengths are never mixed: the detail shows one length at a
// time (the one chosen in the settings, or another one picked above).
// Layer: middle. Imports the bottom layer, tools.js (tooltips) and settings.js.
// Called by: typing.js (refreshStats after every portion and round),
// languages.js (on a language change), input.js (on the Stats tab, a resize
// and a new round length).

import { i18nVars, t, applyI18n } from "./i18n.js";
import { el, S } from "./state.js";
import { getJSON } from "./api.js";
import { showTip } from "./tools.js";
import { LENGTHS, lengthLabel, firstRoundDone } from "./settings.js";

// S.lastStats: the letters and the rounds of the length chosen in the
// settings (the typing screen compares a round with those).
let introVars = "";
export async function refreshStats() {
  S.lastStats = await getJSON(`/stats?length=${S.settings.length}`);
  activityStale = true;                             // a round may have been added: asked again when shown
  other = null;                                     // back to the chosen length
  if (S.lastStats.lengths.length) firstRoundDone(); // finished rounds before: the live numbers are earned
  const vars = [S.lastStats.targetWpm, S.lastStats.masteryMin, Math.round(S.lastStats.masteryErr)];
  // the intro's texts carry these numbers: fill them again only when they
  // change (this runs after every portion, while you type)
  if (vars.join() !== introVars) {
    introVars = vars.join();
    [i18nVars.target, i18nVars.min, i18nVars.err] = vars;   // the mastery rule, for its explanations
    applyI18n(el.intro);
  }
  if (S.view === "stats") renderStats();
}

// Draws the stats screen from the last answers (no server call, except
// for another round length picked on this screen).
// Free practice shows its own history (S.free, modes.js): the tiles and the
// chart, no letters (style.css hides their panels, body[data-mode="free"]).
// What the stats screen shows right now: {s: the answer, free, length}
// (share.js copies and draws exactly that).
export function shownStats() {
  const free = S.mode === "free";
  const own = free ? S.free : S.lastStats;
  const picked = other && other.free === free && other.length !== S.settings.length;
  return { s: picked ? other.data : own, free, length: picked ? other.length : S.settings.length };
}
export function renderStats() {
  const { s, free, length } = shownStats();
  if (!s) return;
  renderModeFilter(free);
  // the bests are of every length, in whichever answer is shown
  renderLengthFilter(s.lengths ?? [], length, s.bests ?? {});
  document.getElementById("len-head").textContent = lengthLabel(length);
  const sessions = [...s.sessions].reverse(); // oldest first
  // nothing to share before the first round of this length
  document.getElementById("btn-image").disabled = !s.sessionCount;
  el.tiles.innerHTML = tiles(sessions, s.sessionCount, free ? 0 : S.settings.goal, s.targetWpm);
  drawActivity();
  if (activityStale) loadActivity();

  // the chart last: it is drawn at the size of its box, and on a desktop
  // that box takes the height the keyboard and the letters leave (style.css)
  if (!free) {
    drawHeatKeyboard(s.keys);
    drawLetterGrid(s.keys);   // the same colour scale as the keyboard
  }
  // the dashed line: your own goal when you set one (learning), else the
  // trainer's target (the test speed in free practice)
  drawChart(sessions, free ? s.testWpm : S.settings.goal || s.targetWpm, s.sessionCount);
}

// ---------- the tiles ----------
// Rounds and the averages of the last 10 rounds (the best is in the cell of
// the length above, not here twice), each with how it
// moved against the 10 rounds before (from 5 of them on), and the personal
// goal when there is one. The value comes first in the HTML (screen readers:
// value, then what it is); style.css puts the label on top.
function tiles(sessions, count, goal, target) {
  const avg = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : null;
  const last = sessions.slice(-10), before = sessions.slice(-20, -10);
  const num = (v, unit = "") => v === null ? "—" : Math.round(v) + (unit && `<i>${unit}</i>`);
  // how a "last 10" number moved: up is better for all three
  const trend = (f) => {
    const now = avg(last.filter((x) => f(x) != null), f), was = avg(before.filter((x) => f(x) != null), f);
    if (now === null || was === null || before.length < 5) return "";
    const d = Math.round(now - was);
    if (!d) return "";
    return ` <span class="trend ${d > 0 ? "up" : "down"}" data-tip="tile.trend">${d > 0 ? "↑" : "↓"} ${Math.abs(d)}</span>`;
  };
  // a tile: the number, what it is, and a small line under the number
  const tile = (value, label, meta = "", cls = "") =>
    `<div class="tile${cls}"><b>${value}</b><small>${label}</small><span class="meta">${meta}</span></div>`;
  const last10 = (f) => t("tile.last10") + trend(f);
  const wpm = avg(last, (x) => x.wpm);
  const out = [
    tile(count, t("tile.exercises")),
    tile(num(wpm), t("tile.wpm"), last10((x) => x.wpm), " speed"),
    tile(num(avg(last, (x) => x.accuracy), "%"), t("tile.acc"), last10((x) => x.accuracy)),
    tile(num(avg(last.filter((x) => x.consistency != null), (x) => x.consistency), "%"), t("tile.cons"), last10((x) => x.consistency)),
  ];
  if (goal) {
    // how far the recent average is from it, and a bar of the way there
    const left = wpm === null ? null : Math.max(0, Math.round(goal - wpm));
    const note = left === null ? "" : left ? t("tile.toGo", { n: left }) : t("tile.reached");
    const part = wpm === null ? 0 : Math.min(1, wpm / goal);
    out.push(`<div class="tile goal${left === 0 ? " done" : ""}" data-tip-text="${t("tile.goalTip", { target })}">` +
      `<b>${goal}</b><small>${t("tile.goal")}</small><span class="meta">${note}</span>` +
      `<i class="goal-bar" style="--p:${part.toFixed(3)}"></i></div>`);
  }
  return out.join("");
}

// ---------- all time: totals, days in a row, the calendar ----------
// From /activity: every day with a round, both modes and every length
// (a day is the user's own: the browser sends its offset from UTC). It is
// asked for only when the stats are shown and something may have changed.
let activity = null, activityStale = true;
async function loadActivity() {
  activityStale = false;
  try {
    activity = (await getJSON(`/activity?tz=${-new Date().getTimezoneOffset()}`)).days;
  } catch (err) { console.error(err); return; }
  if (S.view === "stats") drawActivity();
}
// The calendar shows up to a year, as many weeks as fit the width with
// cells of at least CELL_MIN px (a phone shows fewer weeks).
const WEEKS_MAX = 53, CELL_MIN = 10, CELL_GAP = 3, DAY_LABELS = 34;
// A date as the browser's "2026-10-18" in local time
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// 3725 s -> "1 h 2 min"; 125 s -> "2 min"; 40 s -> "40 s"
function duration(sec) {
  sec = Math.round(sec);
  if (sec < 60) return t("time.s", { s: sec });
  const m = Math.floor(sec / 60);
  return m < 60 ? t("time.m", { m }) : t("time.h", { h: Math.floor(m / 60), m: m % 60 });
}
// Days in a row with practice, up to today; a streak still counts on a
// day not practised YET (it ends only when a whole day is missed).
function dayStreak(byDate) {
  const d = new Date();
  if (!byDate.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (byDate.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function drawActivity() {
  const box = document.getElementById("activity");
  const days = activity ?? [];
  const byDate = new Map(days.map((x) => [x.date, x]));
  const sum = (f) => days.reduce((a, x) => a + f(x), 0);
  const streak = dayStreak(byDate);
  const stat = (value, label, cls = "") => `<div class="act-stat${cls}"><b>${value}</b><small>${t(label)}</small></div>`;
  // the calendar: columns are weeks (Monday on top), the last one is this
  // week; a cell is as bright as that day's time typing, against the
  // busiest day shown (four steps)
  const width = box.clientWidth - 36 - DAY_LABELS;   // the panel's padding and the day names
  const weeks = Math.max(8, Math.min(WEEKS_MAX, Math.floor((width + CELL_GAP) / (CELL_MIN + CELL_GAP))));
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);   // a Monday
  const shown = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) shown.push(dayKey(d));
  const most = Math.max(1, ...shown.map((k) => byDate.get(k)?.seconds ?? 0));
  const lang = document.documentElement.lang || undefined;
  const fmt = new Intl.DateTimeFormat(lang, { weekday: "short", month: "short", day: "numeric" });
  const cells = shown.map((k) => {
    const x = byDate.get(k), date = fmt.format(new Date(k + "T12:00"));
    const level = x ? Math.max(1, Math.ceil((x.seconds / most) * 4)) : 0;
    const tip = !x ? t("act.dayNone", { date })
      : t(x.rounds === 1 ? "act.dayOne" : "act.day", { date, time: duration(x.seconds), n: x.rounds });
    return `<i class="l${level}" data-tip-text="${tip}"></i>`;
  }).join("");
  // the month names over the week where a month starts
  const monthName = new Intl.DateTimeFormat(lang, { month: "short" });
  let months = "";
  for (let w = 0, last = -1; w < weeks; w++) {
    const d = new Date(start);
    d.setDate(start.getDate() + w * 7);
    if (d.getMonth() !== last && (w > 0 || d.getDate() <= 7)) months += `<span style="grid-column:${w + 1} / span 4">${monthName.format(d)}</span>`;
    last = d.getMonth();
  }
  // Monday, Wednesday, Friday on the left (2026-10-19 was a Monday)
  const dayName = new Intl.DateTimeFormat(lang, { weekday: "short" });
  const dayNames = [0, 2, 4].map((i) => `<span style="grid-row:${i + 1}">${dayName.format(new Date(2026, 9, 19 + i))}</span>`).join("");
  const legend = `<span class="act-legend">${t("act.less")}<i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i>${t("act.more")}</span>`;
  box.innerHTML = `<div class="act-head"><div class="act-stats" data-tip="act.allTime">` +
    stat(duration(sum((x) => x.seconds)), "act.time") +
    stat(sum((x) => x.rounds), "act.rounds") +
    stat(Math.round(sum((x) => x.chars) / 5), "act.words") +
    stat(`${streak}`, "act.streak", streak ? " hot" : "") +
    `</div>${legend}</div>` +
    `<div class="act-cal" style="--weeks:${weeks}"><div class="act-months">${months}</div>` +
    `<div class="act-days">${dayNames}</div><div class="act-grid">${cells}</div></div>`;
}

// The five numbers of the tiles, [value, label key]: rounds, best wpm and
// the averages of the last 10 rounds (share.js uses the same numbers).
export function summary(s) {
  const sessions = [...s.sessions].reverse(); // oldest first
  const last10 = sessions.slice(-10);
  const avg = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : null;
  const measured = last10.filter((x) => x.consistency != null);   // short rounds and old history have none
  const fmt = (v, suffix = "") => v === null ? "—" : Math.round(v) + suffix;
  const best = sessions.length ? Math.max(...sessions.map((x) => x.wpm)) : null;
  return [
    [s.sessionCount, "tile.exercises"],
    [fmt(best), "tile.best"],
    [fmt(avg(last10, (x) => x.wpm)), "tile.avgWpm"],
    [fmt(avg(last10, (x) => x.accuracy), "%"), "tile.avgAcc"],
    [fmt(avg(measured, (x) => x.consistency), "%"), "tile.avgCons"],
  ];
}

// ---------- type or freetype ----------
// Once freetype is open, a small switch says whose statistics these are; a
// click changes the mode itself (input.js, chooseMode), as the navigation does.
const modeFilter = document.getElementById("mode-filter");
let modeListener = () => {};
export function onStatsMode(fn) { modeListener = fn; }
function renderModeFilter(free) {
  modeFilter.innerHTML = !S.free?.unlocked ? "" : [["learn", "mode.learn"], ["free", "mode.free"]].map(([m, key]) =>
    `<button type="button" role="tab" data-mode="${m}" aria-selected="${(m === "free") === free}">${t(key)}</button>`).join("");
}
modeFilter.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]");
  if (!b) return;
  b.blur();
  modeListener(b.dataset.mode);
});

// ---------- one round length at a time ----------
// other: the rounds of a length other than the chosen one, picked on this
// screen ({free, length, data: the /stats or /freeplay/stats answer}).
let other = null;
// The personal bests, as on monkeytype's account page: a cell for every
// round length, always, in the settings' order (owner, 2026-10-16: the row
// must not change with the history or the settings), plus any older length
// found in the history that the settings no longer offer. A cell: the
// length, its best WPM big, the accuracy of that round under it ("—" before
// the first round). The cells are also the switch of the length shown
// below: the picked one is marked.
function renderLengthFilter(have, shown, bests = {}) {
  const ids = [...LENGTHS, ...new Set(have.filter((id) => !LENGTHS.includes(id)))];
  const cell = (id) => {
    const b = bests[id];
    return `<button type="button" role="tab" class="pb" data-length="${id}" aria-selected="${id === shown}">` +
      `<small>${lengthLabel(id)}</small><b>${b ? Math.round(b.wpm) : "—"}</b>` +
      `<span>${b ? Math.round(b.accuracy) + "%" : "&nbsp;"}</span></button>`;
  };
  // two groups: rounds of N words, rounds of N seconds (owner, 2026-10-16:
  // they are different kinds of round, not one row)
  const isTime = (id) => id.startsWith("time");
  const words = ids.filter((id) => !isTime(id)), time = ids.filter(isTime);
  el.lengthFilter.innerHTML = [words, time].filter((g) => g.length)
    .map((g) => `<div class="pb-group panel">${g.map(cell).join("")}</div>`).join("");
}
el.lengthFilter.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-length]");
  if (!b) return;
  b.blur();
  const id = b.dataset.length, free = S.mode === "free";
  if (id === S.settings.length) other = null;
  else other = { free, length: id, data: await getJSON(`${free ? "/freeplay/stats" : "/stats"}?length=${id}`) };
  renderStats();
});

const HEAT_FLOOR = 0.35;   // difficulty that is red at the least (see drawHeatKeyboard)
// Difficulty heatmap: the keyboard of the language, but grey, and every key
// from gold to red by the difficulty the algorithm gives its letter, against
// the hardest letter measured (HEAT_FLOOR at the least). Dashed = no data yet. Hover (or tap) a key for the numbers.
// It lives only on the stats screen, so it never distracts while typing.
function drawHeatKeyboard(keys) {
  if (!S.layout) return;
  const byChar = new Map(keys.map((k) => [k.char, k]));
  // the colour is the difficulty against the hardest letter measured, so
  // the letters differ even when all are fairly easy (owner, 2026-10-18:
  // every key looked the same); at least HEAT_FLOOR, so a set of easy
  // letters stays gold instead of turning red
  const hardest = Math.max(HEAT_FLOOR, ...keys.filter((k) => k.count).map((k) => k.difficulty));
  el.heatKb.innerHTML = "";
  S.layout.rows.forEach((row, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row";
    rowEl.style.paddingLeft = `calc(var(--u) * ${S.layout.offsets?.[i] ?? 0})`;
    for (const k of row) {
      const key = document.createElement("div");
      key.className = "key hk" + (k.home ? " home" : "");
      if (k.width) key.style.width = `calc(var(--u) * ${k.width} + var(--u) * .12 * ${k.width - 1})`;
      key.innerHTML = `<span class="heat"></span><span class="lbl"></span>`;
      key.querySelector(".lbl").textContent = k.char === " " ? t("key.space") : (k.label || k.char);
      if (k.alt) {
        const alt = document.createElement("span");
        alt.className = "alt";
        alt.textContent = k.alt;
        key.appendChild(alt);
      }
      // one key can carry two letters (a and ą): the harder one colours it
      const letters = k.modifier ? [] : [k.char, k.alt].filter(Boolean).map((c) => byChar.get(c)).filter(Boolean);
      const seen = letters.filter((s) => s.count);
      if (!letters.length) key.classList.add("none");                  // not a letter of this language
      else if (!seen.length) key.classList.add(letters.some((s) => s.unlocked) ? "nodata" : "locked");
      else {
        key.style.setProperty("--heat", (Math.max(...seen.map((s) => s.difficulty)) / hardest).toFixed(3));
        if (seen.every((s) => s.mastered)) key.classList.add("mastered");
      }
      if (letters.length) {
        key.dataset.tipText = letters.map(heatLine).join("   |   ");
        key.tabIndex = 0;                                              // the numbers by keyboard too
      }
      rowEl.appendChild(key);
    }
    el.heatKb.appendChild(rowEl);
  });
}
// "b: 25% errors · 811 ms · presses: 4"
function heatLine(s) {
  let info;
  if (!s.count) info = s.unlocked ? t("letter.noData") : t("letter.locked");
  else {
    info = [t("letter.err", { e: Math.round(s.errorRate * 100) })];
    if (s.avgMs) info.push(t("letter.ms", { ms: Math.round(s.avgMs) }));
    info.push(t("heat.count", { n: s.count }));
    if (s.mastered) info.push(t("letter.mastered"));
    info = info.join(" · ");
  }
  return `${s.char}: ${info}`;
}
// phones have no hover: a tap on a key shows its numbers
el.heatKb.addEventListener("click", (e) => {
  const key = e.target.closest("[data-tip-text]");
  if (key) showTip(key);
});

// Bar chart of WPM per round, drawn as SVG by hand (no chart library).
// target: the goal line (the trainer's target speed, or the test speed in
// free practice); total: all rounds of this length, so a bar can say "#41".
function drawChart(sessions, target, total) {
  if (!sessions.length) {
    el.chart.innerHTML = `<div class="empty">${t("chart.empty")}</div>`;
    el.chartNote.textContent = "";
    return;
  }
  const first = total - sessions.length + 1; // number of the oldest shown round
  const scope = sessions.length === total ? t("chart.all") : t("chart.last", { n: sessions.length });
  const withAvg = sessions.length >= 3;                  // fewer: no trend to show
  el.chartNote.textContent = t(withAvg ? "chart.noteAvg" : "chart.note", { scope, target });

  // draw at the real pixel size of the box (style.css sizes it to fit the
  // screen), so text stays 11px on a phone too. The "no rounds yet" line
  // goes first: while it is there the box is only as tall as that line.
  el.chart.replaceChildren();
  const W = Math.max(280, el.chart.clientWidth || 860), H = Math.max(120, el.chart.clientHeight || 200);
  const padL = 34, padR = 8, padT = 10, padB = 22;
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
    svg += `<path class="bar${i === sessions.length - 1 ? " last" : ""}" data-i="${i}" style="--i:${i}" d="${d}"/>`;   /* --i: its turn to grow (style.css) */
  });
  svg += `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>`;
  // the trend: the average of each round and the up to 9 before it, so one
  // good or bad round does not hide where you are going
  if (withAvg) {
    const pts = sessions.map((_, i) => {
      const part = sessions.slice(Math.max(0, i - 9), i + 1);
      const v = part.reduce((a, x) => a + x.wpm, 0) / part.length;
      return `${(padL + (i + 0.5) * slot).toFixed(1)},${y(v).toFixed(1)}`;
    });
    svg += `<polyline class="avg" points="${pts.join(" ")}"/>`;
  }
  // x labels: first and last round number
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
      const cons = x.consistency != null ? ` <span>·</span> ${t("chart.cons", { pct: Math.round(x.consistency) })}` : "";
      el.tooltip.innerHTML = `<span>#${first + i}</span> ${Math.round(x.wpm)} wpm <span>·</span> ${Math.round(x.accuracy)}%${cons}`;
      el.tooltip.style.left = e.clientX + "px";
      el.tooltip.style.top = e.clientY + "px";
      el.tooltip.classList.remove("below");
      el.tooltip.classList.add("show");
    });
  });
}
// The top of the axis: four equal round steps, so every grid line has a
// round label (0 / 20 / 40 / 60 / 80, not 0 / 63 / 125 / 188 / 250).
function niceMax(v) {
  const steps = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250];
  const step = steps.find((s) => s * 4 >= v * 1.05) ?? Math.ceil(v * 1.05 / 400) * 100;
  return step * 4;
}

// Every letter as a small chip, weakest first: the letter, and under it a
// thin bar as long and as red as its difficulty against the hardest letter,
// as on the keyboard (green dot = mastered).
// The numbers are in the tooltip, the same line as on the heatmap keyboard.
function drawLetterGrid(keys) {
  const hardest = Math.max(HEAT_FLOOR, ...keys.filter((k) => k.count).map((k) => k.difficulty));
  // open letters first (weakest first, as the server sorts them), locked ones last
  keys = [...keys.filter((k) => k.unlocked), ...keys.filter((k) => !k.unlocked)];
  el.letterGrid.innerHTML = keys.map((k) => {
    const cls = "lchip" + (k.unlocked ? "" : " locked") + (k.mastered ? " mastered" : "") + (k.count ? "" : " nodata");
    const d = k.count ? (k.difficulty / hardest).toFixed(3) : 0;
    return `<div class="${cls}" tabindex="0" style="--d:${d}" data-tip-text="${heatLine(k)}">` +
      `<span class="ch">${k.char}</span><i class="meter"></i></div>`;
  }).join("");
}
// phones have no hover: a tap on a chip shows its numbers
el.letterGrid.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-tip-text]");
  if (chip) showTip(chip);
});
