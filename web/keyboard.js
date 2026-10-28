// The on-screen keyboard and the hand.

import { FEEL } from "./feel.js";
import { t } from "./i18n.js";
import { $, el, S, isTouch, themeColor, reducedMotion } from "./state.js";
import { setSetting } from "./settings.js";
import { openPop, ring, ringBtn } from "./minipop.js";

// ---------- keyboard ----------
let fingerOf = {};
const KEY_GAP = 0.12;

export function makeKey(k) {
  const finger = S.layout.fingers[k.finger];
  const key = document.createElement("div");
  key.className = "key" + (k.home ? " home" : "");
  key.style.setProperty("--fc", finger.color);
  if (k.width) {
    key.classList.add("wide");
    key.style.width = `calc(var(--u) * ${k.width} + var(--u) * .12 * ${k.width - 1})`;
  }
  key.innerHTML = `<span class="lbl"></span>`;
  key.querySelector(".lbl").textContent = k.char === " " ? t("key.space") : (k.label || k.char);
  if (k.alt) {
    const alt = document.createElement("span");
    alt.className = "alt";
    alt.textContent = k.alt;
    key.appendChild(alt);
  }
  if (k.modifier) key.classList.add("mod");
  return key;
}

export function drawKeyboard() {
  el.keyboard.innerHTML = "";
  S.keyEls = {}; fingerOf = {}; S.altBase = {}; S.altgrEl = null; nextKeyEl = null;
  S.layout.rows.forEach((row, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row";
    let x = S.layout.offsets?.[i] ?? 0;
    rowEl.style.paddingLeft = `calc(var(--u) * ${x})`;
    for (const k of row) {
      const key = makeKey(k);
      addLit(key);
      const w = (k.width ?? 1) * (1 + KEY_GAP) - KEY_GAP;
      key.dataset.x = String(x + w / 2);
      x += w + KEY_GAP;
      rowEl.appendChild(key);
      if (k.modifier) { S.altgrEl = key; continue; }
      S.keyEls[k.char] = key;
      fingerOf[k.char] = k.finger;
      if (k.alt) S.altBase[k.alt] = k.char;
    }
    el.keyboard.appendChild(rowEl);
  });
  el.keyboard.appendChild(el.hands);
  el.keyboard.appendChild(gear);
  for (const f of el.hands.querySelectorAll("[data-f]")) {
    const id = f.dataset.f;
    f.style.setProperty("--fc", S.layout.fingers[id.startsWith("th") ? "th" : id].color);
  }
  for (const url of handPics.values()) if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  handPics.clear();
  for (const hand of el.hands.querySelectorAll(".hand")) {
    if (!hand.querySelector("img")) hand.appendChild(Object.assign(document.createElement("img"), { alt: "" }));
  }
}

// ---------- the keyboard's own settings ----------
const KB_SWITCHES = ["nextKey", "hand"];
const KB_DESC = { hand: "settings.handDesc" };
const gear = Object.assign(document.createElement("button"), { type: "button", className: "kb-gear" });
gear.appendChild($("btn-settings").querySelector("svg").cloneNode(true));
gear.dataset.tip = "tip.kb";
gear.setAttribute("aria-label", t("tip.kb"));
gear.setAttribute("aria-haspopup", "dialog");
gear.setAttribute("aria-expanded", "false");
const kbRows = () => KB_SWITCHES.map((k) => {
  const on = S.settings[k], desc = KB_DESC[k] ? ` data-tip-text="${t(KB_DESC[k])}"` : "";
  return `<div class="mp-row"><span class="mp-name"${desc}>${t("settings." + k)}</span>` +
    ring(t("settings." + k), [ringBtn(`data-key="${k}" data-value=""`, t("settings.off"), !on), ringBtn(`data-key="${k}" data-value="1"`, t("settings.on"), on)]) + `</div>`;
}).join("");
gear.addEventListener("click", () => openPop(gear, t("settings.kbGroup"), kbRows, setSetting));

