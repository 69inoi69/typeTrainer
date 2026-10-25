# 6. Interface, finger layout, input latency

Thesis item 6: the JavaScript interface, the finger layout shown on the
keyboard, and input latency. The modules are listed in
[docs/ARCHITECTURE.md](../ARCHITECTURE.md) ("Frontend modules"); the
keyboard layouts are data in `data/layouts/`. The keyboard with the hands
is a thesis item: it is made cheap, never cut (AGENTS.md).

## Input latency

Measured with `node tools/browser/perf.mjs` (CONTRIBUTING.md): style recalc
per key at full speed, key → caret start and slow frames (> 25 ms) with the
CPU slowed 6× (a weak laptop), in headless Chromium.

| When | Style recalc / key | Key → caret start | Slow frames | Note |
|---|---|---|---|---|
| before PR #142 (2026-10-23, by hand) | 17.5 ms | 124 ms | 30% | `:has()` rules restyled the whole screen on every key |
| after PR #142 (by hand) | 5.5 ms | 35 ms | 14% | state classes on `<body>` instead of `:has()` |
| main, 2026-10-24 (perf.mjs, Learn) | 5.0 ms | 32 ms | 12% | the baseline for issue #148 |
| main, 2026-10-25 (perf.mjs, Learn, median of 5) | 5.1 ms | 37 ms | 18% | after issue #150, another machine (issue #153, below) |

The goal of issue #148: under 2 ms style recalc per key for the screen
itself (`perf.mjs --bare`), caret start
≤ 40 ms, slow frames ≤ 15%.

Where the time goes (issue #148, 2026-10-24, perf.mjs Learn, median of 5
runs; each line turns one more part off):

| Typing screen | Style recalc / key | Key → caret start | Slow frames |
|---|---|---|---|
| everything on | 5.1 ms | 33 ms | 15% |
| no falling background | 4.0 ms | 30 ms | 11% |
| also no hand above the keyboard | 2.9 ms | 25 ms | 4–6% |
| also no keyboard | 1.9 ms | 18 ms | 2% |

The screen alone (`perf.mjs --bare`) is 1.9 ms, so the 2 ms goal is set for
it; the keyboard and the background cost on top (AGENTS.md rule 4). Each
part's cost is the browser restyling its elements on every key and every
frame of a running animation (invalidation tracking in the Chromium trace).
Tried and dropped, measured no better: touching only the fingers that
change, keeping the hidden hand laid out, a pre-drawn lit finger on its own
layer, the sr-only finger hint as text. The background stays moving during
a round (owner's call).

What worked for the hand: it is no longer a live model (ten fingers, each a
layer that lifts with a transition) but a picture. For every finger to
light, the hand is drawn once from the SVG model, with that finger lifted
and coloured, and turned into a PNG; a key swaps the `src` of one `<img>`
per hand. As an SVG picture it was redrawn on every swap and the caret
started ~3 ms later; as a PNG it is only shown. The hand card also stands
over the next key at once instead of gliding there (less movement under the
eyes; no cost change on its own).

| Learn, perf.mjs, median of 5 | Style recalc / key | Key → caret start | Slow frames |
|---|---|---|---|
| before (live hand, gliding card) | 5.0–5.1 ms | 33–34 ms | 16–18% |
| after (hand as pictures) | 4.2–4.4 ms | 30–31 ms | 11–15% |
| hand alone, background off: before / after | ~1.0 / ~0.3 ms | | |
| `--bare` (no background, no keyboard) | 1.9 ms | 20 ms | 2% |

Recount on 2026-10-25 (issue #153), main at `5dd45a6`, perf.mjs median
of 5 runs. The cloud machine is not the one above, so only numbers taken
on the same machine at the same time compare: main before the Learn
screen work of issue #150 (`c9a2481`) and after it, run in turns:

| Typing screen | Style recalc / key | Key → caret start | Slow frames |
|---|---|---|---|
| Learn, keyboard on (letters still opening) | 5.1 ms | 37 ms | 18% |
| `--bare` (no background, no keyboard) | 1.9 ms | 18 ms | 3% |
| Climb (no keyboard, background on) | 3.0 ms | 20 ms | 2% |
| Learn before #150 / after, three turns each | 5.1–5.3 / 4.9–5.2 ms | 36–38 / 34–40 ms | |

So issue #150 changed nothing measurable. Against the goal of #148: the
screen itself is under 2 ms and the caret starts within 40 ms; slow frames
with everything on (18%) are above 15% on this machine. Since #150 the
keyboard is only on while Learn opens letters; Climb, Freetype and Learn
after the last letter type at the Climb line.

To fill: the finger layout (how a key maps to a finger and a colour,
`web/keyboard.js`), the hand above the keyboard.
