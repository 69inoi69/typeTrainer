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

To fill: the finger layout (how a key maps to a finger and a colour,
`web/keyboard.js`), the hand above the keyboard.
