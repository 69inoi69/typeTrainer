// Keys and buttons, routed to the modules that handle them.

import { $, el, S, introOpen, isTouch, focusText } from "./state.js";
import { requestFit, highlightNextKey, toggleKb } from "./keyboard.js";
import { refreshStats, renderStats, resetStatsPick } from "./stats.js";
import { fitText, placeCaret, handleChar, backspace, restartRound, setTyping, loadExercise, roundStarted, pauseRound, checkLayout } from "./typing.js";
import { checkCaps } from "./warn.js";
import { introKey } from "./intro.js";
import { switchLanguage } from "./languages.js";
import { profileOpen, closeProfile } from "./profile.js";
import { resultOpen, closeResult, settleResult } from "./result.js";
import { settingsOpen, openSettings, onSettingsClose, onGoalChange, onBgChange, onTypingLook, onSoundPick, setLength, setSetting } from "./settings.js";
import { setMode, refreshFreeplay, renderNav, setFreetypeList, setFreetypeVariant, toggledVariant } from "./modes.js";
import { openCustomText, hasCustomText } from "./customtext.js";
import { onBarPick, renderModeBar } from "./modebar.js";
import { renderLetters } from "./letters.js";
import { buildAmbient } from "./ambient.js";
import { renderPanel } from "./learnpanel.js";
import { keySound } from "./sound.js";
import { questOpen, questKey } from "./mascot.js";
import "./share.js";

window.addEventListener("resize", () => {
  buildAmbient();
  fitText();
  requestFit();
  placeCaret(true);
  if (S.view === "stats") { el.viewStats.classList.remove("grow"); renderStats(); }
});

// ---------- screens: typing / stats ----------
const statsOnly = isTouch();
document.body.classList.toggle("stats-only", statsOnly);
export function startView() {
  if (statsOnly) setView("stats");
}
let statsSeen = "";
function setView(name) {
  if (statsOnly) name = "stats";
  S.view = name;
  document.body.dataset.view = name;
  const stats = name === "stats";
  renderNav();
  if (stats) settleResult();
  el.viewType.hidden = stats;
  el.viewStats.hidden = !stats;
  const seen = JSON.stringify([S.mode, S.settings.length, S.lastStats?.sessionCount, S.climb?.sessionCount, S.freetype?.sessionCount, S.freetypeList]);
  el.viewStats.classList.toggle("grow", stats && seen !== statsSeen);
  if (stats) statsSeen = seen;
  if (stats) {
    resetStatsPick();
    setTyping(false);
    refreshStats().catch(console.error);
    renderStats();
  } else {
    fitText();
    requestFit();
    placeCaret(true);
    if (!resultOpen()) focusText();
  }
}
el.tabStats.addEventListener("click", (e) => { e.currentTarget.blur(); setView("stats"); });

// ---------- modes: learn / climb / freetype ----------
function chooseMode(m) {
  if (m !== S.mode) {
    if (resultOpen()) {
      setMode(m);
      el.live.classList.remove("final");
      closeResult();
    } else if (S.busy) {
      return;
    } else {
      setMode(m);
      el.live.classList.remove("final");
      loadExercise().catch(console.error);
    }
  }
  if (S.view !== "type") setView("type");
}
el.tabLearn.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("learn"); });
el.tabClimb.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("climb"); });
el.tabFreetype.addEventListener("click", (e) => { e.currentTarget.blur(); chooseMode("freetype"); });
document.getElementById("logo").addEventListener("click", () => {
  if (S.view !== "type") setView("type");
  else if (resultOpen()) closeResult();
});
async function barPick(pick) {
  if (S.busy && !resultOpen()) return;
  if (pick.edit || (pick.toggle === "custom" && S.freetypeVariant !== "custom" && !hasCustomText())) {
    openCustomText(() => barPick({ variant: "custom" }).catch(console.error));
    return;
  }
  if (pick.toggle) pick.variant = toggledVariant(S.freetypeVariant, pick.toggle);
  if (pick.variant !== undefined) await setFreetypeVariant(pick.variant);
  if (pick.list) await setFreetypeList(pick.list);
  if (pick.level) { S.climbLevel = pick.level; renderLetters(); }
  if (pick.length) {
    setLength(S.mode, pick.length);
    await Promise.all([refreshStats(), refreshFreeplay()]);
  }
  renderModeBar();
  el.live.classList.remove("final");
  if (resultOpen()) closeResult();
  else loadExercise().catch(console.error);
}
onBarPick(barPick);

onBgChange(buildAmbient);
onTypingLook(() => {
  fitText();
  requestFit();
  placeCaret(true);
  highlightNextKey();
});
onSoundPick((mode) => keySound(mode !== "errors", mode));

