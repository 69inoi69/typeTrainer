// The stats screen, a page that scrolls (as monkeytype's account page):
// of Learn, Climb and Freetype (Learn has its own since 2026-10-21, with
// three panels of letters below, learnstats.js). On top the switch of the modes
// (and, for Freetype, of its word lists: every list is a history of its
// own), then the personal best of every round length (the cells also pick
// the length shown below), all time (time typing, rounds, words, days in a
// row and the activity calendar of the last year, every mode), then the
// picked length in detail (tiles, with the level in Climb, and the WPM
// chart). The exact numbers live in tooltips (hover, or keyboard focus).
// refreshStats() keeps S.lastStats (learning: the letters) fresh for the
// typing screen. Rounds of different lengths (and lists) are never mixed:
// the detail shows one at a time (the ones of the typing screen, or others
// picked on this screen).
// Layer: middle. Imports the bottom layer, settings.js and learnstats.js.
// Called by: typing.js (refreshStats after every portion and round),
// languages.js (on a language change), input.js (on the Stats tab, a resize
// and a new round length; resetStatsPick when the stats open).

import { i18nVars, t, applyI18n } from "./i18n.js";
import { $, el, S, store, reducedMotion, levelWords, listLabel, listless } from "./state.js";
import { getJSON } from "./api.js";
import { LENGTHS, lengthLabel, lengthFor, firstRoundDone } from "./settings.js";
import { renderLearnStats, learnStatsStale } from "./learnstats.js";
import { freetypeUrl, toggledVariant } from "./modes.js";

