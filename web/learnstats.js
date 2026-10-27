// Learn's part of the stats screen.

import { t } from "./i18n.js";
import { $, S } from "./state.js";
import { getJSON } from "./api.js";
import { letterProgress, letterNeeds, forecastText } from "./letters.js";

const CELL_MIN = 6, CELL_MAX = 16, GAP = 2;
const box = $("learn-stats");
let data = null, stale = true, letter = null;

export function learnStatsStale() { stale = true; }

export async function renderLearnStats(show) {
  box.hidden = !show;
  if (!show) return;
  if (stale) {
    stale = false;
    try { data = await getJSON("/learn/history"); } catch (err) { console.error(err); stale = true; return; }
  }
  draw();
}

function draw() {
  const rounds = data?.rounds ?? [];
  if (!rounds.length) {
    box.innerHTML = `<div class="panel ls-panel"><p class="ls-empty">${t("ls.empty")}</p></div>`;
    return;
  }
  const order = data.order, open = rounds.at(-1).unlocked;
  if (!letter || order.indexOf(letter) >= open) letter = weakest(rounds.at(-1), order);
  box.innerHTML = gridPanel(rounds, order, open) + letterPanel(rounds, order) + confusionPanel(data.confusions ?? []);
}

function weakest(last, order) {
  let best = order[0], low = 2;
  last.letters.forEach((k, i) => {
    if (!k) return;
    const p = k.mastered ? 1 : letterProgress(k);
    if (p < low) { low = p; best = order[i]; }
  });
  return best;
}

// ---------- every letter, round by round ----------
function gridPanel(rounds, order, open) {
  const width = box.clientWidth - 36 - 28;
  const cell = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor((width + GAP) / rounds.length) - GAP));
  const fit = Math.max(10, Math.floor((width + GAP) / (cell + GAP)));
  const shown = rounds.slice(-fit), first = rounds.length - shown.length + 1;
  const rows = order.slice(0, open).map((c, i) => {
    const cells = shown.map((r, j) => {
      const k = r.letters[i];
      if (!k) return `<i class="off"></i>`;
      const p = k.mastered ? 1 : letterProgress(k);
      const tip = t("ls.cellTip", { n: first + j, l: c, p: Math.round(p * 100) }) +
        (k.mastered ? " · " + t("ls.mastered") : "");
      return `<i class="${k.mastered ? "done" : k.count ? "" : "fresh"}" style="--p:${p.toFixed(2)}" data-tip-text="${tip}"></i>`;
    }).join("");
    return `<button type="button" class="ls-l${c === letter ? " on" : ""}" data-letter="${c}" aria-pressed="${c === letter}">${c}</button><div class="ls-row">${cells}</div>`;
  }).join("");
  const scope = shown.length === rounds.length ? t("chart.all") : t("chart.last", { n: shown.length });
  return `<div class="panel ls-panel"><div class="panel-head"><h2>${t("ls.grid")}</h2><span class="panel-note">${t("ls.gridNote", { scope })}</span></div>` +
    `<div class="ls-grid" style="--cell:${cell}px;--gap:${GAP}px">${rows}</div>${forecastLine(order, open)}</div>`;
}
function forecastLine(order, open) {
  const s = S.lastStats ?? {};
  const f = forecastText(s.forecast, open >= order.length);
  const lap = s.lap ? t("ls.lap", { n: s.lap + 1, all: s.lastLap + 1, w: s.targetWpm }) : "";
  if (!f && !lap) return "";
  const fc = f ? `<span tabindex="0" data-tip-text="${f.tip}">${f.label}: <b>${f.value}</b></span>` : "";
  return `<p class="ls-needs ls-fc">${[lap, fc].filter(Boolean).join(" · ")}</p>`;
}

// ---------- one letter ----------
function letterPanel(rounds, order) {
  const i = order.indexOf(letter), target = S.lastStats?.targetWpm || 30;
  const pts = [];
  rounds.forEach((r, n) => {
    const k = r.letters[i];
    if (k?.avgMs) pts.push({ n: n + 1, wpm: 12000 / k.avgMs });
  });
  const k = rounds.at(-1).letters[i];
  const stat = (value, label) => `<div class="act-stat"><b>${value}</b><small>${label}</small></div>`;
  const facts = !k?.count ? `<p class="ls-needs">${t("ls.noData")}</p>` :
    `<div class="act-stats ls-facts">` +
    stat(Math.round(k.avgMs ? 12000 / k.avgMs : 0), t("ls.now")) +
    stat(Math.round(Math.max(0, ...pts.map((x) => x.wpm))), t("ls.best")) +
    stat(Math.round(k.errorRate * 100) + "%", t("ls.err")) +
    stat(k.count, t("ls.presses")) + `</div>` +
    `<p class="ls-needs">${k.mastered ? t("ls.masteredLong") : t("ls.needs", { list: letterNeeds(k).map((n) => t(n)).join(t("ls.and")) })}</p>`;
  return `<div class="panel ls-panel"><div class="panel-head"><h2>${t("ls.letter", { l: `<b class="ls-key">${letter}</b>` })}</h2><span class="panel-note">${t("ls.letterNote", { target })}</span></div>` +
    facts + letterChart(pts, target) + `</div>`;
}
function letterChart(pts, target) {
  if (pts.length < 2) return `<p class="ls-empty">${t("ls.fewRounds")}</p>`;
  const W = Math.max(280, box.clientWidth - 36), H = 180, padL = 34, padR = 8, padT = 10, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const step = Math.ceil(Math.max(target * 1.25, ...pts.map((p) => p.wpm)) / 4 / 5) * 5;
  const max = step * 4;
  const x0 = pts[0].n, span = Math.max(1, pts.at(-1).n - x0);
  const x = (n) => padL + ((n - x0) / span) * plotW, y = (v) => padT + plotH - (v / max) * plotH;
  let svg = `<svg class="ls-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("ls.letter", { l: letter })}">`;
  for (let g = 0; g <= 4; g++) {
    const v = (max / 4) * g;
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  svg += `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>`;
  svg += `<polyline class="ls-line" points="${pts.map((p) => `${x(p.n).toFixed(1)},${y(p.wpm).toFixed(1)}`).join(" ")}"/>`;
  svg += `<text class="axis" x="${padL}" y="${H - 6}">#${x0}</text><text class="axis" x="${W - padR}" y="${H - 6}" text-anchor="end">#${pts.at(-1).n}</text></svg>`;
  return `<div class="ls-chart-box">${svg}</div>`;
}

// ---------- the keys you mix up ----------
function confusionPanel(list) {
  const body = !list.length ? `<p class="ls-empty">${t("ls.noMix")}</p>` :
    `<ul class="ls-mix">${list.map((c) => `<li><b>${c.want === " " ? "␣" : c.want}</b><span>${t("ls.instead")}</span><b class="bad">${c.typed === " " ? "␣" : c.typed}</b><small>${t("ls.times", { n: c.n })}</small></li>`).join("")}</ul>`;
  return `<div class="panel ls-panel"><div class="panel-head"><h2>${t("ls.mix")}</h2><span class="panel-note">${t("ls.mixNote")}</span></div>${body}</div>`;
}

box.addEventListener("click", (e) => {
  const b = e.target.closest("[data-letter]");
  if (!b || b.dataset.letter === letter) return;
  letter = b.dataset.letter;
  draw();
});
