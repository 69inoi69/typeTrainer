// The Learn panel: a line of columns between the letters row and the text, in
// place of a result screen (a stop after every short round only breaks
// the practice; the model is keybr's lines above its text). A Learn round ends
// and the next one starts at once; what the round did is read here, at
// rest: before the first key of a round the panel shows, with the first
// key it goes, so while you type the screen holds only the letters row
// (the gold chip is the letter being learned), the word counter and the
// live numbers (issue #150, variant C).
//   the panel: four fixed columns, each a small grey label over a bright
//           value (every item in its own place, nothing shifting or
//           running off the edge): the last round (speed and
//           accuracy, each with its difference from your recent average),
//           about how many rounds to the next letter (the forecast; after
//           Learn complete the lap and when it ends), the accuracy streak
//           (rounds in a row at 95% or better) and today's practice against
//           the daily goal, on a ring. A column with nothing to say yet shows "—";
//           its tooltip says when it fills;
//   the news: right after a round with news (a new letter, letters
//           mastered, a record, every letter open, a new lap, the last lap
//           done), in the line just above the text, between the word
//           counter and the round switch (#focus-box), until you start
//           typing; the live numbers take that place while you type.
// It is drawn again after every portion, when the server has learned from
// its presses (POST /portion, then /stats), and a number that changed
// counts to its new value (redraw). The panel keeps its room while
// hidden, so the first key changes no layout; the news and the live
// numbers sit in one grid cell and swap by opacity only.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports the bottom layer, letters.js (the forecast) and modes.js.
// Called by: typing.js (renderPanel with the letters row; roundNews and
// refreshActivity at the end of a round, tickGoal on its clock), input.js
// (renderPanel after a change of the daily goal), languages.js
// (refreshActivity).
// To add a column to the panel: a function that returns cell(...), called in
// renderPanel, one more track in .lp-cols (typing.css), its texts in
// i18n.js ("lp.*").

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { forecastText } from "./letters.js";
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
// the line above the text until the next round is begun. The two milestones of Learn are
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
  const focus = news ? `<p class="lp-news${news.big ? " big" : ""}"${news.tip ? ` tabindex="0" data-tip-text="${news.tip}"` : ""}>${news.text}</p>` : "";
  if (focus !== drawnFocus) { drawnFocus = focus; focusBox.innerHTML = focus; }
}

// Puts new HTML in el, and lets what changed show it (a live value that
// only swaps is easy to miss): a number counts from its old value
// to the new one, as the live wpm does (layout.css .live-n), and lights
// up gold for a moment; a goal just met turns green with a small pop. Runs per portion and at the end of a round, never per key;
// the counting is the CSS property --v animated by the browser (WAAPI).
function redraw(el, sel, html) {
  const nums = (root) => [...root.querySelectorAll(`${sel} .lp-n`)];
  const before = nums(el).map((v) => +v.dataset.n);
  const metBefore = [...el.querySelectorAll(".lp-cell")].map((c) => c.classList.contains("met"));
  el.innerHTML = html;
  if (!before.length) return;                       // the first drawing: nothing to compare
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

// A whole number that counts to its new value (redraw); the digits (and
// the unit, "%" or "") are drawn by CSS from --v and data-u (typing.css
// .lp-n), the text is in aria-label. cls: one more class.
const num = (x, unit = "", cls = "") => {
  const n = Math.round(x);
  return `<b class="lp-n${cls ? ` ${cls}` : ""}" data-n="${n}" data-u="${unit}" style="--v:${n}" aria-label="${n}${unit}"></b>`;
};

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
    `${num(last.wpm)}<small>wpm</small>${delta(last.wpm, avg?.wpm, "", "lp.faster", "lp.slower")}` +
    `${num(last.accuracy, "%", "lp-gap")}<small>${t("metric.acc")}</small>${delta(last.accuracy, avg?.acc, "%", "lp.accUp", "lp.accDown")}`);
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
      return cell("lp-streak", t("lp.streakLbl"), `${num(n)}<small>${t("lp.streakOf", { a: level })}</small>`,
        `${t("lp.streak", { n, a: level })}. ${t("lp.streakTip")}`);
    }
  }
  return cell("lp-streak", t("lp.streakLbl"), NONE, t("lp.streakTip"));
}

// "Daily goal / ◔ 12 of 15 min": today's typing time in every mode
// against the daily goal (settings), on a ring that fills as the time
// passes, and the days in a row the goal was met (in the label, from 2).
// Whole minutes: the panel is read between rounds; within a round tickGoal
// only watches for the goal being reached. With the goal off the column stays, empty,
// so the others keep their places.
let goalNow = null;           // {base, need}: what tickGoal needs, or null
let goalTyping = false;       // drawn while typing (the round counts), or at rest
function dailyGoal() {
  goalNow = null;
  goalTyping = document.body.classList.contains("typing-now");
  const goal = S.settings.daily;
  if (!goal) return `<span class="lp-cell lp-goal"></span>`;
  if (activityLang !== S.lang || !activity) return cell("lp-goal", t("lp.today"), NONE, t("lp.goalTip", { g: goal }));
  const byDate = Object.fromEntries(activity.map((d) => [d.date, d.seconds]));
  const day = (back) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // while you type, the round so far counts too (/activity has it once
  // the round is saved)
  const typing = document.body.classList.contains("typing-now");
  const need = goal * 60, base = byDate[day(0)] ?? 0, today = base + (typing ? S.roundSeconds : 0);
  const met = today >= need;
  // the days in a row: from today if it is met already, else from yesterday
  let streak = 0;
  for (let back = met ? 0 : 1; (byDate[day(back)] ?? 0) >= need; back++) streak++;
  if (typing && !met) goalNow = { base, need };
  const label = streak >= 2 ? t("lp.todayDays", { n: streak }) : t("lp.today");
  const value = ring(today / need) +
    `<b>${Math.floor(today / 60)}</b><small>${met ? t("lp.goalMet") : t("lp.goalOf", { g: goal })}</small>`;
  return cell(`lp-goal${met ? " met" : ""}`, label, value, t("lp.goalTip", { g: goal }));
}
// The ring: a circle whose stroke fills clockwise from the top (share 0..1).
const ring = (share) =>
  `<svg class="lp-ring" viewBox="0 0 20 20" aria-hidden="true" style="--g:${Math.min(1, share).toFixed(3)}">` +
  `<circle cx="10" cy="10" r="8"/><circle class="fill" cx="10" cy="10" r="8" pathLength="100"/></svg>`;
// Twice a second while a Learn round is typed (typing.js, its clock, which
// stops on a pause): the round so far counts toward the daily goal. The
// goal reached redraws the panel (its column turns green) and returns
// true: typing.js pauses the round with a note that says why (once: then
// the goal is met). Touches the page only then, never per key.
export function tickGoal() {
  if (!box || box.hidden) return false;
  if (!goalTyping) renderPanel();   // the first tick of a round: the panel was drawn at rest
  if (!goalNow) return false;
  const today = goalNow.base + S.roundSeconds;
  if (today >= goalNow.need) { renderPanel(); return true; }
  return false;
}

// One column of the panel: a small grey label over its
// value; the tooltip, if any, on the whole column.
const NONE = `<b class="lp-none">—</b>`;
const cell = (cls, label, value, tip = "") =>
  `<span class="lp-cell ${cls}"${tip ? ` tabindex="0" data-tip-text="${tip}"` : ""}>` +
  `<span class="lp-lbl">${label}</span><span class="lp-val">${value}</span></span>`;
