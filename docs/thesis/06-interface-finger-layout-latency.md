# 6. Interface, finger layout, input latency

Thesis item 6: the JavaScript interface, the finger layout shown on the
keyboard, and input latency. The modules are listed in
[docs/HOW-THE-CODE-WORKS.md](../HOW-THE-CODE-WORKS.md) ("Frontend modules"); the
keyboard layout is data in `data/layouts/`. The keyboard with the hands
is a thesis item: it is made cheap, never cut (docs/PRODUCT.md).

## Input latency

Measured with `node tools/browser/perf.mjs` (CONTRIBUTING.md): style recalc
per key at full speed, key → caret start and slow frames (> 25 ms) with the
CPU slowed 6× (a weak laptop).

| Typing screen, median of 3, 2026-11-02 | Style recalc / key | Key → caret start | Slow frames |
|---|---|---|---|
| Learn, keyboard on | 1.4 ms | 18 ms | 1% |
| Freetype, no keyboard | 0.7 ms | 17 ms | 1% |

The goal: under 2 ms style recalc per key for the screen itself
(`perf.mjs --bare`), caret start ≤ 40 ms, slow frames ≤ 15%. Rules that keep
it there: `docs/CODE-RULES.md`, "Architecture rules".

The hand above the keyboard is a picture, not a live model: for every finger
to light, the hand is drawn once from the SVG model, with that finger lifted
and coloured, and turned into a PNG; a key swaps the `src` of one `<img>` per
hand. The picture is only shown, not redrawn, and the card stands over the next
key at once instead of gliding there.

To fill: the finger layout (how a key maps to a finger and a colour,
`web/keyboard.js`), the hand above the keyboard.
