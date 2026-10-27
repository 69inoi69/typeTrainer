# 2. Requirements

Thesis item 2: functional and non-functional requirements. A first list,
taken from what the app does now (AGENTS.md and the code); the final
list is fixed when the cleanup phase ends. Each line says where it is met.

## Functional

- F1. Learn teaches from zero: letters open one by one from the home row;
  the algorithm alone chooses the words (ALGORITHM.md sections 6-7).
- F2. Only real words of the language are typed (data/langs, ALGORITHM.md
  section 11).
- F3. Every keypress is measured per letter: mistakes and time
  (ALGORITHM.md sections 3-4).
- F4. Climb: levels of ever rarer words, judged by accuracy (section 12).
- F5. Freetype: plain typing of words, long words, sentences or your own
  text; nothing adapts (section 13).
- F6. Statistics per mode, list and round length, never mixed
  (`web/stats.js`).
- F7. Accounts: sign up, log in, log out; progress kept per user and
  language (ARCHITECTURE.md).
- F8. An on-screen keyboard shows the next key and the finger to use
  (06-interface-finger-layout-latency.md).
- F9. Export and import of all progress as a file.
- F10. A hidden control group (`?group=random`) for a study
  (08-testing-and-verification.md).

## Non-functional

- N1. Typing latency: the caret starts within 40 ms of a key on a weak
  laptop (CPU 6× slower); measured by `tools/browser/perf.mjs`
  (06-interface-finger-layout-latency.md).
- N2. A desktop with a physical keyboard; phones show only stats and the
  account.
- N3. Server: Go standard library only (plus the PostgreSQL driver); no
  frontend framework, no build step (AGENTS.md, Stack).
- N4. Storage behind one interface, memory or PostgreSQL, both passing the
  same tests (07-postgresql.md).
- N5. Passwords and login tokens stored only as hashes (internal/auth).
- N6. The same code runs as a server and as WebAssembly on GitHub Pages.
- N7. Every change is checked automatically: gofmt, vet, Go tests, the
  WebAssembly build and browser checks on every pull request.
