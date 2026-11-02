# How to work on typeTrainer (for AI agents)

## What to read first

This file says how to work with me. Everything else has its own file:

| Before you... | Read |
|---|---|
| start any task | `docs/PRODUCT.md`: what the product is, its principles, what is not built now |
| change code | `docs/CODE-RULES.md`: the stack, the architecture rules, comments |
| need to know where something is | `docs/HOW-THE-CODE-WORKS.md`: packages, modules, the API, the database |
| touch Learn, Climb or Freetype | `docs/HOW-THE-MODES-WORK.md`: how each mode picks what you type |
| change the interface | `docs/DESIGN-RULES.md`: how the screen looks and behaves |
| write any text the user sees | `docs/TEXT-RULES.md` |
| run, test or measure | `CONTRIBUTING.md` |
| add thesis material | `docs/thesis/README.md` |

Where they differ, this file wins, then `docs/PRODUCT.md`, then the others.

## Who you are working with

- I am not an experienced programmer. After every task, explain in simple
  words what you changed and why, so I understand every part of my code.
- Talk to me in Russian. Code, comments, commit messages and docs: English.
- Work in small steps. For anything bigger than one feature, show a short plan
  first and wait for my OK.
- Commits in your own branch are fine. `git push` and pull requests only when I
  say so.
- `main` is protected: changes reach it only through a pull request. I merge it
  myself. Never push to `main` directly.

## How we work

I test by feel, on my own machine, and I do not touch the terminal.

1. **You run the site.** Start and restart the local server yourself (the web
   files are built into the program, so a change needs a restart). I only
   refresh <http://localhost:3000>. Git pulls are yours too.
2. **First an opinion, then work.** On any request or mockup say what you think
   and what you would do better, and why. Build after my "ок". An idea outside
   the request is a proposal, not an action.
3. **One branch for one topic, one PR at the end,** when I say so. A GitHub
   issue is not required.
4. **Every PR description answers three things:** (a) what changed;
   (b) what else it affects (other modes, combinations of settings);
   (c) how it was checked: what was run, on what, with which numbers.
5. **A change to the typing screen is measured** before the PR, against
   `main`, with the numbers in the PR, and must not be worse. The canonical
   measurement: `node tools/browser/perf.mjs` (CONTRIBUTING.md): style recalc
   per key at full speed, key → caret start and the share of slow frames with
   the CPU slowed 6×. The goal: under 2 ms of style recalc per key for the
   screen itself (`perf.mjs --bare`), caret start ≤ 40 ms and slow frames
   ≤ 15% with everything on.
6. **Measure first, then change numbers.** No tuning without a measurement.
7. **Comments and docs never retell history.** They say what is true now;
   history lives in git.
8. **No tool for a needed check is not a reason to skip the check.** Say so.
9. **Docs do not multiply.** Every rule and fact has one home in the files
   listed under "What to read first"; other places link to it. No new files
   in `docs/` or the repo root without my decision. The exception I
   decided: the thesis files 01–08 in `docs/thesis/`.

Beyond orders I expect an engineer's position: point out when a change has
consequences outside its issue, offer simpler paths, say no with reasons
when a task leads somewhere worse. Initiative means a proposal; the scope
is always my decision.

## Before you say a task is done

1. The checks in `CONTRIBUTING.md` ("Test it", "Browser checks") all pass.
2. New engine logic has unit tests, including edge cases (no data yet, zero values).
3. Docs updated if behaviour or the API changed.
4. An interface change is checked in a browser at desktop width, and the
   stats screen also at phone width (`docs/DESIGN-RULES.md`, section 3).
5. A short summary for me: what changed, which files, how to check it in the browser.
