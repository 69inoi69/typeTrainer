// The result screen.

import { t } from "./i18n.js";
import { $, el, isTouch, reducedMotion, boxState } from "./state.js";
import { FEEL } from "./feel.js";
import { FX } from "./fx.js";
import { showTip } from "./tools.js";

const box = $("result");

const num = (value, unit, size) => `<span class="r-num ${size}"><b>${value}<small>${unit}</small></b></span>`;
const fact = (text, cls = "", tip = "") =>
  `<span class="r-fact${cls}"${tip ? ` tabindex="0" data-tip-text="${t(tip)}"` : ""}>${text}</span>`;
let done = null;

export const resultOpen = () => done !== null;

export function showResult(r) {

  const hero = `<div class="r-hero${r.best ? " best" : ""}">${num(Math.round(r.wpm), t("result.wpm"), "big hero")}` +
    `${num(Math.round(r.accuracy), t("result.acc"), "big")}</div>`;
  let graph = "", list = "";
  if (r.words?.length) {
    const bands = speedBands(r.words.map((w) => w.wpm).filter((v) => v != null));
    const word = (w) => {
      const sp = w.wpm != null ? ` s${bands.level(w.wpm)}" tabindex="0" data-tip-text="${t("result.wordWpm", { wpm: w.wpm })}` : "";
      return `<span class="r-w${sp}">` + w.letters.map((x) => x.bad ? `<i>${x.c}</i>` : x.c).join("") + `</span>`;
    };
    const legend = bands.labels.length
      ? `<span class="r-legend" aria-hidden="true">${bands.labels.map((l, i) => `<span class="s${i + 1}">${l}</span>`).join("")}</span>` : "";
    graph = `<div class="r-graph">${legend}${speedChart(r.words, bands)}</div>`;
    list = `<p class="r-wordlist">${r.words.map(word).join(" ")}</p>`;
  }

  const facts = [];
  if (r.consistency != null) facts.push(fact(`<b>${Math.round(r.consistency)}%</b> ${t("result.cons")}`, "", "result.consTip"));
  if (r.seconds != null) facts.push(fact(`<b>${Math.round(r.seconds)}</b>${t("result.sec")}`));
  if (r.chars) {
    const c = r.chars;
    facts.push(fact(`<b>${c.correct}</b> ${t("result.correct")}`));
    if (c.wrong) facts.push(fact(`<b>${c.wrong}</b> ${t("result.wrong")}`, " bad"));
    if (c.extra) facts.push(fact(`<b>${c.extra}</b> ${t("result.extra")}`, " bad", "result.extraTip"));
    if (c.missed) facts.push(fact(`<b>${c.missed}</b> ${t("result.missed")}`, " bad", "result.missedTip"));
  }
  let note = "";
  if (r.climb?.weak?.length) facts.push(fact(`${t("climb.weak")} <b>${r.climb.weak.map((w) => w.pair).join(" ")}</b>`, "", "climb.weakTip"));

  if (r.unsaved) note = `<p class="r-unsaved" role="status"><span>${r.unsaved.text}</span>` +
    (r.unsaved.retry ? ` <button type="button" class="btn r-again">${t("save.again")}</button>` : "") + `</p>`;

  const body = `<div class="r-top${graph ? "" : " solo"}">${hero}${graph}</div>` + list +
    (facts.length ? `<p class="r-facts">${facts.join("")}</p>` : "") + note;
  const shown = open(body, "result.nextBtn");
  if (r.unsaved?.retry) saveAgain(r);
  if (r.best) newBest();
  return shown;
}

function saveAgain(r) {
  const line = box.querySelector(".r-unsaved"), btn = line.querySelector(".r-again");
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    el.input.focus({ preventScroll: true });
    btn.disabled = true;
    try {
      await r.unsaved.retry();
      line.className = "r-saved";
      line.textContent = t("save.done");
    } catch (err) {
      line.firstChild.textContent = err.message;
      btn.disabled = false;
      if (!err.retryable) btn.remove();
    }
  });
}

