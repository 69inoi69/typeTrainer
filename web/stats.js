// The stats screen, built to fit on one screen: number tiles, the WPM
// chart, the difficulty heatmap keyboard and the letter chips. The exact
// numbers live in tooltips (hover, or keyboard focus), so the screen stays
// calm and answers "how am I doing?" at a glance. refreshStats() also keeps
// S.lastStats fresh for the typing screen. Rounds of different lengths are never mixed: the
// screen shows one length at a time (the one chosen in the settings, or
// another one picked in the row of lengths above the tiles).
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
export async function refreshStats() {
  S.lastStats = await getJSON(`/stats?length=${S.settings.length}`);
  other = null;                                     // back to the chosen length
  if (S.lastStats.lengths.length) firstRoundDone(); // finished rounds before: the live numbers are earned
  i18nVars.target = S.lastStats.targetWpm;
  i18nVars.min = S.lastStats.masteryMin;       // the mastery rule, for its explanations
  i18nVars.err = Math.round(S.lastStats.masteryErr);
  applyI18n(el.intro);
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
  renderLengthFilter(s.lengths ?? [], length);
  const sessions = [...s.sessions].reverse(); // oldest first
  // nothing to share before the first round of this length
  document.getElementById("btn-copy").disabled = document.getElementById("btn-image").disabled = !s.sessionCount;
  el.tiles.innerHTML = summary(s).map(([v, l]) => `<div class="tile"><b>${v}</b><small>${t(l)}</small></div>`).join("");

  drawChart(sessions, free ? s.testWpm : s.targetWpm, s.sessionCount);
  if (free) return;
  drawHeatKeyboard(s.keys);
  drawLetterGrid(s.keys);
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
// A button for every round length, always, in the settings' order (owner,
// 2026-10-16: the row must not change with the history or the settings),
// plus any older length found in the history that the settings no longer
// offer. A length with no rounds yet shows the empty stats.
function renderLengthFilter(have, shown) {
  const ids = [...LENGTHS, ...new Set(have.filter((id) => !LENGTHS.includes(id)))];
  el.lengthFilter.innerHTML = ids.map((id) =>
    `<button type="button" role="tab" data-length="${id}" aria-selected="${id === shown}">${lengthLabel(id)}</button>`).join("");
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

// Difficulty heatmap: the keyboard of the language, but grey, and every key
// as red as the difficulty the algorithm gives its letter (0 = no red,
// 1 = full red). Dashed = no data yet. Hover (or tap) a key for the numbers.
// It lives only on the stats screen, so it never distracts while typing.
function drawHeatKeyboard(keys) {
  if (!S.layout) return;
  const byChar = new Map(keys.map((k) => [k.char, k]));
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
        key.style.setProperty("--heat", Math.max(...seen.map((s) => s.difficulty)).toFixed(3));
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
  el.chartNote.textContent = t("chart.note", { scope, target });

  // draw at the real pixel size of the box (style.css sizes it to fit the
  // screen), so text stays 11px on a phone too
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
    svg += `<path class="bar${i === sessions.length - 1 ? " last" : ""}" data-i="${i}" d="${d}"/>`;
  });
  svg += `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>`;
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
// thin bar as long and as red as its difficulty (green dot = mastered).
// The numbers are in the tooltip, the same line as on the heatmap keyboard.
function drawLetterGrid(keys) {
  // open letters first (weakest first, as the server sorts them), locked ones last
  keys = [...keys.filter((k) => k.unlocked), ...keys.filter((k) => !k.unlocked)];
  el.letterGrid.innerHTML = keys.map((k) => {
    const cls = "lchip" + (k.unlocked ? "" : " locked") + (k.mastered ? " mastered" : "") + (k.count ? "" : " nodata");
    const d = k.count ? k.difficulty.toFixed(3) : 0;
    return `<div class="${cls}" tabindex="0" style="--d:${d}" data-tip-text="${heatLine(k)}">` +
      `<span class="ch">${k.char}</span><i class="meter"></i></div>`;
  }).join("");
}
// phones have no hover: a tap on a chip shows its numbers
el.letterGrid.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-tip-text]");
  if (chip) showTip(chip);
});