// ---------- the hand as pictures ----------
const handPics = new Map();
const PIC_TOP = 12;
let colorProbe = null;
function solidColor(css) {
  if (!colorProbe) { colorProbe = document.createElement("i"); colorProbe.hidden = true; document.body.appendChild(colorProbe); }
  colorProbe.style.color = css;
  return getComputedStyle(colorProbe).color;
}
function handPicture(side, ids) {
  const theme = document.documentElement.dataset.theme || "dark";
  const key = `${theme} ${side} ${ids.join(",")}`;
  let url = handPics.get(key);
  if (url) return url;
  const hand = el.hands.querySelector(side === "l" ? ".hand.left" : ".hand.right");
  const lift = FEEL.fingerLiftPx;
  let body = "";
  for (const f of hand.querySelectorAll("[data-f]")) {
    const p = f.querySelector("path");
    const lit = ids.includes(f.dataset.f);
    const st = getComputedStyle(f);
    const fill = lit ? solidColor(st.getPropertyValue("--fcd").trim() || st.getPropertyValue("--fc")) : getComputedStyle(p).fill;
    const move = lit ? ` transform="translate(${(-parseFloat(f.style.getPropertyValue("--dx")) * lift).toFixed(2)} ${(-parseFloat(f.style.getPropertyValue("--dy")) * lift).toFixed(2)})"` : "";
    body += `<g${move}><path transform="${p.getAttribute("transform")}" d="${p.getAttribute("d")}" fill="${fill}"/></g>`;
  }
  const palm = hand.querySelector(".palm");
  body += `<path transform="${palm.getAttribute("transform")}" d="${palm.getAttribute("d")}" fill="${getComputedStyle(palm).fill}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-PIC_TOP} 100 ${84 + PIC_TOP}">` +
    `<defs><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="0" y1="62" x2="0" y2="84"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<mask id="m"><rect x="0" y="${-PIC_TOP}" width="100" height="${84 + PIC_TOP}" fill="url(#f)"/></mask></defs>` +
    `<g mask="url(#m)">${body}</g></svg>`;
  url = "data:image/svg+xml," + encodeURIComponent(svg);
  handPics.set(key, url);
  toPixels(key, url, side);
  return url;
}
const PIC_SCALE = 3;
function toPixels(key, svgUrl, side) {
  const hand = el.hands.querySelector(side === "l" ? ".hand.left" : ".hand.right");
  const w = Math.round((parseFloat(getComputedStyle(hand).width) || 60) * PIC_SCALE * (devicePixelRatio || 1));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = w; c.height = Math.round(w * (84 + PIC_TOP) / 100);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob || handPics.get(key) !== svgUrl) return;
      const png = URL.createObjectURL(blob);
      handPics.set(key, png);
      new Image().src = png;
      for (const shown of el.hands.querySelectorAll(".hand > img")) if (shown.getAttribute("src") === svgUrl) shown.src = png;
    });
  };
  img.src = svgUrl;
}
function showHandPic(side, ids) {
  const theme = document.documentElement.dataset.theme || "dark";
  if (![...handPics.keys()].some((k) => k.startsWith(theme + " "))) {
    for (const f of el.hands.querySelectorAll("[data-f]")) {
      const id = f.dataset.f;
      handPicture(id === "thl" || id[0] === "l" ? "l" : "r", [id]);
    }
  }
  const img = el.hands.querySelector(side === "l" ? ".hand.left > img" : ".hand.right > img");
  const url = handPicture(side, ids);
  if (img && img.getAttribute("src") !== url) { img.src = url; img.dataset.f = ids.join(" "); }
}

function addLit(key) {
  const lit = document.createElement("i");
  lit.className = "lit";
  lit.setAttribute("aria-hidden", "true");
  lit.textContent = key.querySelector(".lbl").textContent;
  const alt = key.querySelector(".alt");
  if (alt) lit.appendChild(alt.cloneNode(true));
  key.appendChild(lit);
}

const baseOf = (ch) => { const lc = ch.toLowerCase(); return S.altBase[lc] ?? lc; };
const keyFor = (ch) => S.keyEls[ch] || S.keyEls[baseOf(ch)] || null;

let nextKeyEl = null;
export function highlightNextKey() {
  if (nextKeyEl) nextKeyEl.classList.remove("next");
  if (S.altgrEl) S.altgrEl.classList.remove("next");
  const ch = S.text[S.pos];
  const base = ch === undefined ? ch : baseOf(ch);
  nextKeyEl = S.keyEls[base] || null;
  if (!nextKeyEl) { el.hint.innerHTML = "&nbsp;"; showHands(""); return; }
  const lit = S.settings.nextKey && !S.kbHidden, hand = S.settings.hand && !S.kbHidden;
  if (lit) nextKeyEl.classList.add("next");
  const fingerId = fingerOf[base];
  let ids = fingerId === "th" ? ["thl", "thr"] : [fingerId];
  if (ch !== ch.toLowerCase()) ids.push(fingerId.startsWith("l") ? "rp" : "lp");
  const vars = { key: ch === " " ? t("key.space") : ch, base, finger: t(`finger.${fingerId}`) };
  if (S.altBase[ch]) {
    if (S.altgrEl && lit) S.altgrEl.classList.add("next");
    ids = [...ids, "thr"];
    el.hint.innerHTML = t("hint.alt", vars);
  } else {
    el.hint.innerHTML = t("hint.press", vars);
  }
  if (!hand) { showHands(""); return; }
  const sideOf = (id) => (id === "thl" || id[0] === "l" ? "l" : "r");
  const sides = [...new Set(ids.map(sideOf))];
  for (const side of sides) showHandPic(side, ids.filter((id) => sideOf(id) === side).sort());
  showHands(sides.length === 2 ? "lr" : sides[0]);
  el.hands.style.setProperty("--kx", nextKeyEl.dataset.x);
}
function showHands(show) {
  if (el.hands.dataset.show !== show) el.hands.dataset.show = show;
}