const SPEED_BANDS = 5;
const MIN_SPREAD = 5;
function speedBands(speeds) {
  const lo = Math.min(...speeds), hi = Math.max(...speeds);
  if (!speeds.length || hi - lo < MIN_SPREAD) {
    return { level: () => Math.ceil(SPEED_BANDS / 2), labels: [] };
  }
  const step = (hi - lo) / SPEED_BANDS;
  const edges = Array.from({ length: SPEED_BANDS - 1 }, (_, i) => Math.round(lo + step * (i + 1)));
  const level = (v) => 1 + edges.filter((e) => v >= e).length;
  const labels = [`<${edges[0]}`];
  for (let i = 1; i < edges.length; i++) labels.push(`${edges[i - 1]}-${edges[i] - 1}`);
  labels.push(`${edges[edges.length - 1]}+`);
  return { level, labels };
}

function speedChart(words, bands) {
  const pts = words.filter((w) => w.wpm != null);
  if (pts.length < 2) return "";
  const top = Math.max(20, Math.ceil(Math.max(...pts.map((w) => w.wpm)) / 20) * 20);
  const x = (i) => (i / (pts.length - 1)) * 100;
  const y = (v) => 100 - (v / top) * 100;
  const line = pts.map((w, i) => `${x(i).toFixed(2)},${y(w.wpm).toFixed(2)}`).join(" ");
  const dots = pts.map((w, i) => {
    const pos = `left:${x(i).toFixed(2)}%;top:${y(w.wpm).toFixed(2)}%`;
    const bad = w.letters.some((l) => l.bad) ? `<i class="r-err" style="${pos}"></i>` : "";
    return `<i class="r-dot s${bands.level(w.wpm)}" style="${pos}" data-tip-text="${t("result.wordWpm", { wpm: w.wpm })}"></i>` + bad;
  }).join("");
  return `<div class="r-chart" role="img" aria-label="${t("result.chartLabel")}">` +
    `<span class="r-axis" aria-hidden="true"><span>${top}</span><span>${top / 2}</span><span>0</span></span>` +
    `<div class="r-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">` +
    `<path class="r-grid" d="M0 0H100M0 50H100"/><path class="r-axisline" d="M0 0V100H100"/>` +
    `<polyline class="r-line" points="${line}"/></svg>${dots}` +
    `<span class="r-xaxis" aria-hidden="true"><span>1</span><span class="r-axis-name">${t("result.axisWord")}</span><span>${pts.length}</span></span></div></div>`;
}

const ICON_NEXT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>`;

// ---------- a new best: the speed and a badge above it as trading-card foil ----------
function newBest() {
  const hero = box.querySelector(".r-hero .r-num.hero");
  hero.insertAdjacentHTML("afterbegin", `<span class="r-best"><span>${t("result.newBest")}</span></span>`);
  const nodes = [hero.querySelector(":scope > b"), hero.querySelector(".r-best > span")];
  document.fonts.ready.then(() => nodes.forEach(FX.foil));
}
function open(body, btn) {
  box.innerHTML = `<div class="r-body">${body}</div>` +
    `<p class="r-foot"><button type="button" class="r-next" data-tip="${btn}" aria-label="${t(btn)}">${ICON_NEXT}</button></p>`;
  box.querySelector(".r-body").addEventListener("click", (e) => {
    e.stopPropagation();
    const w = e.target.closest("[data-tip-text]");
    if (w) showTip(w);
  });
  box.querySelector(".r-next").addEventListener("click", (e) => {
    e.stopPropagation();
    el.input.focus({ preventScroll: true });
    el.textBox.classList.remove("blurred");
    closeResult();
  });
  const from = lettersTop();
  box.hidden = false;
  el.viewType.classList.remove("settled");
  boxState(true, "resulting");
  boxState(false, "ending");
  glideLetters(from);
  if (isTouch()) el.input.blur();
  return new Promise((resolve) => { done = resolve; });
}

export function settleResult() {
  if (done) el.viewType.classList.add("settled");
}

export function closeResult() {
  if (!done) return;
  const resolve = done;
  done = null;
  const from = lettersTop();
  box.hidden = true;
  el.viewType.classList.remove("settled");
  boxState(false, "resulting");
  glideLetters(from);
  resolve();
}

const lettersRow = document.querySelector("#view-type > .letters");
const lettersTop = () => lettersRow?.getBoundingClientRect().top ?? 0;
function glideLetters(from) {
  if (!lettersRow || !lettersRow.animate || reducedMotion() || el.viewType.hidden) return;
  const dy = from - lettersTop();
  if (Math.abs(dy) < 1) return;
  lettersRow.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }],
    { duration: FEEL.resultInMs, easing: "cubic-bezier(.2, .8, .2, 1)" });
}
