// The Learn panel.

import { t } from "./i18n.js";
import { $, S, store } from "./state.js";
import { getJSON } from "./api.js";
import { learning } from "./modes.js";
import { FX } from "./fx.js";

const box = $("learn-panel"), cols = $("lp-cols");

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

// ---------- milestones of the round ----------
let bestLang = "";
export function roundMilestone(r) {
  bestLang = r.best ? S.lang : "";
  const ex = S.exercise, keys = S.lastStats?.keys ?? [];
  if (!ex) return false;
  const flag = store.get(`tt.milestone.${S.lang}`) || "";
  const allOpen = ex.locked.length === 0;
  const waiting = keys.some((k) => ex.unlocked.includes(k.char) && !k.mastered);
  const s = S.lastStats ?? {};
  const set = (v) => { store.set(`tt.milestone.${S.lang}`, v); return true; };
  if (r.newLap) return set("complete");
  if (allOpen && !waiting && s.lap >= s.lastLap && flag !== "final") return set("final");
  if (allOpen && !flag) return set("open");
  return false;
}

// ---------- drawing ----------
let drawn = "";
export function renderPanel() {
  if (!box) return;
  const show = learning() && !!S.lastStats && !!S.exercise;
  box.hidden = !show;
  if (!show) { drawn = ""; return; }
  goalState();
  const html = lastRound();
  if (html !== drawn) {
    drawn = html;
    redraw(cols, html);
    document.fonts.ready.then(() => cols.querySelectorAll(".lp-best:not(.foil)").forEach(FX.foil));
  }
}

function redraw(el, html) {
  const nums = (root) => [...root.querySelectorAll(".lp-cell :is(.lp-n, .lp-best)")];
  const before = nums(el).map((v) => +v.dataset.n);
  el.innerHTML = html;
  if (!before.length) return;
  nums(el).forEach((v, i) => {
    const was = before[i], now = +v.dataset.n;
    if (was === undefined || was === now) return;
    v.animate([{ "--v": was }, { "--v": now }], { duration: 700, easing: "cubic-bezier(.2, .7, .3, 1)" });
    v.animate([{ color: gold() }, {}], { duration: 1200, easing: "ease-out" });
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
  const tip = [t("lp.lastTip"),
    ...(avg ? [delta(last.wpm, avg.wpm, "lp.faster", "lp.slower"), delta(last.accuracy, avg.acc, "lp.accUp", "lp.accDown")] : [])]
    .filter(Boolean).join(" ");
  const n = Math.round(last.wpm);
  return cell("lp-last", `${bestLang === S.lang ? `<b class="lp-best" data-n="${n}">${n}</b>` : num(last.wpm)}<small>wpm</small>` +
    `${num(last.accuracy, "%", "lp-acc")}<small>${t("metric.acc")}</small>`, tip);
}

let goalNow = null;
let goalTyping = false;
function goalState() {
  goalNow = null;
  goalTyping = document.body.classList.contains("typing-now");
  const goal = S.settings.daily;
  if (!goal || !goalTyping || activityLang !== S.lang || !activity) return;
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const base = activity.find((x) => x.date === key)?.seconds ?? 0;
  if (base + S.roundSeconds < goal * 60) goalNow = { base, need: goal * 60 };
}
export function tickGoal() {
  if (!box || box.hidden) return false;
  if (!goalTyping) renderPanel();
  if (!goalNow) return false;
  const today = goalNow.base + S.roundSeconds;
  if (today >= goalNow.need) { renderPanel(); return true; }
  return false;
}

const cell = (cls, value, tip = "") =>
  `<span class="lp-cell ${cls}"${tip ? ` tabindex="0" data-tip-text="${tip}"` : ""}>${value}</span>`;
