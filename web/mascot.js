// The logo's keycap as a mascot: pressed, woken, dragged, and the letters that fall (#207).

import { t } from "./i18n.js";
import { $, S, store, isTouch, reducedMotion } from "./state.js";
import { keySound } from "./sound.js";

const CHAIN_MS = 700, WAKE_CLICKS = 3, POKE_CLICKS = 5;
const SIZE = 52, EDGE = 24, SAY_MS = 2800, HOLD_SAY_MS = 600;
const IDLE_MIN_MS = 6000, IDLE_MAX_MS = 14000, STEP_MIN = 30, STEP_MAX = 90;
const QUEST = "typeTrainer";

const logo = $("logo");
const cap = logo.querySelector(".logo-cap");
const nameEl = logo.querySelector(".logo-name");
const typingNow = () => document.body.classList.contains("typing-now");
const sound = (ok) => keySound(ok, S.settings.sound === "off" ? "off" : "keys");

let clicks = 0, lastClick = 0;
function chain(now) {
  clicks = now - lastClick < CHAIN_MS ? clicks + 1 : 1;
  lastClick = now;
  return clicks;
}

// ---------- the logo key ----------
function press() {
  sound(true);
  cap.animate([{ transform: "translateY(0)" }, { transform: "translateY(4px)" }, { transform: "translateY(0)" }],
    { duration: 140, easing: "ease-out" });
}

logo.addEventListener("click", () => {
  if (isTouch() || typingNow() || questOpen()) return;
  if (mascot) { goHome(); return; }
  press();
  const n = chain(performance.now());
  if (n === WAKE_CLICKS) wake();
  else if (n === WAKE_CLICKS - 1) cap.querySelector(".logo-eyes").animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 700 });
});

// ---------- the mascot ----------
let mascot = null, body = null, bubble = null, x = 0, y = 0, idle = 0, sayTimer = 0;

