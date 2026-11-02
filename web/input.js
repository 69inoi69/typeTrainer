// Keys and buttons, routed to the modules that handle them.

import { $, el, S, introOpen, isTouch, focusText } from "./state.js";
import { requestFit, highlightNextKey, toggleKb } from "./keyboard.js";
import { refreshStats, renderStats, resetStatsPick } from "./stats.js";
import { fitText, placeCaret, handleChar, backspace, restartRound, setTyping, loadExercise, roundStarted, pauseRound, checkLayout } from "./typing.js";
import { checkCaps } from "./warn.js";
import { introKey } from "./intro.js";
import { profileOpen, closeProfile } from "./profile.js";
import { resultOpen, closeResult } from "./result.js";
import { settingsOpen, openSettings, onSettingsClose, onGoalChange, onTypingLook, onSoundPick, setLength, setSetting } from "./settings.js";
import { setMode, refreshFreeplay, renderNav, setFreetypeList, setFreetypeVariant } from "./modes.js";
import { openCustomText, hasCustomText } from "./customtext.js";
import { onBarPick, renderModeBar } from "./modebar.js";
import { renderLetters } from "./letters.js";
import { renderPanel } from "./learnpanel.js";
import { keySound } from "./sound.js";
import { questOpen, questKey } from "./mascot.js";
import "./share.js";

window.addEventListener("resize", () => {
  fitText();
  requestFit();
  placeCaret(true);
  if (S.view === "stats") renderStats();
});

// ---------- screens: typing / stats ----------
const statsOnly = isTouch();
document.body.classList.toggle("stats-only", statsOnly);
export function startView() {
  if (statsOnly) setView("stats");
}
function setView(name) {
  if (statsOnly) name = "stats";
  S.view = name;
  document.body.dataset.view = name;
  const stats = name === "stats";
  renderNav();
  el.viewType.hidden = stats;
  el.viewStats.hidden = !stats;
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
      closeResult();
    } else if (S.busy) {
      return;
    } else {
      setMode(m);
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
  if (pick.edit || (pick.variant === "custom" && !hasCustomText())) {
    openCustomText(() => barPick({ variant: "custom" }).catch(console.error));
    return;
  }
  if (pick.variant !== undefined) await setFreetypeVariant(pick.variant);
  if (pick.list) await setFreetypeList(pick.list);
  if (pick.level) { S.climbLevel = pick.level; renderLetters(); }
  if (pick.length) {
    setLength(S.mode, pick.length);
    await Promise.all([refreshStats(), refreshFreeplay()]);
  }
  renderModeBar();
  if (resultOpen()) closeResult();
  else loadExercise().catch(console.error);
}
onBarPick(barPick);

onTypingLook(() => {
  fitText();
  requestFit();
  placeCaret(true);
  highlightNextKey();
});
onSoundPick((mode) => keySound(mode !== "errors", mode));

onGoalChange(() => {
  renderPanel();
  if (S.view === "stats") renderStats();
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
  if (e.key === "Tab" && e.shiftKey) {
    if (!shortcut(e, "view")) return;
    setView(S.view === "type" ? "stats" : "type");
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
