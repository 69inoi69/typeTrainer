// The Learn panel.

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { forecastText, rule } from "./letters.js";
import { learning } from "./modes.js";
import { DAILY, setSetting } from "./settings.js";
import { openPop, ring as ringGroup, ringBtn } from "./minipop.js";
import { FX } from "./fx.js";

const box = $("learn-panel"), cols = $("lp-cols");

const AVG_ROUNDS = 10, AVG_MIN = 3;
const STREAK_LEVELS = [100, 98, 97, 95, 90], STREAK_DOTS = 10;

let activity = null, activityLang = "";
export async function refreshActivity() {
  try {
    activity = (await getJSON(`/activity?tz=${-new Date().getTimezoneOffset()}`)).days;
    activityLang = S.lang;
  } catch (err) { console.error(err); }
  renderPanel();
}

export function compareStats(before, after) {
  const prev = Object.fromEntries((before?.keys ?? []).map((k) => [k.char, k]));
  const best = (before?.sessionCount ?? 0) > 0 &&
    (after.sessions[0]?.wpm ?? 0) > Math.max(0, ...before.sessions.map((x) => x.wpm));
  const mastered = after.keys.filter((k) => k.mastered && !prev[k.char]?.mastered).map((k) => k.char);
  return { best, mastered };
}

// ---------- news of the round ----------
let news = null, bestLang = "";
export function roundNews(r) {
  news = null;
  bestLang = r.best ? S.lang : "";
  const ex = S.exercise, keys = S.lastStats?.keys ?? [];
  if (!ex) return false;
  const flag = store.get(`tt.milestone.${S.lang}`) || "";
  const allOpen = ex.locked.length === 0;
  const waiting = keys.filter((k) => ex.unlocked.includes(k.char) && !k.mastered).map((k) => k.char);
  const s = S.lastStats ?? {};
  if (r.newLap) {
    store.set(`tt.milestone.${S.lang}`, "complete");
    const was = s.lap > 1 ? "news.lap" : "news.lapFirst";
    news = { text: t(was, { n: s.lap + 1, w: r.newLap }), tip: t("news.lapTip", { last: s.lastLap + 1 }), big: true };
  } else if (allOpen && !waiting.length && s.lap >= s.lastLap && flag !== "final") {
    store.set(`tt.milestone.${S.lang}`, "final");
    news = { text: t("news.complete", { w: s.targetWpm }), tip: t("news.completeTip"), big: true };
  } else if (allOpen && !flag) {
    store.set(`tt.milestone.${S.lang}`, "open");
    news = { text: t("news.allOpen"), tip: t("news.allOpenTip", { list: waiting.join(" ") }), big: true };
  } else if (r.newLetter) {
    news = { text: t("news.newLetter", { l: `<b>${r.newLetter}</b>` }), tip: t("news.newLetterTip", { l: r.newLetter }) };
  } else if (r.mastered?.length) {
    news = { text: t("news.mastered", { list: `<b>${r.mastered.join(" ")}</b>` }), tip: masteredTip() };
  } else if (r.best) {
    news = { text: t("news.best", { wpm: Math.round(r.wpm) }) };
  }
  if (news) news.lang = S.lang;
  return !!news?.big;
}
const masteredTip = () => {
  const s = S.lastStats ?? {};
  return t("news.masteredTip", { min: s.masteryMin, err: Math.round(s.masteryErr), target: s.targetWpm });
};

// ---------- drawing ----------
let drawn = "", drawnNews = "";
export function renderPanel() {
  if (!box) return;
  const show = learning() && !!S.lastStats && !!S.exercise;
  box.hidden = cols.hidden = !show;
  if (!show) { drawn = drawnNews = ""; return; }
  if (news && news.lang !== S.lang) news = null;
  const first = !(S.lastStats.sessions ?? []).length && S.exercise.locked.length > 0;
  const html = [...(first ? [intro()] : [lastRound(), forecast(), accStreak()]), dailyGoal()].join("");
  if (html !== drawn) {
    drawn = html;
    redraw(cols, ".lp-val", html);
    document.fonts.ready.then(() => cols.querySelectorAll(".lp-best:not(.foil)").forEach(FX.foil));
  }
  const line = news ? `<p class="lp-news${news.big ? " big" : ""}"${news.tip ? ` tabindex="0" data-tip-text="${news.tip}"` : ""}>${news.text}</p>` : "";
  if (line !== drawnNews) { drawnNews = line; box.innerHTML = line; }
}

