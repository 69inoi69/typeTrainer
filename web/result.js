// The result screen.

import { t, variantLabel } from "./i18n.js";
import { $, el, S, isTouch, reducedMotion, levelWords, listLabel, boxState } from "./state.js";
import { FEEL } from "./feel.js";
import { showTip } from "./tools.js";

const box = $("result");

const num = (value, unit, label, size, tip) =>
  `<span class="r-num ${size}"${tip ? ` tabindex="0" data-tip-text="${t(tip)}"` : ""}><span class="r-lbl">${t(label)}</span><b>${value}<small>${unit}</small></b></span>`;
let done = null;

export const resultOpen = () => done !== null;

export function showResult(r) {

  const hero = `<div class="r-hero">${num(Math.round(r.wpm), "", "result.wpm", "big hero")}` +
    `${num(Math.round(r.accuracy), "%", "result.acc", "big")}</div>`;
  let graph = "", list = "";
  if (r.words?.length) {
    const bands = speedBands(r.words.map((w) => w.wpm).filter((v) => v != null));
    const word = (w) => {
      const sp = w.wpm != null ? ` s${bands.level(w.wpm)}" tabindex="0" data-tip-text="${t("result.wordWpm", { wpm: w.wpm })}` : "";
      return `<span class="r-w${sp}">` + w.letters.map((x) => x.bad ? `<i>${x.c}</i>` : x.c).join("") + `</span>`;
    };
    const legend = bands.labels.length
      ? `<span class="r-legend" aria-hidden="true">${bands.labels.map((l, i) => `<span class="s${i + 1}">${l}</span>`).join("")}</span>` : "";
    graph = `<div class="r-graph"><p class="r-words-head"><span class="lbl-ui">${t("result.words")}</span>${legend}</p>${speedChart(r.words, bands)}</div>`;
    list = `<p class="r-wordlist">${r.words.map(word).join(" ")}</p>`;
  }

  const row = [];
  if (r.consistency != null) row.push(num(Math.round(r.consistency), "%", "result.cons", "mid", "result.consTip"));
  if (r.seconds != null) row.push(num(Math.round(r.seconds), "s", "result.time", "mid"));
  if (r.chars) {
    const c = r.chars;
    const part = (n, key, cls, tip) =>
      `<span class="r-cc${cls}"${tip ? ` tabindex="0" data-tip-text="${t(tip)}"` : ""}><b>${n}</b> ${t(key)}</span>`;
    row.push(`<span class="r-num mid"><span class="r-lbl">${t("result.chars")}</span><span class="r-chars">` +
      `${part(c.correct, "result.correct", "")}${part(c.wrong, "result.wrong", c.wrong ? " bad" : "")}` +
      `${part(c.extra, "result.extra", c.extra ? " bad" : "", "result.extraTip")}${part(c.missed, "result.missed", "", "result.missedTip")}</span></span>`);
  }
  let note = "";
  if (r.climb && !r.climb.place) {
    row.push(`<span class="r-num mid" tabindex="0" data-tip-text="${t("tip.level")}"><span class="r-lbl">${t("climb.level")}</span><b>${r.climb.level}</b></span>`);
  } else if (r.climb) {
    const p = r.climb.place, c = S.climb;
    const move = p.moved ? ` <span class="trend ${p.moved > 0 ? "up" : "down"}">${p.moved > 0 ? "↑" : "↓"}</span>` : "";
    const pips = p.moved || !c ? "" : `<span class="pips">${Array.from({ length: c.passesUp }, (_, i) => `<i${i < p.passes ? ' class="on"' : ""}></i>`).join("")}</span>`;
    row.push(`<span class="r-num mid" tabindex="0" data-tip-text="${t("tip.level")}"><span class="r-lbl">${t("climb.level")}</span><b>${p.level}${move}${pips}</b></span>`);
    if (r.climb.weak?.length) row.push(num(r.climb.weak.map((w) => w.pair).join(" "), "", "climb.weak", "mid", "climb.weakTip"));
    if (c) note = `<p class="r-climb ${r.climb.verdict}">${climbNote(r.climb, c)}</p>`;
  }
  if (r.list) row.push(num(listLabel(r.list), "", "freetype.list", "mid", "freetype.listTip"));
  if (r.variant) row.push(num(variantLabel(r.variant), "", "ft.text", "mid", "ft.textTip"));

  if (r.unsaved) note = `<p class="r-unsaved" role="status"><span>${r.unsaved.text}</span>` +
    (r.unsaved.retry ? ` <button type="button" class="btn r-again">${t("save.again")}</button>` : "") + `</p>`;

  const body = `<div class="r-top${graph ? "" : " solo"}">${hero}${graph}</div>` +
    (row.length ? `<div class="r-row">${row.join("")}</div>` : "") + note + list;
  const shown = open(body, "result.nextBtn");
  if (r.unsaved?.retry) saveAgain(r);
  return shown;
}

