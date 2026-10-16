// How typing FEELS: every knob of the small responses to a keypress, in one
// place. Tuning the feel means changing a number here, not a redesign
// (issue #18: the owner types, says "more" or "less", one number changes).
// The CSS reads the same values as custom properties (--feel-*), set below.
// None of this changes what is measured or sent to the server.
// Layer: bottom. Imports nothing.
// Used by: keyboard.js (key dip, red tint, hand size), typing.js (caret
// flinch), and style.css (caret glide, word fade, line scroll, settle) through the --feel-* properties.
// To add a knob: a field in FEEL with its unit and what "more" does, then
// either read FEEL.x in the JavaScript or add a root.setProperty line below
// and use var(--feel-x) in style.css.

export const FEEL = {
  // Speed of everything that moves while you type (owner, 2026-10-16:
  // "as if smeared with honey", wants it snappy). Lower = snappier.
  caretGlideMs: 35,         // the caret sliding to the next letter (0 = jumps)
  wordInMs: 90,             // a newly shown word fading in (0 = appears at once)
  lineScrollSmooth: false,  // the text moving up a line: false = at once

  // A letter typed right "settles": it starts slightly brighter (a stronger
  // glow) and calms down to the normal text colour. 0 ms = off.
  charSettleMs: 80,        // how long the settle takes
  charSettleGlow: 16,       // glow at the start, px (the normal glow is 10)

  // The key on the virtual keyboard answers a press: a short, soft dip.
  keyPressMs: 90,           // duration of the dip
  keyPressScale: 0.96,      // how deep it dips (1 = no dip)
  // A wrong key: a quick red tint, a hint rather than an alarm.
  keyMissMs: 200,           // duration of the tint
  keyMissAlpha: 0.4,        // strength of the red at the start (0..1)

  // The caret flinches on a mistake: it shrinks for an instant and comes
  // back; its glide to the next letter is not touched.
  caretFlinchMs: 70,        // duration (about 4 frames)
  caretFlinchScale: 0.7,    // height at the start of the flinch (1 = none)

  // How the three kinds of mistake look (style.css .bad / .miss / .extra):
  // wrong = red letter; skipped = dim with a dotted underline;
  // extra = struck through. Thickness of those lines, px.
  markLine: 2,

  // The hands above the keyboard (issue #19): the finger to use is the main
  // signal, the key itself is only hinted.
  handScale: 1.4,           // hand width in keys: 2 * handScale (1 = the old size)
  fingerLiftPx: 8,          // how far the finger to use lifts
  fingerGlowPx: 7,          // its soft glow: a see-through outline, in the hand drawing's units
  nextKeyTint: 38,          // how strongly the next key takes its finger colour, % (100 = solid)
};

// The CSS custom properties: style.css uses var(--feel-...).
const root = document.documentElement.style;
root.setProperty("--feel-caret-ms", FEEL.caretGlideMs + "ms");
root.setProperty("--feel-word-in-ms", FEEL.wordInMs + "ms");
root.setProperty("--feel-scroll", FEEL.lineScrollSmooth ? "smooth" : "auto");
root.setProperty("--feel-settle-ms", FEEL.charSettleMs + "ms");
root.setProperty("--feel-settle-glow", FEEL.charSettleGlow + "px");
root.setProperty("--feel-mark-line", FEEL.markLine + "px");
root.setProperty("--feel-hand", String(FEEL.handScale));
root.setProperty("--feel-finger-lift", -FEEL.fingerLiftPx + "px");
root.setProperty("--feel-finger-glow", String(FEEL.fingerGlowPx));
root.setProperty("--feel-next-tint", FEEL.nextKeyTint + "%");