const FACE = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="12" width="46" height="44" rx="10" fill="#a8851a"/>` +
  `<rect x="9" y="8" width="46" height="42" rx="10" fill="#e2b714"/>` +
  `<g class="m-eyes"><circle cx="24" cy="25" r="4" fill="#15171a"/><circle cx="40" cy="25" r="4" fill="#15171a"/></g>` +
  `<rect class="m-mouth" x="22" y="38" width="20" height="5" rx="2.5" fill="#15171a"/></svg>`;

function build() {
  mascot = document.createElement("div");
  mascot.className = "mascot";
  mascot.innerHTML = `<div class="m-body">${FACE}</div><p class="m-say" role="status"></p>`;
  body = mascot.firstChild;
  bubble = mascot.lastChild;
  document.body.append(mascot);
  mascot.addEventListener("pointerdown", grab);
}

const clampX = (v) => Math.min(Math.max(v, EDGE), innerWidth - SIZE - EDGE);
const clampY = (v) => Math.min(Math.max(v, EDGE), innerHeight - SIZE - EDGE);
const place = () => { mascot.style.transform = `translate(${x}px, ${y}px)`; };

function spot() {
  try {
    const p = JSON.parse(store.get("tt.mascot") || "null");
    if (p) return [clampX(p.x * innerWidth), clampY(p.y * innerHeight)];
  } catch {}
  return [clampX(innerWidth - SIZE - 3 * EDGE), clampY(innerHeight - SIZE - 4 * EDGE)];
}
const saveSpot = () => store.set("tt.mascot", JSON.stringify({ x: x / innerWidth, y: y / innerHeight }));

function arc(from, to, up) {
  const frames = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8, lift = 4 * k * (1 - k) * up;
    frames.push({ transform: `translate(${from[0] + (to[0] - from[0]) * k}px, ${from[1] + (to[1] - from[1]) * k - lift}px)` });
  }
  return frames;
}
function land() {
  body.animate([{ transform: "scale(1.12, .84)" }, { transform: "scale(1)" }],
    { duration: 220, easing: "cubic-bezier(.2, 1.4, .4, 1)" });
}

function wake() {
  const r = logo.querySelector(".logo-key").getBoundingClientRect();
  if (!r.width) return;
  build();
  const from = [r.left + (r.width - SIZE) / 2, r.top + (r.height - SIZE) / 2];
  [x, y] = spot();
  place();
  logo.classList.add("out");
  if (reducedMotion()) {
    mascot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  } else {
    mascot.animate(arc(from, [x, y], 160), { duration: 700, easing: "ease-in-out" }).finished.then(land, () => {});
  }
  say(t("mascot.hi"));
  rest();
}

function goHome() {
  if (!mascot) return;
  clearTimeout(idle);
  const r = logo.querySelector(".logo-key").getBoundingClientRect();
  const m = mascot;
  mascot = null;
  const done = () => { m.remove(); logo.classList.remove("out"); press(); };
  if (reducedMotion() || !r.width) { done(); return; }
  m.style.transform = `translate(${r.left + (r.width - SIZE) / 2}px, ${r.top + (r.height - SIZE) / 2}px)`;
  m.animate(arc([x, y], [r.left + (r.width - SIZE) / 2, r.top + (r.height - SIZE) / 2], 120),
    { duration: 600, easing: "ease-in-out" }).finished.then(done, done);
}

// ---------- what it does on its own ----------
function rest() {
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (!mascot) return;
    if (!typingNow() && !document.hidden && !dragging && !questOpen()) {
      if (!reducedMotion() && Math.random() < .35) walk();
      else blink();
    }
    rest();
  }, IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS));
}
function blink() {
  mascot.querySelector(".m-eyes").animate([{ transform: "scaleY(1)" }, { transform: "scaleY(.1)" }, { transform: "scaleY(1)" }],
    { duration: 160 });
}
function walk() {
  const step = (STEP_MIN + Math.random() * (STEP_MAX - STEP_MIN)) * (Math.random() < .5 ? -1 : 1);
  const from = [x, y];
  x = clampX(x + step);
  place();
  const ms = Math.abs(x - from[0]) * 12;
  mascot.animate([{ transform: `translate(${from[0]}px, ${y}px)` }, { transform: `translate(${x}px, ${y}px)` }], { duration: ms });
  body.animate([{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(-4px) rotate(-6deg)" }, { transform: "translateY(0) rotate(0)" },
    { transform: "translateY(-4px) rotate(6deg)" }, { transform: "translateY(0) rotate(0)" }],
  { duration: ms / Math.max(1, Math.round(ms / 300)), iterations: Math.max(1, Math.round(ms / 300)) });
  saveSpot();
}

function say(text) {
  clearTimeout(sayTimer);
  bubble.textContent = text;
  bubble.classList.toggle("left", x > innerWidth / 2);
  bubble.classList.add("on");
  sayTimer = setTimeout(() => bubble.classList.remove("on"), SAY_MS);
}

function stats() {
  return S.mode === "learn" ? S.lastStats : S.mode === "climb" ? S.climb : S.freetype;
}
function line() {
  const s = stats(), list = s?.sessions ?? [];
  const lines = [t("mascot.tip1"), t("mascot.tip2"), t("mascot.tip3")];
  if (!list.length) return Math.random() < .5 ? t("mascot.none") : lines[Math.floor(Math.random() * lines.length)];
  const wpm = (r) => Math.round(r.wpm);
  lines.push(t("mascot.best", { n: Math.max(...list.map(wpm)), k: list.length }));
  if (s.sessionCount > 1) lines.push(t("mascot.rounds", { n: s.sessionCount }));
  if (list.length > 1) lines.push(t("mascot.last", { a: wpm(list[0]), b: wpm(list[1]) }));
  return lines[Math.floor(Math.random() * lines.length)];
}

// ---------- drag and poke ----------
let dragging = false, pokes = 0, lastPoke = 0;
function grab(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  mascot.setPointerCapture(e.pointerId);
  const dx = e.clientX - x, dy = e.clientY - y, sx = e.clientX, sy = e.clientY;
  let moved = false;
  const holdSay = setTimeout(() => { if (moved) say(t("mascot.held")); }, HOLD_SAY_MS);
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    if (!moved) { moved = dragging = true; mascot.classList.add("held"); }
    x = clampX(ev.clientX - dx);
    y = clampY(ev.clientY - dy);
    place();
  };
  const up = () => {
    clearTimeout(holdSay);
    mascot.removeEventListener("pointermove", move);
    mascot.removeEventListener("pointerup", up);
    mascot.removeEventListener("pointercancel", up);
    mascot.classList.remove("held");
    dragging = false;
    if (moved) { land(); saveSpot(); bubble.classList.remove("on"); }
    else poke();
  };
  mascot.addEventListener("pointermove", move);
  mascot.addEventListener("pointerup", up);
  mascot.addEventListener("pointercancel", up);
}

function poke() {
  if (questOpen()) return;
  const now = performance.now();
  pokes = now - lastPoke < CHAIN_MS ? pokes + 1 : 1;
  lastPoke = now;
  land();
  if (pokes === POKE_CLICKS) { pokes = 0; scatter(); }
  else if (pokes === POKE_CLICKS - 2) say(t("mascot.poked"));
  else if (pokes === 1) say(line());
}

addEventListener("resize", () => {
  if (!mascot) return;
  x = clampX(x);
  y = clampY(y);
  place();
});

// ---------- the letters fall: type them back ----------
let quest = null;
export const questOpen = () => quest !== null;

function scatter() {
  const html = nameEl.innerHTML;
  nameEl.innerHTML = [...QUEST].map((c, i) => `<i class="${i >= 4 ? "tail" : ""}">${c}</i>`).join("");
  const letters = [...nameEl.children];
  const falls = letters.map((l) => {
    const r = l.getBoundingClientRect();
    const down = innerHeight - r.top + 40, side = (Math.random() - .5) * 160, turn = (Math.random() - .5) * 540;
    return l.animate([{ transform: "translate(0, 0) rotate(0)" }, { transform: `translate(${side}px, ${down}px) rotate(${turn}deg)` }],
      { duration: 900 + Math.random() * 400, delay: Math.random() * 150, easing: "cubic-bezier(.5, 0, .9, .6)", fill: "forwards" });
  });
  const box = document.createElement("div");
  box.className = "logo-quest";
  box.innerHTML = `<span class="q-text" aria-hidden="true">${[...QUEST].map((c) => `<i>${c}</i>`).join("")}</span><span class="q-note"></span>`;
  nameEl.parentNode.append(box);
  quest = { html, letters, falls, box, pos: 0, start: 0 };
  showQuest();
  say(t("mascot.sneeze"));
}

function showQuest() {
  const best = Number(store.get("tt.logoBest")) || 0;
  [...quest.box.firstChild.children].forEach((c, i) => {
    c.classList.toggle("done", i < quest.pos);
    c.classList.toggle("next", i === quest.pos);
  });
  quest.box.lastChild.textContent = best ? t("mascot.questBest", { s: best.toFixed(2) }) : t("mascot.questEsc");
}

function endQuest(won) {
  const q = quest;
  quest = null;
  q.falls.forEach((a, i) => { if (i >= q.pos) a.reverse(); });
  const restore = () => { nameEl.innerHTML = q.html; };
  Promise.all(q.falls.map((a) => a.finished.catch(() => {}))).then(restore);
  q.box.remove();
  if (!won) return;
  const s = (performance.now() - q.start) / 1000, best = Number(store.get("tt.logoBest")) || 0;
  if (!best || s < best) store.set("tt.logoBest", s.toFixed(2));
  if (mascot) say(!best || s < best ? t("mascot.questNew", { s: s.toFixed(2) }) : t("mascot.questTime", { s: s.toFixed(2), b: best.toFixed(2) }));
}

export function questKey(e) {
  if (e.key === "Escape") { e.preventDefault(); endQuest(false); return; }
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.repeat) return;
  e.preventDefault();
  if (e.key !== QUEST[quest.pos]) {
    sound(false);
    quest.box.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }],
      { duration: 180 });
    return;
  }
  sound(true);
  if (!quest.pos) quest.start = performance.now();
  quest.falls[quest.pos].playbackRate = 3;
  quest.falls[quest.pos].reverse();
  quest.pos++;
  if (quest.pos === QUEST.length) endQuest(true);
  else showQuest();
}
