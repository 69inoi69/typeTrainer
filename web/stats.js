// The stats screen: number tiles, the WPM chart, the difficulty heatmap
// keyboard and the letter cards. refreshStats() also keeps S.lastStats fresh
// for the typing screen.
// Layer: middle. Imports the bottom layer and tools.js (tooltips).

import { i18nVars, t, applyI18n } from "./i18n.js";
import { el, S } from "./state.js";
import { getJSON } from "./api.js";
import { showTip } from "./tools.js";

export async function refreshStats() {
  S.lastStats = await getJSON("/stats");
  i18nVars.target = S.lastStats.targetWpm;
  applyI18n(el.intro);
  if (S.view === "stats") renderStats();
}

// Free practice shows its own history (S.free, modes.js): the tiles and the
// chart, no letters (style.css hides their panels, body[data-mode="free"]).
export function renderStats() {
  const free = S.mode === "free";
  const s = free ? S.free : S.lastStats;
  if (!s) return;
  const sessions = [...s.sessions].reverse(); // oldest first
  const last10 = sessions.slice(-10);
  const avg = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : null;
  const measured = last10.filter((x) => x.consistency != null);   // short rounds and old history have none
  const fmt = (v, suffix = "") => v === null ? "—" : Math.round(v) + suffix;
  const best = sessions.length ? Math.max(...sessions.map((x) => x.wpm)) : null;
  el.tiles.innerHTML = [
    [s.sessionCount, t("tile.exercises")],
    [fmt(best), t("tile.best")],
    [fmt(avg(last10, (x) => x.wpm)), t("tile.avgWpm")],
    [fmt(avg(last10, (x) => x.accuracy), "%"), t("tile.avgAcc")],
    [fmt(avg(measured, (x) => x.consistency), "%"), t("tile.avgCons")],
  ].map(([v, l]) => `<div class="tile"><b>${v}</b><small>${l}</small></div>`).join("");

  drawChart(sessions, free ? s.testWpm : s.targetWpm, s.sessionCount);
  if (free) return;
  drawHeatKeyboard(s.keys);
  drawLetterGrid(s.keys);
}

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
      if (letters.length) key.dataset.tipText = letters.map(heatLine).join("   |   ");
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
      const cons = x.consistency != null ? ` <span>·</span> ${t("chart.cons", { pct: Math.round(x.consistency) })}` : "";
      el.tooltip.innerHTML = `<span>#${first + i}</span> ${Math.round(x.wpm)} wpm <span>·</span> ${Math.round(x.accuracy)}%${cons}`;
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
