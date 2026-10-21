// The Learn panel: two short lines between the letters row and the text,
// in place of a result screen (owner, 2026-10-20: "the result screen is not
// needed"; the model is keybr's lines above its text). A Learn round ends
// and the next one starts at once; what the round did is read here:
//   line 1: the last round (speed and accuracy, each with its difference
//           from your recent average), about how many rounds to the next
//           letter (the forecast), the lap after Learn complete, an accuracy streak (rounds in a row
//           at 95% or better) and today's practice against the daily goal;
//   line 2: the gold letter (the focus of the words being typed): how far
//           it is on the way to mastered and what it still needs, in plain
//           words. Right after a round with news (a new letter, letters
//           mastered, a record, every letter open, a new lap, the last lap
//           done) the
//           news takes this line until you start typing.
// The panel steps back while you type (body.typing-now, style.css): the
// news and the letter line sit in one grid cell and swap by opacity only,
// so the first key changes no layout.
// Display only: nothing here changes what is measured or sent.
// Layer: middle. Imports the bottom layer, letters.js (a letter's progress)
// and modes.js.
// Called by: typing.js (renderPanel with the letters row; roundNews and
// refreshActivity at the end of a round), input.js (renderPanel after a
// change of the daily goal), languages.js (refreshActivity).
// To add an item to line 1: a function that returns its HTML (or "" when it
// has nothing to say), called in renderPanel, its texts in i18n.js ("lp.*").

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
    news = { text: t("news.newLetter", { l: `<b>${r.newLetter}</b>` }), tip: t("news.newLetterTip") };
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
  const top = [lastRound(), forecast(), lap(), accStreak(), dailyGoal()].join("");
  const letter = letterLine();
  const html = `<div class="lp-row">${top}</div>` +
    `<div class="lp-row lp-stack${news ? " has-news" : ""}">` +
    (news ? `<p class="lp-news${news.big ? " big" : ""}"${news.tip ? ` tabindex="0" data-tip-text="${news.tip}"` : ""}>${news.text}</p>` : "") +
    `<p class="lp-letter">${letter}</p></div>`;
  if (html === drawn) return;
  drawn = html;
  box.innerHTML = html;
}

// "Last round 54 wpm ↑3 · 97% ↓1": the newest round of this length and its
// difference from the average of the rounds before it (rounded; no arrow
// when it rounds to 0).
function lastRound() {
  const list = S.lastStats.sessions ?? [];          // newest first
  const last = list[0];
  if (!last) return item("lp-last", t("lp.last"), `<span class="lp-dim">${t("lp.first")}</span>`);
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
  return item("lp-last", t("lp.last"),
    `<b>${Math.round(last.wpm)}</b><small>wpm</small>${delta(last.wpm, avg?.wpm, "", "lp.faster", "lp.slower")}` +
    `<b class="lp-gap">${Math.round(last.accuracy)}%</b>${delta(last.accuracy, avg?.acc, "%", "lp.accUp", "lp.accDown")}`);
}

// "Next letter ≈ 6 rounds": the forecast (letters.js forecastText).
function forecast() {
  const f = forecastText(S.lastStats.forecast, S.exercise.locked.length === 0);
  if (!f) return "";
  return `<span class="lp-item lp-fc" tabindex="0" data-tip-text="${f.tip}"><span class="lp-lbl">${f.label}</span><b>${f.value}</b></span>`;
}

// "Lap 2 of 7": after Learn complete the letters are learned again at a
// higher goal (docs/ALGORITHM.md 6.1); nothing on the first lap.
function lap() {
  const s = S.lastStats;
  if (!s.lap) return "";
  return item("lp-lap", t("lp.lap"), `<b tabindex="0" data-tip-text="${t("lp.lapTip", { w: s.targetWpm })}">${t("lp.lapOf", { n: s.lap + 1, all: s.lastLap + 1 })}</b>`);
}

// "4 rounds in a row at 97% or better": the highest level that the newest
// rounds reached two times or more in a row; nothing without one.
function accStreak() {
  const list = S.lastStats.sessions ?? [];
  for (const level of STREAK_LEVELS) {
    let n = 0;
    while (n < list.length && list[n].accuracy >= level) n++;
    if (n >= 2) {
      return `<span class="lp-item lp-streak" tabindex="0" data-tip-text="${t("lp.streakTip")}">` +
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>${t("lp.streak", { n, a: level })}</span>`;
    }
  }
  return "";
}

// "Today ▬▬▬── 12 of 15 min": today's typing time in every mode against
// the daily goal (settings), and the days in a row the goal was met.
function dailyGoal() {
  const goal = S.settings.daily;
  if (!goal || activityLang !== S.lang || !activity) return "";
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
  const text = met ? t("lp.goalMet", { m: min }) : t("lp.goalLeft", { m: min, g: goal });
  const days = streak >= 2 ? `<span class="lp-dim">${t("lp.days", { n: streak })}</span>` : "";
  return `<span class="lp-item lp-goal${met ? " met" : ""}" tabindex="0" data-tip-text="${t("lp.goalTip", { g: goal })}">` +
    `<span class="lp-lbl">${t("lp.today")}</span><span class="lp-bar" style="--g:${Math.min(1, today / need).toFixed(3)}"><i></i></span>${text}${days}</span>`;
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

// One item of line 1: a quiet label, then its value.
const item = (cls, label, value) => `<span class="lp-item ${cls}"><span class="lp-lbl">${label}</span>${value}</span>`;
