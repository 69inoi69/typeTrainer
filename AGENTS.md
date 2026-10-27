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
- Do not run `git commit` or `git push` unless I ask. I commit myself.
- `main` is protected: changes reach it only through a pull request. When I ask
  you to commit, work in a separate branch, push it and open a pull request;
  I merge it myself. Never push to `main` directly.

## Current phase: cleanup

We are not adding features. We subtract, clean up and add checks, in small
pull requests. The queue lives in GitHub issues, in order, without dates.

1. **One PR = one issue.** Nothing beyond the issue, silently.
2. **An idea outside the issue is a proposal, not an action.** Write it as
   a comment or a draft issue and wait for my OK. Going a step further is
   allowed only marked "proposed beyond the task", only if it breaks
   nothing and is the natural next step.
3. **Every PR description answers three things:** (a) what changed;
   (b) what else it affects (other modes, themes, combinations of
   settings); (c) how it was checked: what was run, on what, with which
   numbers. "Checked" without that list does not count.
4. **A change to the typing screen is measured before and after**, with
   the numbers in the PR, and must not be worse than before. The canonical
   measurement: `node tools/browser/perf.mjs` (CONTRIBUTING.md): style
   recalc per key at full speed, key → caret start and the share of slow
   frames with the CPU slowed 6×. The goal of the performance work
   (issue #148), not a per-PR budget: under 2 ms of style recalc per key
   for the screen itself (`perf.mjs --bare`: no background, no keyboard;
   the keyboard is a thesis item and costs on top of it), caret start
   ≤ 40 ms and slow frames ≤ 15% with everything on.
5. **Measure first, then change numbers.** No tuning without a measurement.
6. **Comments never retell me.** Link the issue instead. A comment explains
   the current value; history lives in git and
   `docs/thesis/DEVELOPMENT-LOG.md`.
7. **I merge**, with green CI and point (c) of rule 3 filled in.
8. **No tool for a needed check is not a reason to skip the check.** Say
   so in the PR: "no tool for this, add one?"
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