function redraw(el, sel, html) {
  const nums = (root) => [...root.querySelectorAll(`${sel} :is(.lp-n, .lp-best)`)];
  const before = nums(el).map((v) => +v.dataset.n);
  const metBefore = [...el.querySelectorAll(".lp-cell")].map((c) => c.classList.contains("met"));
  el.innerHTML = html;
  if (!before.length) return;
  nums(el).forEach((v, i) => {
    const was = before[i], now = +v.dataset.n;
    if (was === undefined || was === now) return;
    v.animate([{ "--v": was }, { "--v": now }], { duration: 700, easing: "cubic-bezier(.2, .7, .3, 1)" });
    v.animate([{ color: gold() }, {}], { duration: 1200, easing: "ease-out" });
  });
  [...el.querySelectorAll(".lp-cell")].forEach((c, i) => {
    if (c.classList.contains("met") && metBefore[i] === false) {
      c.querySelector(".lp-val")?.animate([{ transform: "scale(1.12)" }, { transform: "scale(1)" }],
        { duration: 450, easing: "cubic-bezier(.2, .7, .3, 1)" });
    }
  });
}

const gold = () => getComputedStyle(document.body).getPropertyValue("--accent-text").trim();

const num = (x, unit = "", cls = "") => {
  const n = Math.round(x);
  return `<b class="lp-n${cls ? ` ${cls}` : ""}" data-n="${n}" data-u="${unit}" style="--v:${n}" aria-label="${n}${unit}"></b>`;
};

function lastRound() {
  const list = S.lastStats.sessions ?? [];
  const last = list[0];
  if (!last) return cell("lp-last", t("lp.last"), NONE, t("lp.first"));
  const before = list.slice(1, 1 + AVG_ROUNDS);
  const avg = before.length >= AVG_MIN ? {
    wpm: before.reduce((a, x) => a + x.wpm, 0) / before.length,
    acc: before.reduce((a, x) => a + x.accuracy, 0) / before.length,
  } : null;
  const delta = (now, was, up, down) => {
    const d = Math.round(now) - Math.round(was);
    return d ? t(d > 0 ? up : down, { d: Math.abs(d), n: before.length, avg: Math.round(was) }) : "";
  };
  const tip = avg ? [delta(last.wpm, avg.wpm, "lp.faster", "lp.slower"), delta(last.accuracy, avg.acc, "lp.accUp", "lp.accDown")]
    .filter(Boolean).join(". ") : "";
  return cell("lp-last", t("lp.last"),
    `${bestLang === S.lang ? `<b class="lp-best" data-n="${Math.round(last.wpm)}">${Math.round(last.wpm)}</b>` : num(last.wpm)}<small>wpm</small>${spark(list.slice(0, AVG_ROUNDS).map((x) => x.wpm).reverse(), avg?.wpm, tip)}` +
    `${num(last.accuracy, "%", "lp-gap")}<small>${t("metric.acc")}</small>`);
}

const SPARK_W = 64, SPARK_H = 18;
function spark(wpms, avg, tip) {
  if (wpms.length < 2) return "";
  const all = avg === undefined ? wpms : [...wpms, avg];
  const lo = Math.min(...all), span = Math.max(...all) - lo || 1;
  const x = (i) => (i * SPARK_W / (wpms.length - 1)).toFixed(1);
  const y = (v) => (SPARK_H - 2 - (v - lo) / span * (SPARK_H - 4)).toFixed(1);
  const end = wpms.length - 1;
  return `<svg class="lp-spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}"${tip ? ` tabindex="0" data-tip-text="${tip}"` : ` aria-hidden="true"`}>` +
    (avg === undefined ? "" : `<line class="avg" x1="0" x2="${SPARK_W}" y1="${y(avg)}" y2="${y(avg)}"/>`) +
    `<polyline points="${wpms.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/><circle cx="${x(end)}" cy="${y(wpms[end])}" r="3"/></svg>`;
}

function intro() {
  const r = rule();
  return cell("lp-intro", t("lp.introLbl", { l: `<b class="lp-key">${S.exercise.locked[0]}</b>` }),
    t("lp.intro", { min: r.min, err: Math.round(r.err * 100), wpm: S.lastStats.targetWpm || 30 }));
}