export function pulseKey(ch, ok) {
  if (ok || S.kbHidden) return;
  const k = keyFor(ch);
  if (!k || !k.animate || reducedMotion()) return;
  const red = `color-mix(in srgb, ${themeColor("--error")} ${Math.round(FEEL.keyMissAlpha * 100)}%, transparent)`;
  k.animate([{ boxShadow: `inset 0 0 0 999px ${red}` }, { boxShadow: "inset 0 0 0 999px transparent" }],
    { duration: FEEL.keyMissMs, easing: "ease-out" });
}

export function glowKey(ch) {
  const k = keyFor(ch);
  if (!k || !k.animate || reducedMotion()) return;
  const gold = themeColor("--accent");
  k.animate([{ boxShadow: `0 0 0 0 color-mix(in srgb, ${gold} 75%, transparent)` }, { boxShadow: `0 0 0 10px color-mix(in srgb, ${gold} 0%, transparent)` }],
    { duration: 380, easing: "ease-out" });
}

let applied = false;

export function autoKb(animate = false) {
  const allOpen = S.exercise?.locked?.length === 0;
  const hide = isTouch() || S.mode !== "learn" || allOpen;
  if (hide === S.kbHidden && applied) return;
  applied = true;
  S.kbHidden = hide;
  if (animate && !reducedMotion() && el.keyboard.animate) fold(S.kbHidden);
  else {
    setOff(S.kbHidden);
    requestFit();
  }
}
function setOff(hide) {
  el.keyboard.classList.toggle("off", hide);
  document.body.classList.toggle("kb-hidden", hide);
}

const FOLD_MS = 220;
const FOLD_EASE = "cubic-bezier(.2, .8, .2, 1)";
let foldRun = 0;
async function fold(hide) {
  const run = ++foldRun;
  const movers = [lettersBar, el.textBox];
  for (const n of [el.keyboard, ...movers]) n.getAnimations().forEach((a) => a.cancel());
  if (hide) {
    const out = el.keyboard.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(14px)" }],
      { duration: FOLD_MS * .7, easing: "ease-in" });
    try { await out.finished; } catch { return; }
    if (run !== foldRun) return;
  }
  const before = movers.map((n) => n.getBoundingClientRect().top);
  setOff(hide);
  if (!hide) fitKeyboard();
  const after = movers.map((n) => n.getBoundingClientRect().top);
  movers.forEach((n, i) => {
    const dy = before[i] - after[i];
    if (Math.abs(dy) > .5) n.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: FOLD_MS, easing: FOLD_EASE });
  });
  if (!hide) el.keyboard.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
    { duration: FOLD_MS, easing: FOLD_EASE });
  if (hide) requestFit();
}

const KB_PER_U = 4 + 3 * KEY_GAP + FEEL.handRoom;
const KB_MIN_U = 26;
let fitFrame = 0;
export function requestFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitKeyboard);
}
const lettersBar = document.querySelector("#view-type > .letters");
let baseU = 0, baseDpr = 0;
function fitKeyboard() {
  const root = document.documentElement.style;
  if (isTouch()) { root.removeProperty("--u-fit"); return; }
  if (S.view !== "type") return;
  if (el.textBox.classList.contains("resulting")) return;
  if (el.keyboard.getAnimations().length || el.keyboard.classList.contains("off")) return;
  const centred = getComputedStyle(el.viewType).getPropertyValue("--view-centred").trim() === "1";
  const kb = getComputedStyle(el.keyboard);
  const kbFrame = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, p) => sum + parseFloat(kb[p]), 0);
  const away = document.body.classList.contains("kb-nofit");
  const above = away ? 0 : parseFloat(kb.marginTop) || 0;
  const rest = document.querySelector(".top").offsetHeight + el.viewType.offsetHeight
    - el.keyboard.offsetHeight - above + kbFrame
    + (centred ? -2 * parseFloat(getComputedStyle(lettersBar).marginTop) : parseFloat(getComputedStyle(el.viewType).marginTop))
    + document.querySelector(".bottom").offsetHeight + 12
    + parseFloat(getComputedStyle(document.body).paddingBottom);
  let fit = Math.floor((innerHeight - rest - 4) / KB_PER_U);
  if (!baseU || devicePixelRatio === baseDpr) { baseU = fit; baseDpr = devicePixelRatio; }
  else fit = Math.min(fit, baseU);
  document.body.classList.toggle("kb-nofit", fit < KB_MIN_U);
  root.setProperty("--u-fit", Math.max(KB_MIN_U, fit) + "px");
}
