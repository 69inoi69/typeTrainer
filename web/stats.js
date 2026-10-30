// The stats screen.

import { i18nVars, t, applyI18n } from "./i18n.js";
import { $, el, S, store, reducedMotion, listLabel, listless } from "./state.js";
import { getJSON } from "./api.js";
import { LENGTHS, lengthLabel, lengthFor, setSetting, pickDaily } from "./settings.js";
import { ring, ringBtn } from "./minipop.js";
import { renderLearnStats, learnStatsStale } from "./learnstats.js";
import { freetypeUrl, toggledVariant } from "./modes.js";

// ---------- the goal line ----------
const goalPick = $("goal-pick");
const GOAL_STEP = 5, GOAL_MIN = 20, GOAL_START = 40, GOAL_TOP = 300, GOAL_SAVE_MS = 400;
let goalShown = 0, goalKind = "", saveTimer = 0;
export const goalFor = (mode) => (mode === "learn" ? S.lastStats?.targetWpm ?? 0 : S.settings.goal);
const goalText = (g) => (g ? t("stats.goalIs", { wpm: `<b>${g}</b>` }) : t("stats.goalOff"));
function drawGoalPick(mode) {
  const kind = mode === "learn" ? "learn" : "own";
  if (kind === "own" && saveTimer) return;
  const g = goalFor(mode);
  if (kind !== goalKind) {
    goalKind = kind;
    goalPick.innerHTML = kind === "learn"
      ? `<span class="goal-chip" data-tip-text="${t("stats.goalLearnTip")}"></span>`
      : `<span class="goal-step">` +
        `<button type="button" class="goal-btn" data-step="-1" aria-label="${t("stats.goalDown")}">−</button>` +
        `<button type="button" class="goal-chip goal-toggle" data-tip-text="${t("stats.goalTip")}" aria-live="polite"></button>` +
        `<button type="button" class="goal-btn" data-step="1" aria-label="${t("stats.goalUp")}">+</button></span>`;
  }
  goalShown = g;
  goalPick.querySelector(".goal-chip").innerHTML = goalText(g);
}
function stepGoal(dir) {
  let g = goalShown;
  if (dir > 0) g = g ? Math.min(GOAL_TOP, (Math.floor(g / GOAL_STEP) + 1) * GOAL_STEP) : GOAL_START;
  else if (g) g = (Math.ceil(g / GOAL_STEP) - 1) * GOAL_STEP;
  if (g < GOAL_MIN) g = 0;
  showGoal(g, dir);
}
function toggleGoal() {
  if (goalShown) showGoal(0, -1);
  else showGoal(Number(store.get("tt.goal.last")) || GOAL_START, 1);
}
function showGoal(g, dir) {
  if (g === goalShown) return;
  if (goalShown) store.set("tt.goal.last", String(goalShown));
  goalShown = g;
  goalPick.querySelector(".goal-chip").innerHTML = goalText(g);
  if (!reducedMotion()) goalPick.querySelector(".goal-chip b")?.animate(
    [{ transform: `translateY(${dir > 0 ? 5 : -5}px)`, opacity: 0.3 }, { transform: "none", opacity: 1 }],
    { duration: 160, easing: "ease-out" });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = 0; setSetting("goal", String(goalShown)); }, GOAL_SAVE_MS);
}
goalPick.addEventListener("click", (e) => {
  const b = e.target.closest(".goal-btn");
  if (b) stepGoal(Number(b.dataset.step));
  else if (e.target.closest(".goal-toggle")) toggleGoal();
});
goalPick.addEventListener("wheel", (e) => {
  if (goalKind !== "own" || !e.deltaY) return;
  e.preventDefault();
  stepGoal(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
goalPick.addEventListener("keydown", (e) => {
  if (goalKind !== "own") return;
  const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
  if (!dir) return;
  e.preventDefault();
  stepGoal(dir);
});

let introVars = "";
export async function refreshStats() {
  S.lastStats = await getJSON(`/stats?length=${lengthFor("learn")}`);
  activityStale = true;
  learnStatsStale();
  const vars = [S.lastStats.targetWpm, S.lastStats.masteryMin, Math.round(S.lastStats.masteryErr)];
  if (vars.join() !== introVars) {
    introVars = vars.join();
    [i18nVars.target, i18nVars.min, i18nVars.err] = vars;
    applyI18n(el.intro);
  }
  if (S.view === "stats") renderStats();
}

const pick = { mode: "climb", list: 0, variant: "", length: "" };
export function resetStatsPick() {
  const mode = ["learn", "climb", "freetype"].includes(S.mode) ? S.mode : "climb";
  Object.assign(pick, { mode, list: S.freetypeList, variant: S.freetypeVariant, length: lengthFor(mode) });
}
let other = null;
const keyOf = (p) => `${p.mode} ${p.list} ${p.variant} ${p.length}`;
function own(p) {
  if (p.length !== lengthFor(p.mode)) return null;
  if (p.mode === "learn") return S.lastStats;
  if (p.mode === "climb") return S.climb;
  return p.list === S.freetypeList && p.variant === S.freetypeVariant ? S.freetype : null;
}
const statsUrl = (p) => p.mode === "learn" ? `/stats?length=${p.length}` : p.mode === "climb" ? `/freeplay/stats?length=${p.length}` : freetypeUrl(p.length, p.list, p.variant);

export function shownStats() {
  if (!pick.length) resetStatsPick();
  const s = own(pick) ?? (other?.key === keyOf(pick) ? other.data : null);
  return { s, ...pick };
}
export function renderStats() {
  const { s, length, mode, list, variant } = shownStats();
  renderPick(mode, list, variant);
  if (!s) return;
  renderLengthFilter(s.lengths ?? [], length, s.bests ?? {});
  document.getElementById("len-head").textContent = lengthLabel(length);
  const sessions = [...s.sessions].reverse();
  document.getElementById("btn-image").disabled = !s.sessionCount;
  const goal = goalFor(mode);
  el.tiles.innerHTML = tiles(sessions, s.sessionCount, goal, mode === "climb" ? s.place?.level : null, s.streaks ?? []);
  drawActivity();
  if (activityStale) loadActivity();

  drawChart(sessions, goal, s.sessionCount, mode === "learn" ? s.order : null);
  drawGoalPick(mode);
  renderLearnStats(mode === "learn").catch(console.error);
}

// ---------- the tiles ----------
const compact = new Intl.NumberFormat("en", { notation: "compact" });
function tiles(sessions, count, goal, level, streaks) {
  const avg = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : null;
  const last = sessions.slice(-10), before = sessions.slice(-20, -10);
  const num = (v, unit = "") => v === null ? "—" : Math.round(v) + (unit && `<i>${unit}</i>`);
  const trend = (f) => {
    const now = avg(last.filter((x) => f(x) != null), f), was = avg(before.filter((x) => f(x) != null), f);
    if (now === null || was === null || before.length < 5) return "";
    const d = Math.round(now - was);
    if (!d) return "";
    return ` <span class="trend ${d > 0 ? "up" : "down"}" data-tip="tile.trend">${d > 0 ? "↑" : "↓"} ${Math.abs(d)}</span>`;
  };
  const tile = (value, label, meta = "", cls = "") =>
    `<div class="tile${cls}"><b>${value}</b><small>${label}</small><span class="meta">${meta}</span></div>`;
  const last10 = (f) => t("tile.last10") + trend(f);
  const wpm = avg(last, (x) => x.wpm);
  const out = [
    level != null ? `<div class="tile level"><b>${level}</b><small>${t("tile.level")}</small><span class="meta">${t("tile.levelNote", { list: compact.format(S.climb?.levels?.[level - 1] ?? 0).toLowerCase() })}</span></div>` : "",
    tile(count, t("tile.exercises")),
    tile(num(wpm), t("tile.wpm"), last10((x) => x.wpm), " speed"),
    tile(num(avg(last, (x) => x.accuracy), "%"), t("tile.acc"), last10((x) => x.accuracy)),
    tile(num(avg(last.filter((x) => x.consistency != null), (x) => x.consistency), "%"), t("tile.cons"), last10((x) => x.consistency)),
  ];
  if (count && streaks.length) {
    const [first] = streaks;
    const runs = streaks.map((x) => t("tile.streakAt", { min: x.min, n: x.longest })).join(", ");
    const tip = t("tile.streakTip", { min: first.min, runs });
    out.push(`<div class="tile" data-tip-text="${tip}"><b>${first.current}</b><small>${t("tile.streak", { min: first.min })}</small><span class="meta">${t("tile.streakBest", { n: first.longest })}</span></div>`);
  }
  if (goal) {
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
let activity = null, activityStale = true;
async function loadActivity() {
  activityStale = false;
  try {
    activity = (await getJSON(`/activity?tz=${-new Date().getTimezoneOffset()}`)).days;
  } catch (err) { console.error(err); return; }
  if (S.view === "stats") drawActivity();
}
const WEEKS_MAX = 53, CELL_MIN = 10, CELL_GAP = 3, DAY_LABELS = 34;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function duration(sec) {
  sec = Math.round(sec);
  if (sec < 60) return t("time.s", { s: sec });
  const m = Math.floor(sec / 60);
  return m < 60 ? t("time.m", { m }) : t("time.h", { h: Math.floor(m / 60), m: m % 60 });
}
function dayStreak(byDate) {
  const d = new Date();
  if (!byDate.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (byDate.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const PERIODS = { today: 1, week: 7, all: 0 };
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
  const width = box.clientWidth - 36 - DAY_LABELS;
  const weeks = Math.max(8, Math.min(WEEKS_MAX, Math.floor((width + CELL_GAP) / (CELL_MIN + CELL_GAP))));
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const shown = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) shown.push(dayKey(d));
  const most = Math.max(1, ...shown.map((k) => byDate.get(k)?.seconds ?? 0));
  const goal = S.settings.daily;
  const lang = document.documentElement.lang || undefined;
  const fmt = new Intl.DateTimeFormat(lang, { weekday: "short", month: "short", day: "numeric" });
  const cells = shown.map((k) => {
    const x = byDate.get(k), date = fmt.format(new Date(k + "T12:00"));
    const level = x ? Math.max(1, Math.ceil((x.seconds / most) * 4)) : 0;
    const met = x && goal && x.seconds >= goal * 60;
    const tip = !x ? t("act.dayNone", { date })
      : t(x.rounds === 1 ? "act.dayOne" : "act.day", { date, time: duration(x.seconds), n: x.rounds }) + (met ? ". " + t("act.goalMet") : "");
    return `<i class="l${level}${met ? " met" : ""}" data-tip-text="${tip}"></i>`;
  }).join("");
  const monthName = new Intl.DateTimeFormat(lang, { month: "short" });
  let months = "";
  for (let w = 0, last = -1; w < weeks; w++) {
    const d = new Date(start);
    d.setDate(start.getDate() + w * 7);
    if (d.getMonth() !== last && (w > 0 || d.getDate() <= 7)) months += `<span style="grid-column:${w + 1} / span 4">${monthName.format(d)}</span>`;
    last = d.getMonth();
  }
  const dayName = new Intl.DateTimeFormat(lang, { weekday: "short" });
  const dayNames = [0, 2, 4].map((i) => `<span style="grid-row:${i + 1}">${dayName.format(new Date(2026, 9, 19 + i))}</span>`).join("");
  const legend = `<span class="act-legend">${t("act.less")}<i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i>${t("act.more")}` +
    `<button type="button" class="act-goal" aria-haspopup="dialog" data-tip-text="${t("settings.dailyDesc")}">` +
    (goal ? `<i class="l2 met"></i>${t("act.goalLegend", { g: goal })}` : t("act.goalOff")) + `</button></span>`;
  const periods = `<div class="ring act-period" role="group" aria-label="${t("act.period")}">` +
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

export function summary(s) {
  const sessions = [...s.sessions].reverse();
  const last10 = sessions.slice(-10);
  const avg = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : null;
  const measured = last10.filter((x) => x.consistency != null);
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
async function choose(change) {
  Object.assign(pick, change);
  const key = keyOf(pick);
  if (!own(pick) && other?.key !== key) {
    const data = await getJSON(statsUrl(pick));
    if (keyOf(pick) !== key) return;
    other = { key, data };
  }
  el.viewStats.classList.remove("grow");
  renderStats();
  if (reducedMotion()) return;
  for (const part of [el.lengthFilter, el.tiles, el.chart.closest(".panel")]) {
    part?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
  }
}

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
  const g = e.target.closest(".act-goal");
  if (g) { pickDaily(g, drawActivity); return; }
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
function renderLengthFilter(have, shown, bests = {}) {
  const ids = [...LENGTHS, ...new Set(have.filter((id) => !LENGTHS.includes(id)))];
  const cell = (id) => {
    const b = bests[id];
    return `<button type="button" role="tab" class="pb" data-length="${id}" aria-selected="${id === shown}">` +
      `<small>${lengthLabel(id)}</small><b>${b ? Math.round(b.wpm) : "—"}</b>` +
      `<span>${b ? Math.round(b.accuracy) + "%" : "&nbsp;"}</span></button>`;
  };
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

function drawChart(sessions, target, total, order) {
  if (!sessions.length) {
    el.chart.innerHTML = `<div class="empty">${t("chart.empty")}</div>`;
    el.chartNote.textContent = "";
    return;
  }
  const first = total - sessions.length + 1;
  const scope = sessions.length === total ? t("chart.all") : t("chart.last", { n: sessions.length });
  const withAvg = sessions.length >= 3;
  el.chartNote.textContent = t(withAvg ? "chart.noteAvg" : "chart.note", { scope });

  el.chart.replaceChildren();
  const W = Math.max(280, el.chart.clientWidth || 860), H = Math.max(120, el.chart.clientHeight || 200);
  const padL = 34, padR = 8, padT = 10, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = niceMax(Math.max(target, ...sessions.map((x) => x.wpm)));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const slot = plotW / Math.max(sessions.length, 10);
  const bw = Math.max(3, Math.min(28, slot - 2));
  const shift = plotW - slot * sessions.length;

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="WPM per exercise">` +
    `<text class="axis axis-name" x="${shift > slot ? padL : padL + plotW / 2}" y="${H - 6}" text-anchor="${shift > slot ? "start" : "middle"}">${t("chart.axisRound")}</text>`;
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, yy = y(v);
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/>`;
    svg += `<text class="axis" x="${padL - 6}" y="${yy + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  sessions.forEach((x, i) => {
    const bx = padL + shift + i * slot + (slot - bw) / 2, top = y(x.wpm), base = y(0);
    const r = Math.min(4, bw / 2, base - top);
    const d = `M${bx},${base} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + bw - r} Q${bx + bw},${top} ${bx + bw},${top + r} V${base} Z`;
    svg += `<path class="bar${i === sessions.length - 1 ? " last" : ""}" data-i="${i}" style="--i:${i}" d="${d}"/>`;
  });
  const opened = sessions.map((x, i) => order && i && x.unlocked > (sessions[i - 1].unlocked || x.unlocked)
    ? order.slice(sessions[i - 1].unlocked, x.unlocked) : []);
  opened.forEach((letters, i) => {
    if (!letters.length) return;
    const cx = padL + shift + (i + 0.5) * slot;
    svg += `<text class="opened" x="${cx}" y="${padT + 9}" text-anchor="middle">${letters.join("")}</text>` +
      `<line class="opened" x1="${cx}" x2="${cx}" y1="${padT + 13}" y2="${y(sessions[i].wpm) - 3}"/>`;
  });
  if (target) svg += `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>`;
  if (withAvg) {
    const pts = sessions.map((_, i) => {
      const part = sessions.slice(Math.max(0, i - 9), i + 1);
      const v = part.reduce((a, x) => a + x.wpm, 0) / part.length;
      return `${(padL + shift + (i + 0.5) * slot).toFixed(1)},${y(v).toFixed(1)}`;
    });
    svg += `<polyline class="avg" points="${pts.join(" ")}"/>`;
  }
  svg += `<text class="axis" x="${padL + shift + slot / 2}" y="${H - 6}" text-anchor="middle">#${first}</text>`;
  if (sessions.length > 1)
    svg += `<text class="axis" x="${padL + shift + (sessions.length - 0.5) * slot}" y="${H - 6}" text-anchor="middle">#${total}</text>`;
  sessions.forEach((_, i) => {
    svg += `<rect class="hit" data-i="${i}" x="${padL + shift + i * slot}" y="${padT}" width="${slot}" height="${plotH}"/>`;
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
function niceMax(v) {
  const steps = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250];
  const step = steps.find((s) => s * 4 >= v * 1.05) ?? Math.ceil(v * 1.05 / 400) * 100;
  return step * 4;
}