function forecast() {
  const s = S.lastStats;
  const f = forecastText(s.forecast, S.exercise.locked.length === 0);
  const label = s.lap ? `${t("lp.lap")} ${t("lp.lapOf", { n: s.lap + 1, all: s.lastLap + 1 })}` : t("fc.next");
  const tip = [s.lap ? t("lp.lapTip", { w: s.targetWpm }) : "", f ? f.tip : t("fc.none")].filter(Boolean).join(". ");
  const next = s.lap ? "" : S.exercise.locked[0];
  return cell("lp-fc", label, (next ? `<b class="lp-key">${next}</b>` : "") + (f ? `<b>${f.value}</b>` : NONE), tip);
}

function accStreak() {
  const list = S.lastStats.sessions ?? [];
  for (const level of STREAK_LEVELS) {
    let n = 0;
    while (n < list.length && list[n].accuracy >= level) n++;
    if (n >= 2) {
      const dots = Array.from({ length: STREAK_DOTS }, (_, i) => `<i${i < n ? ` class="on"` : ""}></i>`).join("");
      return cell("lp-streak", t("lp.streakLbl"), `<span class="lp-dots" aria-hidden="true">${dots}</span>${num(n)}`,
        `${t("lp.streak", { n, a: level })}. ${t("lp.streakTip")}`);
    }
  }
  return cell("lp-streak", t("lp.streakLbl"), NONE, t("lp.streakTip"));
}

let goalNow = null;
let goalTyping = false;
function dailyGoal() {
  goalNow = null;
  goalTyping = document.body.classList.contains("typing-now");
  const goal = S.settings.daily;
  if (!goal) return cell("lp-goal", t("lp.today"), `<b class="lp-none">${t("settings.off")}</b>`, t("lp.goalOffTip"));
  if (activityLang !== S.lang || !activity) return cell("lp-goal", t("lp.today"), NONE, t("lp.goalTip", { g: goal }));
  const byDate = Object.fromEntries(activity.map((d) => [d.date, d.seconds]));
  const day = (back) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const typing = document.body.classList.contains("typing-now");
  const need = goal * 60, base = byDate[day(0)] ?? 0, today = base + (typing ? S.roundSeconds : 0);
  const met = today >= need;
  let streak = 0;
  for (let back = met ? 0 : 1; (byDate[day(back)] ?? 0) >= need; back++) streak++;
  if (typing && !met) goalNow = { base, need };
  const label = streak >= 2 ? t("lp.todayDays", { n: streak }) : t("lp.today");
  const value = ring(today / need) +
    `<b>${Math.floor(today / 60)}</b><small>${met ? t("lp.goalMet") : t("lp.goalOf", { g: goal })}</small>`;
  return cell(`lp-goal${met ? " met" : ""}`, label, value, t("lp.goalTip", { g: goal }));
}
const ring = (share) =>
  `<svg class="lp-ring" viewBox="0 0 20 20" aria-hidden="true" style="--g:${Math.min(1, share).toFixed(3)}">` +
  `<circle cx="10" cy="10" r="8"/><circle class="fill" cx="10" cy="10" r="8" pathLength="100"/></svg>`;
export function tickGoal() {
  if (!box || box.hidden) return false;
  if (!goalTyping) renderPanel();
  if (!goalNow) return false;
  const today = goalNow.base + S.roundSeconds;
  if (today >= goalNow.need) { renderPanel(); return true; }
  return false;
}

// ---------- picking the daily goal ----------
const goalRow = () => `<div class="mp-row"><span class="mp-name" data-tip-text="${t("settings.dailyDesc")}">${t("settings.daily")}</span>` +
  ringGroup(t("settings.daily"), DAILY.map((m) => ringBtn(`data-key="daily" data-value="${m}"`, m ? String(m) : t("settings.off"), S.settings.daily === m))) + `</div>`;
const pickGoal = (cell) => openPop(cell, t("settings.daily"), goalRow, setSetting);
cols?.addEventListener("click", (e) => {
  const c = e.target.closest(".lp-goal");
  if (c) pickGoal(c);
});
cols?.addEventListener("keydown", (e) => {
  const c = e.target.closest(".lp-goal");
  if (!c || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  e.stopPropagation();
  pickGoal(c);
});

const NONE = `<b class="lp-none">—</b>`;
const cell = (cls, label, value, tip = "") =>
  `<span class="lp-cell ${cls}"${tip ? ` tabindex="0" data-tip-text="${tip}"` : ""}>` +
  `<span class="lp-lbl">${label}</span><span class="lp-val">${value}</span></span>`;
