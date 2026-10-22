// The Learn panel: a line of columns between the letters row and the text, in
// place of a result screen (owner, 2026-10-20: "the result screen is not
// needed"; the model is keybr's lines above its text). A Learn round ends
// and the next one starts at once; what the round did is read here:
//   the panel: four fixed columns, each a small grey label over a bright
//           value (owner, 2026-10-22: every item in its own place, nothing
//           shifting or running off the edge): the last round (speed and
//           accuracy, each with its difference from your recent average),
//           about how many rounds to the next letter (the forecast; after
//           Learn complete the lap and when it ends), the accuracy streak
//           (rounds in a row at 95% or better) and today's practice against
//           the daily goal. A column with nothing to say yet shows "—";
//           its tooltip says when it fills;
//   the gold letter (the focus of the words being typed), in the same
//           label-over-value style, sits apart: in the line just above
//           the text, between the word counter and the round switch
//           (#focus-box; owner, 2026-10-22: a sentence there said little,
//           columns read at a glance): how far it is on the way to
//           mastered, then the three parts of the mastery rule, each
//           ticked green once met. Right after a round with news (a new
//           letter, letters mastered, a record, every letter open, a new
//           lap, the last lap done) the news takes its place until you
//           start typing.
// Everything here follows you as you type (owner, 2026-10-22: the whole
// Learn screen is live): it is drawn again after every portion, when the
// server has learned from its presses (POST /portion, then /stats), and a
// value that changed lights up once (redraw). The forecast, the gold
// letter and Today (with the round so far, S.roundSeconds) move while you
// type; Last round and the streak at the end of a round. The panel steps
// back a little while you type (typing.css); the live numbers show on the
// right of the line above the text.
// The news and the columns sit in one grid cell and swap by opacity only,
// so the first key changes no layout.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports the bottom layer, letters.js (a letter's progress)
// and modes.js.
// Called by: typing.js (renderPanel with the letters row; roundNews and
// refreshActivity at the end of a round), input.js (renderPanel after a
// change of the daily goal), languages.js (refreshActivity).
// To add a column to the panel: a function that returns cell(...), called in
// renderPanel, one more track in .lp-cols (typing.css), its texts in
// i18n.js ("lp.*").

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { letterProgress, rule, forecastText } from "./letters.js";
import { learning } from "./modes.js";

const box = $("learn-panel"), focusBox = $("focus-box");

// The average to compare a round with: the AVG_ROUNDS rounds before it,
// and none with fewer than AVG_MIN (an average of one or two rounds says
// little). /stats gives only the rounds of the length chosen, so lengths
// are never mixed.
const AVG_ROUNDS = 10, AVG_MIN = 3;
// The accuracy streak: the highest of these levels that the last two
// rounds or more reached in a row ("4 rounds in a row at 97% or better").
const STREAK_LEVELS = [100, 98, 97, 95, 90];

// Today's practice and the days before it, from /activity (every mode of
// this language, the days ending at the user's own midnight).
let activity = null, activityLang = "";
export async function refreshActivity() {
  try {
    activity = (await getJSON(`/activity?tz=${-new Date().getTimezoneOffset()}`)).days;
    activityLang = S.lang;
  } catch (err) { console.error(err); }
  renderPanel();
}

// What one Learn round changed: a new record of this length (the round
// is the newest in /stats, newest first) and the letters mastered in it.
// before, after: /stats before and after the round.
export function compareStats(before, after) {
  const prev = Object.fromEntries((before?.keys ?? []).map((k) => [k.char, k]));
  const best = (before?.sessionCount ?? 0) > 0 &&
    (after.sessions[0]?.wpm ?? 0) > Math.max(0, ...before.sessions.map((x) => x.wpm));
  const mastered = after.keys.filter((k) => k.mastered && !prev[k.char]?.mastered).map((k) => k.char);
  return { best, mastered };
}

