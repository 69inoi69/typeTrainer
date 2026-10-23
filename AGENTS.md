# Project rules for AI agents

## What this is

typeTrainer is a touch-typing trainer that looks and feels like Monkeytype
and teaches like keybr: it tracks every letter's mistakes and speed and
builds the next words around your weak letters. Real words only. It aims to
be a real alternative to both, not a demo.

The product comes first. It is also an engineering thesis (2027), a side
quest: its material collects in `docs/thesis/`, one file per item of the
thesis plan (`01-...md` to `08-...md`, issue #146). A PR that yields
material for an item (a number, a measurement, a decision) adds a few lines
to that item's file. Product docs stay where they are; thesis files link to
them instead of copying. Thesis notes do not limit what we build: if the
code and a thesis note disagree, the code and `docs/` win. What the thesis
needs does limit what we cut: the adaptive algorithm, the keyboard with the
finger layout, input latency, PostgreSQL and the adaptive-vs-random check
are thesis items and stay.

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
   measurement: the script in `tools/perf/` (issue #144; until it exists,
   the same metrics by hand), CPU slowed 6×, metrics: style recalc per
   key, key → caret start, share of slow frames. The goal of the
   performance work (issue #148), not a per-PR budget: under 2 ms of
   style recalc per key, caret start ≤ 40 ms, slow frames ≤ 15%.
5. **Measure first, then change numbers.** No tuning without a measurement.
6. **Comments never retell me.** Link the issue instead. A comment explains
   the current value; history lives in git and
   `docs/thesis/DEVELOPMENT-LOG.md`.
7. **I merge**, with green CI and point (c) of rule 3 filled in.
8. **No tool for a needed check is not a reason to skip the check.** Say
   so in the PR: "no tool for this, add one?"
9. **Docs do not multiply.** No new files in `docs/` or the repo root
   without my decision; information goes into the existing files. One
   rule, one home; other places link to it. If a new file seems needed,
   propose it first. The exception I decided: the thesis files 01–08 in
   `docs/thesis/`.

Beyond orders I expect an engineer's position: point out when a change has
consequences outside its issue, offer simpler paths, say no with reasons
when a task leads somewhere worse. Initiative means a proposal; the scope
is always my decision.

## Guidelines

Before changing a feature or the interface, read `docs/GUIDELINES.md`
(layout, hierarchy, interaction, accessibility, implementation, testing,
scope) and `docs/UI-TEXT.md` (every text the user sees). They are principles
to apply with judgment; the rules in this file win where they differ.

## Stack (do not change without asking)

- Backend: Go 1.25+, **standard library only** (`net/http`), no frameworks, no
  third-party modules. The single exception: the PostgreSQL driver
  (`github.com/jackc/pgx/v5`), used only through the standard `database/sql`.
  Ask before adding any other module.
- Frontend: plain HTML + CSS + vanilla JavaScript. **No frameworks, no npm,
  no build step.** Files in `web/` are served by the Go server. "No npm" is
  about the app: Node is allowed in `tools/` and CI (browser tests,
  latency measuring), never in what the app serves.
- Storage: behind the `storage.Store` interface. `MemoryStore` by default,
  `PostgresStore` when `DATABASE_URL` is set. Both pass the same tests
  (`internal/storage/store_test.go`); a new `Store` method needs both and a
  test there. Table changes go into a new numbered file in
  `internal/storage/migrations/`, never into an old one.
- Four languages: English, Polish, Ukrainian, Russian. Language data lives in
  `data/` (`languages.json`, `layouts/`, `langs/<id>/words.txt`), not in code.
  **Only English is shown for now:** Polish, Ukrainian and Russian are
  `"hidden": true` in `languages.json` until the English version is
  polished; their data stays and keeps passing the tests.
- Development machine: Windows, PowerShell.

## Architecture rules

- `internal/engine` is pure logic: it must not import anything about HTTP,
  JSON handlers or databases.
- All data access goes through `storage.Store`.
- Every tunable number lives in `internal/config/config.go`. No magic numbers
  in the logic.
- All API routes start with `/api/v1/`.
- Keyboard layouts are data (`data/layouts/*.json`), not code.
- Keep keypress handling in `web/typing.js` light: only flip classes on the 1-2
  letters that changed. The only layout read is the caret position, done once
  per animation frame (`requestAnimationFrame`). Animations use CSS transitions
  or the Web Animations API (`element.animate`), never JS timers. Typing
  latency is the product: measure it after touching this path (rule 4 of
  "Current phase").
- The frontend is native ES modules with a three-layer import rule (top of
  `web/state.js`, checked by `webmodules_test.go`): imports only go down, no
  cycles. State shared by several modules lives in the object `S`.
- Every API route except `/languages` and `/auth/*` takes `?lang=`; every
  `Store` method takes the user id and the language id. Each user has their
  own progress in each language; a request without a login is this
  browser's guest (cookie `tt_guest`, `storage.IsGuest`). Password and token
  handling lives in `internal/auth` (standard library only); never store a
  password or a login token itself, only its hash.
- Visual rewards (confetti, bumps, toasts) live in `web/fx.js` and must never
  change what is measured or sent to the server. Tab starts a new round, as
  on Monkeytype: the dropped round is not saved, its presses already sent
  stay learned.
- Every text the user sees follows `docs/UI-TEXT.md` and lives in
  `web/i18n.js`; decide yourself what text a new feature needs. While only
  English is shown, new and changed texts are written in English only (the
  other blocks fall back to English). Never hard-code interface text in the
  other `.js` files or `index.html`; use `t("key")` or `data-i18n="key"`. The
  one exception is `web/file-check.js` (the page opened from disk, where
  modules cannot load). Finger names there are in the form the hint
  sentence needs (Polish/Ukrainian/Russian instrumental case).
- Word lists are generated by `tools/wordlists/build.py` (Python, a data tool,
  not part of the app), Freetype's long list (`free.txt`) by
  `tools/wordlists/free.py`, the sentences by `tools/sentences/build.py`.
  Change the block lists and rerun the script instead of editing the lists
  by hand: the next rerun would undo a hand edit.
- The app runs in two ways from the same code: a normal server (`main.go`)
  and WebAssembly on GitHub Pages (`main_wasm.go`). Shared setup goes in
  `setup.go`. Do not add anything that only works with a real server (files on
  disk, background goroutines tied to HTTP) without telling me.
- Comments follow `docs/COMMENTING.md`: why, not what; every file says what
  it is for and how it connects; extension points say "To add ...".

Details: `docs/ARCHITECTURE.md`.

## Product principles (ask before changing)

- **Beginners first.** Learn is the main screen.
- **The server with PostgreSQL is the main version.** GitHub Pages is a demo
  snapshot and need not have every feature.
- **The keyboard with the hands stays.** It is part of the thesis: make it
  cheap, hide it where it is not needed, never cut it.
- **Real words only.** No generated letter combinations like keybr's.
- **A computer keyboard is needed to practise.** Phones and tablets show only
  the stats and the account: thumbs on glass would skew the letter model.
  The phone layout of the typing screen is not maintained.
- **Three modes, open to everyone, kept apart.** *Learn* teaches from zero:
  letters open one by one from the home row, and the algorithm alone decides
  what to practise (no difficulty switches, no "open all letters").
  *Climb* is for people who can already type: levels of ever rarer words,
  judged by accuracy. *Freetype* is plain typing: nothing adapts. Climb and
  Freetype never touch Learn's data, and every mode, list and round length
  keeps its own history: rounds of different kinds are never mixed in one
  chart or record. How each mode works: `docs/ALGORITHM.md`.
- **Settings change how much and how it looks, never what is practised.**
  What a round is belongs to each mode and sits in the round bar above the
  text (`web/modebar.js`). The settings window (`web/settings.js`) holds
  what applies to the whole app.
- **The letter model is Learn's core.** Do not change the formulas in
  `internal/engine/model.go` or their values in `config.go` on your own: a
  silent change moves every user's progress. Explain the change, show it
  in the simulation (`go run ./tools/sim`) and ask.
- **A hidden A/B switch.** `?group=random` makes Learn draw random open words
  instead of using the algorithm, so the algorithm can be compared against
  it on real people (`docs/thesis/EVALUATION.md`). Every round stores its
  group. It is never shown or offered in the interface.
- **Try things freely**, outside the cleanup phase: build an idea, I test
  it, we keep it or drop it.
- If the algorithm's behaviour changes, update `docs/ALGORITHM.md` and the
  tests in the same task. The docs always describe what the code really does.

## Not now

Leaderboards, public profile pages, more languages, more themes (there are
two: dark and light, as CSS variables in `web/base.css`), frameworks.
Accounts exist (sign up / log in / log out on the normal server, kept in
PostgreSQL when it is configured). Structure code so these can be added
later, but do not build them yet.

## Commands

```
go run .            # start the server (address in internal/config/config.go)
go test ./...       # run all tests
gofmt -w .          # format
go vet ./...        # static checks
```

Every pull request runs gofmt, vet, the tests and the WebAssembly build
(`.github/workflows/tests.yml`). Every push to `main` runs the tests again and
republishes GitHub Pages (`.github/workflows/pages.yml`). If that run fails,
the site stays on the old version.

## Before you say a task is done

1. `gofmt -w .`, `go vet ./...` and `go test ./...` all pass.
2. New engine logic has unit tests, including edge cases (no data yet, zero values).
3. Docs updated if behaviour or the API changed.
4. An interface change is checked in a browser at desktop width, and the
   stats screen also at phone width (`docs/GUIDELINES.md`, section 10).
5. A short summary for me: what changed, which files, how to check it in the browser.