// S.lastStats: the letters and the rounds of the length chosen in the
// settings (the typing screen compares a round with those).
let introVars = "";
export async function refreshStats() {
  S.lastStats = await getJSON(`/stats?length=${lengthFor("learn")}`);   // learning's own length
  activityStale = true;                             // a round may have been added: asked again when shown
  learnStatsStale();
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
// What the stats screen shows: a mode ("learn", "climb" or "freetype"),
// Freetype's list and kind of text, and a round length. It starts as the typing
// screen's (resetStatsPick, when the stats open); the switches on this
// screen change it.
const pick = { mode: "climb", list: 0, variant: "", length: "" };
export function resetStatsPick() {
  const mode = ["learn", "climb", "freetype"].includes(S.mode) ? S.mode : "climb";
  Object.assign(pick, { mode, list: S.freetypeList, variant: S.freetypeVariant, length: lengthFor(mode) });
}
// The answer for the pick: the typing screen's own (S.climb, S.freetype,
// modes.js) when it is the same, else one fetched for this screen (other).
let other = null;   // {key, data}
const keyOf = (p) => `${p.mode} ${p.list} ${p.variant} ${p.length}`;
function own(p) {
  if (p.length !== lengthFor(p.mode)) return null;
  if (p.mode === "learn") return S.lastStats;
  if (p.mode === "climb") return S.climb;
  return p.list === S.freetypeList && p.variant === S.freetypeVariant ? S.freetype : null;
}
const statsUrl = (p) => p.mode === "learn" ? `/stats?length=${p.length}` : p.mode === "climb" ? `/freeplay/stats?length=${p.length}` : freetypeUrl(p.length, p.list, p.variant);

// What the stats screen shows right now: {s: the answer, mode, list,
// length} (share.js copies and draws exactly that).
export function shownStats() {
  if (!pick.length) resetStatsPick();
  const s = own(pick) ?? (other?.key === keyOf(pick) ? other.data : null);
  return { s, ...pick };
}
export function renderStats() {
  const { s, length, mode, list, variant } = shownStats();
  renderPick(mode, list, variant);
  if (!s) return;
  // the bests are of every length, in whichever answer is shown
  renderLengthFilter(s.lengths ?? [], length, s.bests ?? {});
  document.getElementById("len-head").textContent = lengthLabel(length);
  const sessions = [...s.sessions].reverse(); // oldest first
  // nothing to share before the first round of this length
  document.getElementById("btn-image").disabled = !s.sessionCount;
  el.tiles.innerHTML = tiles(sessions, s.sessionCount, S.settings.goal, mode === "climb" ? s.place?.level : null, s.streaks ?? []);
  drawActivity();
  if (activityStale) loadActivity();

  // the chart last: it is drawn at the size of its box (stats.css); the
  // dashed line is your own goal, when you set one in the settings
  drawChart(sessions, S.settings.goal, s.sessionCount, mode === "learn" ? s.order : null);
  renderLearnStats(mode === "learn").catch(console.error);
}

// ---------- the tiles ----------
// Rounds and the averages of the last 10 rounds (the best is in the cell of
// the length above, not here twice), each with how it
// moved against the 10 rounds before (from 5 of them on), and the personal
// goal when there is one. The value comes first in the HTML (screen readers:
// value, then what it is); stats.css puts the label on top.
function tiles(sessions, count, goal, level, streaks) {
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
    // where the next round starts (1..100): the thermostat of Climb (null: Freetype has none)
    level != null ? `<div class="tile level" data-tip-text="${t("tile.levelTip", { words: levelWords(level) })}"><b>${level}</b><small>${t("tile.level")}</small><span class="meta">${t("tile.levelNote")}</span></div>` : "",
    tile(count, t("tile.exercises")),
    tile(num(wpm), t("tile.wpm"), last10((x) => x.wpm), " speed"),
    tile(num(avg(last, (x) => x.accuracy), "%"), t("tile.acc"), last10((x) => x.accuracy)),
    tile(num(avg(last.filter((x) => x.consistency != null), (x) => x.consistency), "%"), t("tile.cons"), last10((x) => x.consistency)),
  ];
  // the accuracy streaks (keybr's): the most rounds in a row at 95%+ in
  // big, the stricter ones under it, the run going on now in the tooltip;
  // they reward care, not speed
  if (count && streaks.length) {
    const [first, ...rest] = streaks;
    const meta = rest.map((x) => t("tile.streakAt", { min: x.min, n: x.longest })).join(", ");
    const now = streaks.filter((x) => x.current).at(-1);   // the strictest one going on now
    const tip = t("tile.streakTip", { min: first.min }) + " " +
      (now ? t("tile.streakNow", { n: now.current, min: now.min }) : t("tile.streakNone", { min: first.min }));
    out.push(`<div class="tile" data-tip-text="${tip}"><b>${first.longest}</b><small>${t("tile.streak", { min: first.min })}</small><span class="meta">${meta}</span></div>`);
  }
  if (goal) {
    // how far the recent average is from it, and a bar of the way there
    const left = wpm === null ? null : Math.max(0, Math.round(goal - wpm));
    const note = left === null ? "" : left ? t("tile.toGo", { n: left }) : t("tile.reached");
    const part = wpm === null ? 0 : Math.min(1, wpm / goal);
    out.push(`<div class="tile goal${left === 0 ? " done" : ""}" data-tip="tile.goalTip">` +
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
// The numbers on top count today, the last 7 days (today among them) or
// all time (keybr has All time and Today; a week shows growth a day cannot).
// The choice is remembered (tt.actPeriod). Days in a row and the calendar
// always look at every day.
const PERIODS = { today: 1, week: 7, all: 0 };   // days counted, 0 = every one
let period = PERIODS[store.get("tt.actPeriod")] !== undefined ? store.get("tt.actPeriod") : "all";
function drawActivity() {
  const box = document.getElementById("activity");
  const days = activity ?? [];
  const byDate = new Map(days.map((x) => [x.date, x]));
  const from = new Date();
  from.setDate(from.getDate() - PERIODS[period] + 1);
  const counted = PERIODS[period] ? days.filter((x) => x.date >= dayKey(from)) : days;
  const sum = (f) => counted.reduce((a, x) => a + f(x), 0);
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
  const goal = S.settings.daily;
  const lang = document.documentElement.lang || undefined;
  const fmt = new Intl.DateTimeFormat(lang, { weekday: "short", month: "short", day: "numeric" });
  const cells = shown.map((k) => {
    const x = byDate.get(k), date = fmt.format(new Date(k + "T12:00"));
    const level = x ? Math.max(1, Math.ceil((x.seconds / most) * 4)) : 0;
    // a day that met the daily goal (the settings, minutes) gets a ring:
    // the brightness says how long, the ring says "goal met"
    const met = x && goal && x.seconds >= goal * 60;
    const tip = !x ? t("act.dayNone", { date })
      : t(x.rounds === 1 ? "act.dayOne" : "act.day", { date, time: duration(x.seconds), n: x.rounds }) + (met ? ". " + t("act.goalMet") : "");
    return `<i class="l${level}${met ? " met" : ""}" data-tip-text="${tip}"></i>`;
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
  const legend = `<span class="act-legend">${t("act.less")}<i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i>${t("act.more")}` +
    (goal ? `<i class="l2 met"></i>${t("act.goalLegend")}` : "") + `</span>`;
  const periods = `<div class="seg act-period" role="group" aria-label="${t("act.period")}">` +
    Object.keys(PERIODS).map((p) => `<button type="button" data-period="${p}" aria-pressed="${p === period}">${t("act." + p)}</button>`).join("") + `</div>`;
  box.innerHTML = `<div class="act-head"><div class="act-stats" data-tip="act.${period}Tip">` +
    stat(duration(sum((x) => x.seconds)), "act.time") +
    stat(sum((x) => x.rounds), "act.rounds") +
    stat(Math.round(sum((x) => x.chars) / 5), "act.words") +
    stat(`${streak}`, "act.streak", streak ? " hot" : "") +
    `</div><div class="act-side">${periods}${legend}</div></div>` +
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

// ---------- the mode, the list and the length shown ----------
// Shows the pick: the answer is asked for first when it is not the typing
// screen's own. Only the parts below change: no opening animation of the
// whole screen again (owner, 2026-10-18: everything vanished and came
// back), just a short fade of the parts that show the new pick.
async function choose(change) {
  Object.assign(pick, change);
  const key = keyOf(pick);
  if (!own(pick) && other?.key !== key) {
    const data = await getJSON(statsUrl(pick));
    if (keyOf(pick) !== key) return;               // picked again meanwhile
    other = { key, data };
  }
  el.viewStats.classList.remove("grow");
  renderStats();
  if (reducedMotion()) return;
  for (const part of [el.lengthFilter, el.tiles, el.chart.closest(".panel")]) {
    part?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
  }
}

// The switch of the three modes, and for Freetype its kinds of text (the
// same switches as in the round bar, modebar.js) and the row of its lists
// (the lists offered come with every /freetype/stats answer; none for
// your own text).
const pickEl = $("stats-pick");
function renderPick(mode, list, variant) {
  const tab = (m, key) => `<button type="button" role="tab" data-mode="${m}" aria-selected="${m === mode}">${t(key)}</button>`;
  const ft = mode === "freetype", lists = ft && !listless(variant) ? (S.freetype?.lists ?? []) : [];
  const kinds = ["long", ...(S.freetype?.sentences ? ["sentences"] : []), "custom"];
  const kind = (k, on) => `<button type="button" class="wl" data-toggle="${k}" aria-pressed="${on}" data-tip-text="${t(`ft.${k}Tip`)}">${t(`ft.${k}`)}</button>`;
  pickEl.innerHTML = `<div class="stats-modes" role="tablist" aria-label="${t("stats.modes")}">${tab("learn", "mode.learn")}${tab("climb", "mode.free")}${tab("freetype", "mode.freetype")}</div>` +
    (ft ? `<div class="stats-lists" role="group" aria-label="${t("ft.kind")}">${kinds.map((k) => kind(k, variant === k)).join("")}</div>` : "") +
    (lists.length ? `<div class="stats-lists" role="tablist" aria-label="${t("freetype.list")}">` + lists.map((n) =>
      `<button type="button" role="tab" class="wl" data-list="${n}" aria-selected="${n === list}" data-tip-text="${t("freetype.listN", { n })}">${listLabel(n)}</button>`).join("") + `</div>` : "");
}
document.getElementById("activity").addEventListener("click", (e) => {
  const b = e.target.closest("[data-period]");
  if (!b || b.dataset.period === period) return;
  period = b.dataset.period;
  store.set("tt.actPeriod", period);
  drawActivity();
});
pickEl.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  b.blur();
  if (b.dataset.mode && b.dataset.mode !== pick.mode) choose({ mode: b.dataset.mode, list: pick.list || S.freetypeList, length: lengthFor(b.dataset.mode) }).catch(console.error);
  if (b.dataset.list && Number(b.dataset.list) !== pick.list) choose({ list: Number(b.dataset.list) }).catch(console.error);
  if (b.dataset.toggle) choose({ variant: toggledVariant(pick.variant, b.dataset.toggle) }).catch(console.error);
});

// ---------- one round length at a time ----------
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
  await choose({ length: b.dataset.length });
});

// Bar chart of WPM per round, drawn as SVG by hand (no chart library).
// target: the goal line, the personal goal from the settings (0 = none);
// total: all rounds of this length, so a bar can say "#41".
// order: Learn's unlock order (null in the other modes): a round that
// opened a letter gets a mark with the letter over its bar, since the
// speed drops after a new letter and climbs back (keybr shows the number
// of keys as a third line; one mark says the same where it matters).
function drawChart(sessions, target, total, order) {
  if (!sessions.length) {
    el.chart.innerHTML = `<div class="empty">${t("chart.empty")}</div>`;
    el.chartNote.textContent = "";
    return;
  }
  const first = total - sessions.length + 1; // number of the oldest shown round
  const scope = sessions.length === total ? t("chart.all") : t("chart.last", { n: sessions.length });
  const withAvg = sessions.length >= 3;                  // fewer: no trend to show
  el.chartNote.textContent = target
    ? t(withAvg ? "chart.noteAvg" : "chart.note", { scope, target })
    : t(withAvg ? "chart.noteAvgNoGoal" : "chart.noteNoGoal", { scope });

  // draw at the real pixel size of the box (stats.css sizes it to fit the
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
    svg += `<path class="bar${i === sessions.length - 1 ? " last" : ""}" data-i="${i}" style="--i:${i}" d="${d}"/>`;   /* --i: its turn to grow (stats.css) */
  });
  // the letters each round opened (against the round before it on the chart)
  const opened = sessions.map((x, i) => order && i && x.unlocked > (sessions[i - 1].unlocked || x.unlocked)
    ? order.slice(sessions[i - 1].unlocked, x.unlocked) : []);
  opened.forEach((letters, i) => {
    if (!letters.length) return;
    const cx = padL + (i + 0.5) * slot;
    svg += `<text class="opened" x="${cx}" y="${padT + 9}" text-anchor="middle">${letters.join("")}</text>` +
      `<line class="opened" x1="${cx}" x2="${cx}" y1="${padT + 13}" y2="${y(sessions[i].wpm) - 3}"/>`;
  });
  if (target) svg += `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>`;
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
      const news = opened[i].length ? ` <span>·</span> ${t("chart.opened", { l: opened[i].join(", ") })}` : "";
      el.tooltip.innerHTML = `<span>#${first + i}</span> ${Math.round(x.wpm)} wpm <span>·</span> ${Math.round(x.accuracy)}%${cons}${news}`;
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
