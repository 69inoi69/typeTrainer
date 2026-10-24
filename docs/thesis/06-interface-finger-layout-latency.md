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

The goal of issue #148: under 2 ms style recalc per key, caret start
≤ 40 ms, slow frames ≤ 15%.

Where the time goes (issue #148, 2026-10-24, perf.mjs Learn, median of 5
runs; each line turns one more part off):

| Typing screen | Style recalc / key | Key → caret start | Slow frames |
|---|---|---|---|
| everything on | 5.1 ms | 33 ms | 15% |
| no falling background | 4.0 ms | 30 ms | 11% |
| also no hand above the keyboard | 2.9 ms | 25 ms | 4–6% |
| also no keyboard | 1.9 ms | 18 ms | 2% |

The rest of the screen alone is 1.9 ms, so the 2 ms goal holds only with the
keyboard off. What each part costs is the browser updating the style of its
running animations on every frame (invalidation tracking in the Chromium
trace), not a mistake in the code: three changes that keep the look (touch
only the fingers and hands that change, keep the hidden hand laid out, the
sr-only hint as text) measured no better and were dropped. The
background stays moving during a round (owner's call). The hand card no
longer glides to the next key, it stands there at once (less movement
under the eyes; cost unchanged, 4.9 vs 5.0 ms).

To fill: the finger layout (how a key maps to a finger and a colour,
`web/keyboard.js`), the hand above the keyboard.