// ---------- news of the round ----------
// What the round that just ended brought, most important first; shown on
// the gold letter's place until the next round is begun. The two milestones of Learn are
// told once per language (tt.milestone.<lang>: "open", then "complete").
// A new lap (r.newLap, its goal in wpm) is a milestone every time; the end
// of the last lap is told once ("final").
// r: { best, wpm, newLetter, newLap, mastered: [chars] } (compareStats and the round)
// Returns true for a milestone (typing.js gives it confetti).
let news = null;              // {text, tip, big, lang} or null
export function roundNews(r) {
  news = null;
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
let drawn = "", drawnFocus = "";
// Draws the panel from S.lastStats, S.exercise.focus and today's practice.
// Runs on a portion change and at the end of a round, never per key; the
// page is touched only when the HTML changes.
export function renderPanel() {
  if (!box) return;
  const show = learning() && !!S.lastStats && !!S.exercise;
  box.hidden = focusBox.hidden = !show;
  if (!show) { drawn = drawnFocus = ""; return; }
  if (news && news.lang !== S.lang) news = null;   // the news of another language
  const top = [lastRound(), forecast(), accStreak(), dailyGoal()].join("");
  const html = `<div class="lp-cols">${top}</div>`;
  if (html !== drawn) { drawn = html; redraw(box, ".lp-val", html); }
  const focus = `<div class="fb-stack${news ? " has-news" : ""}">` +
    (news ? `<p class="lp-news${news.big ? " big" : ""}"${news.tip ? ` tabindex="0" data-tip-text="${news.tip}"` : ""}>${news.text}</p>` : "") +
    `<div class="fb-cols">${focusCells()}</div></div>`;
  if (focus !== drawnFocus) { drawnFocus = focus; redraw(focusBox, ".fb-cols .lp-val", focus); }
}

// Puts new HTML in el; while you type, a value (sel) that changed lights up
// once so the eye catches it (opacity only: the compositor's work, nothing
// to lay out). Runs per portion, never per key.
function redraw(el, sel, html) {
  const before = [...el.querySelectorAll(sel)].map((v) => v.textContent);
  el.innerHTML = html;
  if (!document.body.classList.contains("typing-now")) return;
  el.querySelectorAll(sel).forEach((v, i) => {
    if (before[i] !== undefined && before[i] !== v.textContent) v.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
  });
}

// "Last round / 54 wpm ↑3 97% Acc ↓1": the newest round of this length and its
// difference from the average of the rounds before it (rounded; no arrow
// when it rounds to 0).
function lastRound() {
  const list = S.lastStats.sessions ?? [];          // newest first
  const last = list[0];
  if (!last) return cell("lp-last", t("lp.last"), NONE, t("lp.first"));
  const before = list.slice(1, 1 + AVG_ROUNDS);
  const avg = before.length >= AVG_MIN ? {
    wpm: before.reduce((a, x) => a + x.wpm, 0) / before.length,
    acc: before.reduce((a, x) => a + x.accuracy, 0) / before.length,
  } : null;
  const delta = (now, was, unit, up, down) => {
    if (!avg) return "";
    const d = Math.round(now) - Math.round(was);
    if (!d) return "";
    const tip = t(d > 0 ? up : down, { d: Math.abs(d), n: before.length, avg: Math.round(was) });
    return `<span class="lp-delta ${d > 0 ? "up" : "down"}" tabindex="0" data-tip-text="${tip}">${d > 0 ? "↑" : "↓"}${Math.abs(d)}${unit}</span>`;
  };
  return cell("lp-last", t("lp.last"),
    `<b>${Math.round(last.wpm)}</b><small>wpm</small>${delta(last.wpm, avg?.wpm, "", "lp.faster", "lp.slower")}` +
    `<b class="lp-gap">${Math.round(last.accuracy)}%</b><small>${t("metric.acc")}</small>${delta(last.accuracy, avg?.acc, "%", "lp.accUp", "lp.accDown")}`);
}

// "Next letter / ≈ 6 rounds": the forecast (letters.js forecastText). After
// Learn complete the label is the lap instead ("Lap 2 of 7 / ≈ 6 rounds":
// the lap ends in about 6 rounds; docs/ALGORITHM.md 6.1).
function forecast() {
  const s = S.lastStats;
  const f = forecastText(s.forecast, S.exercise.locked.length === 0);
  const label = s.lap ? `${t("lp.lap")} ${t("lp.lapOf", { n: s.lap + 1, all: s.lastLap + 1 })}` : t("fc.next");
  const tip = [s.lap ? t("lp.lapTip", { w: s.targetWpm }) : "", f ? f.tip : t("fc.none")].filter(Boolean).join(". ");
  return cell("lp-fc", label, f ? `<b>${f.value}</b>` : NONE, tip);
}

// "Clean streak / 4 rounds at 97%+": the highest level that the newest
// rounds reached two times or more in a row; "—" without one.
function accStreak() {
  const list = S.lastStats.sessions ?? [];
  for (const level of STREAK_LEVELS) {
    let n = 0;
    while (n < list.length && list[n].accuracy >= level) n++;
    if (n >= 2) {
      return cell("lp-streak", t("lp.streakLbl"), `<b>${n}</b><small>${t("lp.streakOf", { a: level })}</small>`,
        `${t("lp.streak", { n, a: level })}. ${t("lp.streakTip")}`);
    }
  }
  return cell("lp-streak", t("lp.streakLbl"), NONE, t("lp.streakTip"));
}

// "Today / ▬▬▬── 12 of 15 min": today's typing time in every mode against
// the daily goal (settings), and the days in a row the goal was met (in
// the label, from 2). With the goal off the column stays, empty, so the
// others keep their places.
function dailyGoal() {
  const goal = S.settings.daily;
  if (!goal) return `<span class="lp-cell lp-goal"></span>`;
  if (activityLang !== S.lang || !activity) return cell("lp-goal", t("lp.today"), NONE);
  const byDate = Object.fromEntries(activity.map((d) => [d.date, d.seconds]));
  const day = (back) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // while you type, the round so far counts too (as of the last portion;
  // /activity has it once the round is saved)
  const now = document.body.classList.contains("typing-now") ? S.roundSeconds : 0;
  const need = goal * 60, today = (byDate[day(0)] ?? 0) + now;
  const met = today >= need;
  // the days in a row: from today if it is met already, else from yesterday
  let streak = 0;
  for (let back = met ? 0 : 1; (byDate[day(back)] ?? 0) >= need; back++) streak++;
  const min = Math.floor(today / 60);
  const label = streak >= 2 ? t("lp.todayDays", { n: streak }) : t("lp.today");
  const value = `<span class="lp-bar" style="--g:${Math.min(1, today / need).toFixed(3)}"><i></i></span>` +
    `<b>${min}</b><small>${met ? t("lp.goalMet") : t("lp.goalOf", { g: goal })}</small>`;
  return cell(`lp-goal${met ? " met" : ""}`, label, value, t("lp.goalTip", { g: goal }));
}

// The gold letter in four columns: "Gold letter / f 62% to mastered",
// "Presses / 18 of 20", "Mistakes / 8% under 5%", "Speed / 24 of 30 wpm";
// a part of the rule already met is green with a tick. A letter never
// typed shows "—" (0% mistakes would read as a result). The percentage is
// the weakest of the three parts, as on its chip.
function focusCells() {
  const c = S.exercise.focus;
  if (!c) return "";
  const k = (S.lastStats.keys ?? []).find((x) => x.char === c);
  const s = S.lastStats, r = rule(), err = Math.round(s.masteryErr);
  const typed = !!k?.count;
  const pctTip = t("lp.pctTip", { l: c, min: s.masteryMin, err, target: s.targetWpm });
  const chip = `<span class="chip focus lp-chip${k?.mastered ? " mastered" : ""}">${c}</span>`;
  const gold = !typed ? chip + NONE
    : k.mastered ? `${chip}<b class="ok">${t("lp.fMastered")}</b>`
      : `${chip}<b>${Math.round(letterProgress(k) * 100)}%</b><small>${t("lp.fToGo")}</small>`;
  const tick = (ok) => ok ? `<span class="fb-tick" aria-hidden="true">✓</span>` : "";
  const part = (cls, label, ok, value) =>
    cell(`fb-${cls}${ok ? " met" : ""}`, label, typed ? value + tick(ok) : NONE);
  const wpm = k?.avgMs ? Math.round(12000 / k.avgMs) : 0;
  return cell("fb-gold", t("lp.fGold"), gold, pctTip) +
    part("presses", t("lp.fPresses"), k?.count >= r.min, `<b>${k?.count ?? 0}</b><small>${t("lp.fOf", { n: r.min })}</small>`) +
    part("mistakes", t("lp.fMistakes"), typed && k.errorRate <= r.err, `<b>${Math.round((k?.errorRate ?? 0) * 100)}%</b><small>${t("lp.fUnder", { n: err })}</small>`) +
    part("speed", t("lp.fSpeed"), !!k?.avgMs && k.avgMs <= r.ms, `<b>${wpm}</b><small>${t("lp.fOfWpm", { n: s.targetWpm })}</small>`);
}

// One column (the panel's and the gold letter's): a small grey label over its
// value; the tooltip, if any, on the whole column.
const NONE = `<b class="lp-none">—</b>`;
const cell = (cls, label, value, tip = "") =>
  `<span class="lp-cell ${cls}"${tip ? ` tabindex="0" data-tip-text="${tip}"` : ""}>` +
  `<span class="lp-lbl">${label}</span><span class="lp-val">${value}</span></span>`;