onGoalChange(() => {
  renderPanel();
  if (S.view === "stats") { el.viewStats.classList.remove("grow"); renderStats(); }
});

// ---------- input ----------
const COOLDOWN_MS = 300;
const lastPress = {};
function shortcut(e, name) {
  e.preventDefault();
  const now = performance.now();
  if (e.repeat || now - (lastPress[name] ?? -Infinity) < COOLDOWN_MS) return false;
  lastPress[name] = now;
  return true;
}

document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return;
  if (questOpen()) { questKey(e); return; }
  if (introOpen()) { introKey(e); return; }
  if (profileOpen()) {
    if (e.key === "Escape") { e.preventDefault(); closeProfile(); }
    return;
  }
  if (document.body.classList.contains("splashing")) return;
  if (e.key === "Escape") {
    if (!shortcut(e, "esc")) return;
    if (S.view === "type" && !resultOpen() && roundStarted()) pauseRound();
    openSettings();
    return;
  }
  const altGr = e.getModifierState?.("AltGraph");
  if (e.altKey && !e.ctrlKey && !e.metaKey && !altGr && e.code === "KeyK") {
    if (shortcut(e, "kb") && S.view === "type") toggleKb();
    return;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !altGr && e.code === "KeyB") {
    if (shortcut(e, "bg")) setSetting("bg", S.settings.bg === "off" ? "1" : "");
    return;
  }
  if (e.key === "Tab" && e.shiftKey) {
    if (!shortcut(e, "view")) return;
    setView(S.view === "type" ? "stats" : "type");
    return;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !altGr && /^Digit[1-9]$/.test(e.code)) {
    const l = S.languages[Number(e.code.slice(5)) - 1];
    if (l && shortcut(e, "lang")) switchLanguage(l.id);
    return;
  }
  if (resultOpen()) {
    if (e.key === "Enter" || e.key === "Tab") { if (shortcut(e, "tab")) closeResult(); }
    else if (e.key.length === 1) e.preventDefault();
    return;
  }
  if (S.view !== "type") return;
  if (e.key === "Tab") { if (shortcut(e, "tab")) restartRound(); return; }
  if (e.key === "Backspace") {
    e.preventDefault(); focusText(); hidePointer(); backspace(e.ctrlKey || e.altKey);
    keyBackspace = true;
    requestAnimationFrame(() => { keyBackspace = false; });
    return;
  }
  if (e.repeat) { e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey || e.altKey) && !altGr) return;
  if (e.key.length !== 1) return;
  e.preventDefault();
  focusText();
  hidePointer();
  handleChar(e.key);
});

// ---------- mouse pointer: hidden while typing, back on a real move ----------
let pointerHidden = false, lastX = -1, lastY = -1;
function hidePointer() {
  if (pointerHidden) return;
  pointerHidden = true;
  document.documentElement.classList.add("no-pointer");
}
addEventListener("pointermove", (e) => {
  if (e.screenX === lastX && e.screenY === lastY) return;
  lastX = e.screenX; lastY = e.screenY;
  if (!pointerHidden) return;
  pointerHidden = false;
  document.documentElement.classList.remove("no-pointer");
}, { passive: true });

addEventListener("blur", pauseRound);
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseRound(); else checkLayout(); });
addEventListener("focus", checkLayout);
for (const ev of ["keydown", "keyup", "mousemove", "mousedown"]) addEventListener(ev, checkCaps, { passive: true });

const SENTINEL = " ";
let keyBackspace = false;
function resetInput() {
  el.input.value = SENTINEL;
  try { el.input.setSelectionRange(SENTINEL.length, SENTINEL.length); } catch {}
}
el.input.addEventListener("input", (e) => {
  const v = el.input.value;
  if (v.length < SENTINEL.length) {
    if (!keyBackspace) backspace(e.inputType === "deleteWordBackward");
  } else {
    for (const ch of v.startsWith(SENTINEL) ? v.slice(SENTINEL.length) : v) handleChar(ch);
  }
  keyBackspace = false;
  resetInput();
});
el.input.addEventListener("focus", resetInput);
resetInput();

let tapClosedPanel = false;
onSettingsClose(() => { lastPress.esc = performance.now(); if (S.view === "type" && !resultOpen() && !isTouch()) focusText(); });
document.addEventListener("pointerdown", () => {
  tapClosedPanel = settingsOpen() || profileOpen();
}, true);
el.textBox.addEventListener("click", () => {
  if (resultOpen() || tapClosedPanel) return;
  el.input.focus({ preventScroll: true }); focusText();
});
el.input.addEventListener("blur", () => { if (isTouch()) el.textBox.classList.add("blurred"); });