function saveAgain(r) {
  const line = box.querySelector(".r-unsaved"), btn = line.querySelector(".r-again");
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    el.input.focus({ preventScroll: true });
    btn.disabled = true;
    try {
      const climb = await r.unsaved.retry();
      line.className = "r-climb";
      line.textContent = t("save.done");
      if (r.climb && S.climb) {
        const cl = { ...r.climb, ...climb };
        line.className = `r-climb ${cl.verdict}`;
        line.innerHTML = climbNote(cl, S.climb);
      }
    } catch (err) {
      line.firstChild.textContent = err.message;
      btn.disabled = false;
      if (!err.retryable) btn.remove();
    }
  });
}

function climbNote(cl, c) {
  const p = cl.place, top = c.levels.length;
  const v = { level: p.level, words: levelWords(p.level), up: c.passesUp, pass: c.passAccuracy, fail: c.failAccuracy,
    next: cl.level + 1, prev: cl.level - 1, k: p.passes, left: c.passesUp - p.passes };
  if (p.moved > 0) return t("climb.up", v);
  if (p.moved < 0) return t("climb.down", v);
  if (cl.verdict === "pass") return t(cl.level < top ? "climb.pass" : "climb.passTop", v);
  if (cl.verdict === "hold") return t("climb.hold", v);
  return t(cl.level > 1 && p.fails > 0 ? "climb.fail" : "climb.failCount", v);
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
    const text = w.letters.map((l) => l.c).join("");
    const pos = `left:${x(i).toFixed(2)}%;top:${y(w.wpm).toFixed(2)}%`;
    const bad = w.letters.some((l) => l.bad) ? `<i class="r-err" style="${pos}"></i>` : "";
    return `<i class="r-dot s${bands.level(w.wpm)}" style="${pos}" data-tip-text="${t("result.chartTip", { word: text, wpm: w.wpm })}"></i>` + bad;
  }).join("");
  return `<div class="r-chart" role="img" aria-label="${t("result.chartLabel")}">` +
    `<span class="r-axis" aria-hidden="true"><span>${top}</span><span>${top / 2}</span><span>0</span></span>` +
    `<div class="r-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">` +
    `<path class="r-grid" d="M0 0H100M0 50H100"/><path class="r-axisline" d="M0 0V100H100"/>` +
    `<polyline class="r-line" points="${line}"/></svg>${dots}` +
    `<span class="r-xaxis" aria-hidden="true"><span>1</span><span>${pts.length}</span></span></div></div>`;
}

const ICON_NEXT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;

function open(body, btn) {
  box.innerHTML = `<div class="r-body">${body}</div>` +
    `<p class="r-foot"><button type="button" class="btn r-next">${ICON_NEXT}<span>${t(btn)}</span>${isTouch() ? "" : "<kbd>enter</kbd> / <kbd>tab</kbd>"}</button></p>`;
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
