// Values for how typing feels.

export const FEEL = {
  caretGlideMs: 65,
  caretGlidePace: 0.6,
  caretGlideMinMs: 25,
  caretPaceKeys: 4,
  caretPaceResetMs: 400,
  caretGlideStepMs: 5,
  caretCurve: "cubic-bezier(.31, .16, .69, .84)",
  lineScrollMs: 120,
  resultHoldMs: 120,
  resultInMs: 120,
  resultRisePx: 12,

  keyPressMs: 90,
  keyPressScale: 0.96,
  keyMissMs: 200,
  keyMissAlpha: 0.4,

  streakHopMs: 180,
  streakHopPx: 4,
  streakHopScale: 1.3,

  caretFlinchMs: 120,
  caretFlinchScale: 0.7,
  caretShakePx: 2,

  markLine: 2,

  handScale: 0.55,
  handRoom: 1.05,
  fingerLiftPx: 8,
  nextKeyLiftPx: 3,
};

function applyFeel() {
  const root = document.documentElement.style;
  root.setProperty("--feel-caret-ms", FEEL.caretGlideMs + "ms");
  root.setProperty("--caret-curve", FEEL.caretCurve);
  root.setProperty("--feel-result-hold", FEEL.resultHoldMs + "ms");
  root.setProperty("--feel-result-in", FEEL.resultInMs + "ms");
  root.setProperty("--feel-result-rise", FEEL.resultRisePx + "px");
  root.setProperty("--feel-mark-line", FEEL.markLine + "px");
  root.setProperty("--feel-hand", String(FEEL.handScale));
  root.setProperty("--feel-next-lift", -FEEL.nextKeyLiftPx + "px");
  root.setProperty("--feel-key-press-ms", FEEL.keyPressMs + "ms");
  root.setProperty("--feel-key-press-scale", String(FEEL.keyPressScale));
  root.setProperty("--feel-hand-room", String(FEEL.handRoom));
}
applyFeel();
