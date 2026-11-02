// Learn's part of the line over the text: the last round and the daily goal.

import { t } from "./i18n.js";
import { $, S } from "./state.js";
import { getJSON } from "./api.js";
import { learning } from "./modes.js";
import { pickDaily } from "./settings.js";

const cols = $("lp-cols");

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

let bestLang = "";
export function roundMilestone(r) { bestLang = r.best ? S.lang : ""; }

// ---------- drawing ----------
let drawn = "";
export function renderPanel() {
  const show = learning() && !!S.lastStats && !!S.exercise;
  goalBtn.hidden = !show;
  if (!show) { drawn = ""; cols.innerHTML = ""; return; }
  goalState();
  const html = lastRound();
  if (html !== drawn) {
    drawn = html;
    cols.innerHTML = html;
  }
}

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
  const tip = [t("lp.lastTip"),
    ...(avg ? [delta(last.wpm, avg.wpm, "lp.faster", "lp.slower"), delta(last.accuracy, avg.acc, "lp.accUp", "lp.accDown")] : [])]
    .filter(Boolean).join(" ");
  const n = Math.round(last.wpm);
  return cell("lp-last", `<span class="lp-pair">${bestLang === S.lang ? `<b class="lp-best" data-n="${n}">${n}</b>` : num(last.wpm)}<small>wpm</small></span>` +
    `<span class="lp-pair">${num(last.accuracy, "%")}<small>${t("metric.acc")}</small></span>`, tip);
}

// ---------- the daily goal ----------
const goalBtn = $("goal-count");
let goalNow = null;
let goalTyping = false;
const dayKey = (back) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fillGoal = (today) => { goalBtn.textContent = t("lp.goalShort", { m: Math.floor(today / 60), g: S.settings.daily }); };
function goalState() {
  goalNow = null;
  goalTyping = document.body.classList.contains("typing-now");
  const goal = S.settings.daily;
  goalBtn.classList.remove("met");
  if (!goal) { goalBtn.textContent = t("lp.goalNone"); goalBtn.dataset.tipText = t("lp.goalOff"); return; }
  const byDate = activityLang === S.lang && activity ? Object.fromEntries(activity.map((d) => [d.date, d.seconds])) : {};
  const need = goal * 60, base = byDate[dayKey(0)] ?? 0, today = base + (goalTyping ? S.roundSeconds : 0);
  const met = today >= need;
  let days = 0;
  for (let back = met ? 0 : 1; (byDate[dayKey(back)] ?? 0) >= need; back++) days++;
  if (goalTyping && !met) goalNow = { base, need };
  goalBtn.classList.toggle("met", met);
  fillGoal(today);
  goalBtn.dataset.tipText = [t(met ? "lp.goalMet" : "lp.goal"), days >= 2 ? t("lp.goalDays", { n: days }) : "", t("lp.goalClick")].filter(Boolean).join(" ");
}
export function tickGoal() {
  if (goalBtn.hidden) return false;
  if (!goalTyping) renderPanel();
  if (!goalNow) return false;
  const today = goalNow.base + S.roundSeconds;
  fillGoal(today);
  if (today >= goalNow.need) { renderPanel(); return true; }
  return false;
}
goalBtn.addEventListener("click", () => pickDaily(goalBtn, renderPanel));

const cell = (cls, value, tip = "") =>
  `<span class="lp-cell ${cls}"${tip ? ` tabindex="0" data-tip-text="${tip}"` : ""}>${value}</span>`;
