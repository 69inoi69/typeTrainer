# Product

What typeTrainer is and the decisions that shape it. Ask the owner before
changing any of them.

## What it is

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

## Principles

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
  chart or record. How each mode works: `docs/HOW-THE-MODES-WORK.md`.
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
  it on real people (`docs/thesis/08-testing-and-verification.md`). Every round stores its
  group. It is never shown or offered in the interface.
- **Try things freely**, outside the cleanup phase: build an idea, I test
  it, we keep it or drop it.

## Not now

Leaderboards, public profile pages, more languages, more themes (there are
two: dark and light, as CSS variables in `web/base.css`), frameworks.
Accounts exist (sign up / log in / log out on the normal server, kept in
PostgreSQL when it is configured). Structure code so these can be added
later, but do not build them yet.
