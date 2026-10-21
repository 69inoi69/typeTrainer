# Evaluation: how to show that Learn works

How to check that Learn's adaptive word choice helps, beyond "it feels
right": what is already built for it, and where the model could go next.
The algorithm itself is in [docs/ALGORITHM.md](../ALGORITHM.md).

## What is already built

- **Unit tests** show the core properties: a weak letter appears at least
  twice as often (`TestNext_WeakLetterGetsFocus`), old mistakes fade
  (`TestUpdate_RecentDataWins`), one press is not evidence
  (`TestDifficulty_ShrinkageNeedsEvidence`), only open letters are used.
- **A simulation** of made-up typists that compares Learn with random words
  and with monkeytype's "weakspot" ([ALGORITHM.md](../ALGORITHM.md),
  section 10; `go run ./tools/sim`).
- **A hidden control group** for a study with real people (below).
- **Raw data.** Every round in the history keeps its raw keypresses
  (`keys`: letter, mistakes, time, in order; ARCHITECTURE.md, "Raw round
  records"), and `/export` writes them to the file. Replaying them through
  `engine.Apply` rebuilds the letter statistics, so the same real data can be
  run with other values of `Alpha` or the weights (idea 4 below), and
  learning curves per letter can be drawn.

## A user study

Two groups (adaptive vs. random words), the same total practice time,
compare WPM and accuracy before and after.

Give half of the participants this link (with your own address):

```
http://localhost:3000/?group=random
```

and the other half the normal address. `?group=random` puts that browser
(or account) into the control group in every language, `?group=adaptive`
takes it back (`web/app.js`, `POST /api/v1/group`).

In the control group learning works as usual (the same letter model, the
same unlocking, the same rounds and history) except the word choice:
`Generator.RandomPortion` draws the open words uniformly, never the same
word twice in a row, with no focus letter, no frequency penalty and no
mistyped words coming back, like the "random words" strategy of the
simulation. Every learning round stores its group (`Session.Group`, in
`/export` too), so the two groups' rounds can be told apart in the data.

The interface does not show the group, so participants do not know which
one they are in; the letters bar only shows no focus letter. A reset or a
new browser drops the group: open the link again.

What is still missing for a real study: a server online for the
participants, a fixed test before and after, and a way to gather the
exported files of many participants into one table.

## Where the model can go further

These are directions, not things that are built:

1. **Bigram statistics.** Keep the same `KeyStat` for pairs like `th`, `ng`, and
   add their difficulty to `D(word)`. Directly targets the transition problem
   of ALGORITHM.md section 9. (Climb already tracks weak pairs of its own,
   section 12.1.)
2. **Word-level choice in one step.** Instead of "letter, then word", a single
   softmax over `D(word)` with a different aggregation (sum, max, mean).
3. **Forgetting over time.** Skill fades between sessions. Half-life regression
   (Settles & Meeder, 2016) models the probability of recall as a function of time
   since last practice; the same idea can raise the difficulty of letters not seen
   for days.
4. **Fitting parameters.** With logged data, choose `Alpha`, `T` and the weights
   that best predict the next mistake.
