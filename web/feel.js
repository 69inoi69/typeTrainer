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

  markLine: 2,

  handScale: 0.55,
  handRoom: 1.05,
  fingerLiftPx: 8,
};

function applyFeel() {
  const root = document.documentElement.style;
  root.setProperty("--feel-caret-ms", FEEL.caretGlideMs + "ms");
  root.setProperty("--caret-curve", FEEL.caretCurve);
  root.setProperty("--feel-mark-line", FEEL.markLine + "px");
  root.setProperty("--feel-hand", String(FEEL.handScale));
  root.setProperty("--feel-hand-room", String(FEEL.handRoom));
}
applyFeel();
