// How typing FEELS: every knob of the small responses to a keypress, in one
// place. Tuning the feel means changing a number here, not a redesign
// (issue #18: the owner types, says "more" or "less", one number changes).
// The CSS reads the same values as custom properties (--feel-*), set below.
// None of this changes what is measured or sent to the server.
// Layer: bottom. Imports nothing.
// Used by: keyboard.js (key dip, red tint, finger tap, hand size), typing.js
// (caret flinch and breath, line scroll), and style.css (caret glide, word
// fade, settle) through the --feel-* properties.
// To add a knob: a field in FEEL with its unit and what "more" does, then
// either read FEEL.x in the JavaScript or add a root.setProperty line below
// and use var(--feel-x) in style.css.

export const FEEL = {
  // Everything that moves while you type: smooth, but it starts moving at
  // once (owner, 2026-10-16: first "honey", then "smooth, but as responsive
  // as possible"). Lower = snappier.
  // The caret (owner, 2026-10-18): 70 ms on a very steep curve went 73% of
  // the way in the first frame, then crawled: it read as a low frame rate.
  // Monkeytype's 100 ms even glide (12% in the first frame) was smooth but
  // "oily": you did not feel each letter being passed. Now in between: about
  // half the way in the first frame (each press is a clear step), the rest
  // settles in 3 frames (54 / 81 / 94 / 100%). The curve is in style.css.
  caretGlideMs: 80,         // the caret sliding to the next letter (0 = jumps)
  wordInMs: 90,             // a newly shown word fading in (0 = appears at once)
  lineScrollMs: 120,        // the text moving up a line (0 = at once)

  // A letter typed right "settles": it starts a little warmer (a touch of
  // the gold, and a glow on the dark page) and calms down to the text
  // colour. Colour only: a letter is an inline <span>, it cannot scale
  // without breaking the lines. 0 ms = off.
  charSettleMs: 110,        // how long the settle takes
  charSettleGlow: 12,       // glow at the start, px (dark theme only)

  // The key on the virtual keyboard answers a press: a short, soft dip.
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
  fingerLiftPx: 8,          // how far the finger to use lifts
  fingerGlowPx: 0,          // a see-through outline around it, in the hand drawing's units (0 = none; owner, 2026-10-18: it looked like double vision)
  // The finger that presses a key taps down a little with it.
  fingerTapPx: 3,           // how far it moves down (0 = off)
  fingerTapMs: 110,         // duration
  // The hands rest on the top edge of the keyboard, as real hands over the
  // keys: they overlap it by this part of a key (their wrists fade out
  // anyway). It also leaves more height for bigger keys.
  handOverlap: 0.42,        // in keys (0 = the hands stand above the keyboard)
  nextKeyTint: 38,          // how strongly the next key takes its finger colour, % (100 = solid)
};

// The CSS custom properties: style.css uses var(--feel-...).
const root = document.documentElement.style;
root.setProperty("--feel-caret-ms", FEEL.caretGlideMs + "ms");
root.setProperty("--feel-word-in-ms", FEEL.wordInMs + "ms");
root.setProperty("--feel-settle-ms", FEEL.charSettleMs + "ms");
root.setProperty("--feel-settle-glow", FEEL.charSettleGlow + "px");
root.setProperty("--feel-mark-line", FEEL.markLine + "px");
root.setProperty("--feel-hand", String(FEEL.handScale));
root.setProperty("--feel-finger-lift", -FEEL.fingerLiftPx + "px");
root.setProperty("--feel-finger-glow", String(FEEL.fingerGlowPx));
root.setProperty("--feel-next-tint", FEEL.nextKeyTint + "%");
root.setProperty("--feel-hand-overlap", String(FEEL.handOverlap));
