// The Learn panel.

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { rule } from "./letters.js";
import { learning } from "./modes.js";
import { DAILY, setSetting } from "./settings.js";
import { openPop, ring as ringGroup, ringBtn } from "./minipop.js";
import { FX } from "./fx.js";

const box = $("learn-panel"), newsBox = $("lp-news"), cols = $("lp-cols");

const AVG_ROUNDS = 10, AVG_MIN = 3;

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
  box.hidden = !show;
  if (!show) { drawn = drawnNews = ""; return; }
  if (news && news.lang !== S.lang) news = null;
  const first = !(S.lastStats.sessions ?? []).length && S.exercise.locked.length > 0;
  const html = first ? "" : lastRound() + dailyGoal();
  if (html !== drawn) {
    drawn = html;
    redraw(cols, html);
    document.fonts.ready.then(() => cols.querySelectorAll(".lp-best:not(.foil)").forEach(FX.foil));
  }
  const line = first ? intro() : news ? `<p class="lp-news${news.big ? " big" : ""}"${news.tip ? ` tabindex="0" data-tip-text="${news.tip}"` : ""}>${news.text}</p>` : "";
  if (line !== drawnNews) { drawnNews = line; newsBox.innerHTML = line; }
}

function redraw(el, html) {
  const nums = (root) => [...root.querySelectorAll(".lp-cell :is(.lp-n, .lp-best)")];
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
      c.querySelector(".lp-ring")?.animate([{ transform: "scale(1.12)" }, { transform: "scale(1)" }],
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
  if (!last) return "";
  const before = list.slice(1, 1 + AVG_ROUNDS);
  const avg = before.length >= AVG_MIN ? {
    wpm: before.reduce((a, x) => a + x.wpm, 0) / before.length,
    acc: before.reduce((a, x) => a + x.accuracy, 0) / before.length,
  } : null;
  const delta = (now, was, up, down) => {
    const d = Math.round(now) - Math.round(was);
    return d ? t(d > 0 ? up : down, { d: Math.abs(d), n: before.length, avg: Math.round(was) }) : "";
  };
  const tip = [t("lp.lastTip", { acc: Math.round(last.accuracy) }),
    ...(avg ? [delta(last.wpm, avg.wpm, "lp.faster", "lp.slower"), delta(last.accuracy, avg.acc, "lp.accUp", "lp.accDown")] : [])]
    .filter(Boolean).join(" ");
  const n = Math.round(last.wpm);
  return cell("lp-last", `${bestLang === S.lang ? `<b class="lp-best" data-n="${n}">${n}</b>` : num(last.wpm)}<small>wpm</small>`, tip);
}

function intro() {
  const r = rule();
  return `<p class="lp-news lp-intro">${t("lp.introLbl", { l: `<b class="lp-key">${S.exercise.locked[0]}</b>` })}: ` +
    `${t("lp.intro", { min: r.min, err: Math.round(r.err * 100), wpm: S.lastStats.targetWpm || 30 })}.</p>`;
}

let goalNow = null;
let goalTyping = false;
function dailyGoal() {
  goalNow = null;
  goalTyping = document.body.classList.contains("typing-now");
  const goal = S.settings.daily;
  if (!goal) return cell("lp-goal off", ring(0), t("lp.goalOffTip"));
  if (activityLang !== S.lang || !activity) return cell("lp-goal", ring(0), t("lp.goalTip"));
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
  const m = Math.floor(today / 60);
  const tip = [t(met ? "lp.goalDone" : "lp.goalNow", { m, g: goal }), streak >= 2 ? t("lp.goalDays", { n: streak }) : "", t("lp.goalTip")];
  return cell(`lp-goal${met ? " met" : ""}`, ring(today / need), tip.filter(Boolean).join(" "));
}
const ring = (share) =>
  `<svg class="lp-ring" viewBox="0 0 24 24" aria-hidden="true" style="--g:${Math.min(1, share).toFixed(3)}">` +
  `<circle cx="12" cy="12" r="9"/><circle class="fill" cx="12" cy="12" r="9" pathLength="100"/></svg>`;
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

const cell = (cls, value, tip = "") =>
  `<span class="lp-cell ${cls}"${tip ? ` tabindex="0" data-tip-text="${tip}"` : ""}>${value}</span>`;
