// The Learn panel: two lines between the letters row and the text, in
// place of a result screen (owner, 2026-10-20: "the result screen is not
// needed"; the model is keybr's lines above its text). A Learn round ends
// and the next one starts at once; what the round did is read here:
//   line 1: four fixed columns, each a small grey label over a bright
//           value (owner, 2026-10-22: every item in its own place, nothing
//           shifting or running off the edge): the last round (speed and
//           accuracy, each with its difference from your recent average),
//           about how many rounds to the next letter (the forecast; after
//           Learn complete the lap and when it ends), the accuracy streak
//           (rounds in a row at 95% or better) and today's practice against
//           the daily goal. A column with nothing to say yet shows "—";
//           its tooltip says when it fills;
//   line 2: the gold letter (the focus of the words being typed): how far
//           it is on the way to mastered and what it still needs, in plain
//           words. Right after a round with news (a new letter, letters
//           mastered, a record, every letter open, a new lap, the last lap
//           done) the
//           news takes this line until you start typing.
// The panel steps back while you type (body.typing-now, typing.css): the
// news and the letter line sit in one grid cell and swap by opacity only,
// so the first key changes no layout.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports the bottom layer, letters.js (a letter's progress)
// and modes.js.
// Called by: typing.js (renderPanel with the letters row; roundNews and
// refreshActivity at the end of a round), input.js (renderPanel after a
// change of the daily goal), languages.js (refreshActivity).
// To add a column to line 1: a function that returns cell(...), called in
// renderPanel, one more track in .lp-cols (typing.css), its texts in
// i18n.js ("lp.*").

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { letterProgress, rule, forecastText } from "./letters.js";
import { learning } from "./modes.js";

const box = $("learn-panel");

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
// line 2 until the next round is begun. The two milestones of Learn are
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
let drawn = "";
// Draws the panel from S.lastStats, S.exercise.focus and today's practice.
// Runs on a portion change and at the end of a round, never per key; the
// page is touched only when the HTML changes.
export function renderPanel() {
  if (!box) return;
  const show = learning() && !!S.lastStats && !!S.exercise;
  box.hidden = !show;
  if (!show) { drawn = ""; return; }
  if (news && news.lang !== S.lang) news = null;   // the news of another language
  const top = [lastRound(), forecast(), accStreak(), dailyGoal()].join("");
  const letter = letterLine();
  const html = `<div class="lp-cols">${top}</div>` +
    `<div class="lp-row lp-stack${news ? " has-news" : ""}">` +
    (news ? `<p class="lp-news${news.big ? " big" : ""}"${news.tip ? ` tabindex="0" data-tip-text="${news.tip}"` : ""}>${news.text}</p>` : "") +
    `<p class="lp-letter">${letter}</p></div>`;
  if (html === drawn) return;
  drawn = html;
  box.innerHTML = html;
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
  const need = goal * 60, today = byDate[day(0)] ?? 0;
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

// Line 2: the gold letter, how far it is (the weakest of the three parts of
// the mastery rule, as on its chip) and what it still needs, with the
// numbers: "f 62% It still needs fewer mistakes (8%, aim under 5%) and
// more speed (24 of 30 wpm)".
function letterLine() {
  const c = S.exercise.focus;
  if (!c) return "";
  const k = (S.lastStats.keys ?? []).find((x) => x.char === c);
  const p = k?.mastered ? 1 : letterProgress(k);
  const s = S.lastStats, r = rule();
  const pctTip = t("lp.pctTip", { l: c, min: s.masteryMin, err: Math.round(s.masteryErr), target: s.targetWpm });
  const head = `<span class="chip focus lp-chip${k?.mastered ? " mastered" : ""}">${c}</span>` +
    (k?.count ? `<b class="lp-pct" tabindex="0" data-tip-text="${pctTip}">${Math.round(p * 100)}%</b>` : "");
  let text;
  if (!k?.count) text = t("lp.letterNew", { l: c });
  else if (k.mastered) text = t("lp.letterDone");
  else {
    const parts = [];
    if (k.errorRate > r.err) parts.push(t("lp.needClean", { e: Math.round(k.errorRate * 100), err: Math.round(s.masteryErr) }));
    if (!k.avgMs || k.avgMs > r.ms) parts.push(t("lp.needFast", { w: k.avgMs ? Math.round(12000 / k.avgMs) : 0, target: s.targetWpm }));
    if (k.count < r.min) parts.push(t("lp.needMore", { n: k.count, min: r.min }));
    // "a and b", "a, b and c"
    const list = parts.length > 1 ? parts.slice(0, -1).join(", ") + t("lp.and") + parts.at(-1) : parts[0];
    text = t("lp.letterNeeds", { list });
  }
  // the whole sentence in a tooltip too, for when a narrow window cuts it
  return `${head}<span class="lp-text" data-tip-text="${text}">${text}</span>`;
}

// One column of line 1: a small grey label over its value; the tooltip, if
// any, on the whole column.
const NONE = `<b class="lp-none">—</b>`;
const cell = (cls, label, value, tip = "") =>
  `<span class="lp-cell ${cls}"${tip ? ` tabindex="0" data-tip-text="${tip}"` : ""}>` +
  `<span class="lp-lbl">${label}</span><span class="lp-val">${value}</span></span>`;
