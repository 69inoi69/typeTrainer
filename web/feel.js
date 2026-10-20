// How typing FEELS: every knob of the small responses to a keypress, in one
// place. Tuning the feel means changing a number here, not a redesign
// (issue #18: the owner types, says "more" or "less", one number changes).
// The CSS reads the same values as custom properties (--feel-*), set below.
// None of this changes what is measured or sent to the server.
// Layer: bottom. Imports nothing.
// Used by: keyboard.js (red tint, hand size), typing.js (caret flinch and
// breath, line scroll), and style.css (caret glide, the lift and dip of the
// next key, the lift of the finger) through the --feel-* properties.
// Speed rule (owner, 2026-10-18, "as smooth as monkeytype"): what moves on
// every key only moves (translate, transform, opacity of a whole element),
// which the graphics card does without the page being painted again; no
// glows or colour fades on every key.
// To add a knob: a field in FEEL with its unit and what "more" does, then
// either read FEEL.x in the JavaScript (at the moment it is used, not once at
// load, so the tuning panel changes it live) or add a root.setProperty line
// to applyFeel below and use var(--feel-x) in style.css. To make it tunable
// on the page, add a row to KNOBS in tune.js.
// The hidden tuning panel (tune.js, "?tune" in the address) changes these
// values while you type, to pick them by eye.

export const FEEL = {
  // Everything that moves while you type: smooth, but it starts moving at
  // once (owner, 2026-10-16: first "honey", then "smooth, but as responsive
  // as possible"). Lower = snappier.
  // The caret, tried in turn (owner, 2026-10-18): 70 ms on a very steep
  // curve (73% of the way in the first frame, then a crawl: it read as a low
  // frame rate); monkeytype's "medium", 100 ms even ("oily"); a step-and-
  // settle curve at 80 and 55 ms ("it lags behind the letters"); then
  // monkeytype's "smooth caret: fast", 85 ms on its almost even in-out
  // curve (style.css --caret-curve): smooth, but still behind the typed
  // letters (owner, 2026-10-18). Now that curve in 60 ms: 24 / 57 / 87 /
  // 100% at 60 frames a second. A new key starts a new glide from where the
  // caret is, so fast typing reads as one steady movement.
  caretGlideMs: 60,         // the caret sliding to the next letter (0 = jumps)
  // the shape of that glide (CSS timing function): monkeytype's inOut(1.25),
  // matched within 0.2%, almost even; also carries the streak badge
  caretCurve: "cubic-bezier(.31, .16, .69, .84)",
  lineScrollMs: 120,        // the text moving up a line (0 = at once)
  // After the last letter of a round, the finished text stays this long
  // before the result comes: the caret reaches the end and the last letter
  // turns white first (owner, 2026-10-19: "the result starts before the last
  // letter shows"). The round's time still ends at that key: this wait is
  // not in the speed.
  resultHoldMs: 250,
  // During that wait the finished text fades out (its last part, after the
  // caret has arrived), then the result comes in: it fades in while rising
  // a little (owner, 2026-10-19: a plain 200 ms fade read as no transition).
  resultInMs: 320,          // the result coming in (0 = at once)
  resultRisePx: 12,         // how far it rises while it comes in (0 = only fades)

  // The key on the virtual keyboard answers a press: as its light goes
  // out it sinks a little, a short, soft dip (style.css .lit).
  keyPressMs: 90,           // duration of the dip
  keyPressScale: 0.96,      // how deep it dips (1 = no dip)
  // A wrong key: a quick red tint, a hint rather than an alarm.
  keyMissMs: 200,           // duration of the tint
  keyMissAlpha: 0.4,        // strength of the red at the start (0..1)

  // The caret flinches on a mistake: it shrinks, turns red and shakes for
  // an instant, then comes back; its glide to the next letter is not touched.
  caretFlinchMs: 120,       // duration (about 7 frames)
  caretFlinchScale: 0.7,    // height at the start of the flinch (1 = none)
  caretShakePx: 2,          // how far it shakes to each side (0 = no shake)
  // At rest the caret breathes (fades out and in, softly) instead of a hard
  // blink; it starts this long after the last key, so it is solid while you type.
  caretBreathMs: 1100,      // one breath, out and in
  caretBreathDelayMs: 650,  // quiet time before it starts

  // How the three kinds of mistake look (style.css .bad / .miss / .extra):
  // wrong = red letter; skipped = dim with a dotted underline;
  // extra = struck through. Thickness of those lines, px.
  markLine: 2,

  // The hands above the keyboard (issue #19): the finger to use is the main
  // signal, the key itself is only hinted.
  handScale: 1.4,           // hand width in keys: 2 * handScale (1 = the old size)
  fingerLiftPx: 8,          // how far the finger to use lifts, in units of the hand drawing (100 = its width)
  fingerGlowPx: 0,          // a see-through outline around it, in the hand drawing's units (0 = none; owner, 2026-10-18: it looked like double vision)
  // The hands rest on the top edge of the keyboard, as real hands over the
  // keys: they overlap it by this part of a key (their wrists fade out
  // anyway). It also leaves more height for bigger keys.
  handOverlap: 0.42,        // in keys (0 = the hands stand above the keyboard)
  // The next key stands out by brightness, not by colour: side vision sees
  // light and movement, not hues (owner, 2026-10-18: it got lost while typing).
  nextKeyLiftPx: 3,         // how far the next key rises above the others (0 = stays flat)
};

// The CSS custom properties: style.css uses var(--feel-...). Set at load and
// again by the tuning panel after it changes FEEL.
export function applyFeel() {
  const root = document.documentElement.style;
  root.setProperty("--feel-caret-ms", FEEL.caretGlideMs + "ms");
  root.setProperty("--caret-curve", FEEL.caretCurve);
  root.setProperty("--feel-result-hold", FEEL.resultHoldMs + "ms");
  root.setProperty("--feel-result-in", FEEL.resultInMs + "ms");
  root.setProperty("--feel-result-rise", FEEL.resultRisePx + "px");
  root.setProperty("--feel-mark-line", FEEL.markLine + "px");
  root.setProperty("--feel-hand", String(FEEL.handScale));
  root.setProperty("--feel-finger-lift", String(-FEEL.fingerLiftPx));   // in units of the hand drawing (style.css --hu)
  root.setProperty("--feel-finger-glow", String(FEEL.fingerGlowPx));
  root.setProperty("--feel-next-lift", -FEEL.nextKeyLiftPx + "px");
  root.setProperty("--feel-key-press-ms", FEEL.keyPressMs + "ms");
  root.setProperty("--feel-key-press-scale", String(FEEL.keyPressScale));
  root.setProperty("--feel-hand-overlap", String(FEEL.handOverlap));
}
applyFeel();
