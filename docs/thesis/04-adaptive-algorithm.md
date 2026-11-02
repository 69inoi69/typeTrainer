# 4. The adaptive algorithm

Thesis item 4: the mathematical model of the adaptive algorithm (letter
difficulty index and weighted random choice). The model is described in
[docs/HOW-THE-MODES-WORK.md](../HOW-THE-MODES-WORK.md); the code is
`internal/engine/model.go` and `generator.go`. Changes to the formulas go
through the owner and the simulation (docs/PRODUCT.md).

## Where each part is

| Part | HOW-THE-MODES-WORK.md |
|---|---|
| What is measured per key | section 3 |
| Per-letter statistics (EMA) | section 4 |
| Difficulty index, shrinkage towards a prior, worked example | section 5 |
| Unlocking letters, laps, the forecast | section 6 |
| Choosing the words (softmax with temperature) | section 7 |
| Parameters and their reasons | section 8 |
| Known simplifications | section 9 |
| Simulation | section 10 |

## Design decisions

| Decision | Alternative | Why this one |
|---|---|---|
| Real words only | Generated letter combinations (pseudo-words) | Words are what people type in real life, they are easier to read and read faster, and they keep motivation up. Cost: early lessons have fewer possible texts. Handled by the unlock order and the `MinWords` rule (section 6). |
| Statistics per letter | Per key pair (bigram), per word | Simplest unit that can be explained and shown on the keyboard. Climb tracks pairs (section 12.1). |
| Smoothed recent statistics (EMA) | Lifetime totals | Skill changes. A lifetime error rate remembers mistakes from weeks ago forever. |
| Probabilistic choice (softmax) | Always train the single worst letter | Always drilling one letter is boring and over-fits; probabilities give focus *and* variety. |
| Gradual unlocking | All 26 letters from the start | A beginner cannot learn 26 finger positions at once. Experienced typists go through the same steps, only much faster. |
| Statistics, not a neural network | ML model | No training data is needed, every decision can be explained with a formula, and it runs instantly on the server. |

## Why the home row first

Touch typing courses start from the home row, so the fingers learn where they
rest. Why a boost and not "all eight resting keys first": with real words a
rare home letter would starve. `j` has one word among the first nine letters
("jerk"), and a focus on it would repeat that one word. With the boost, the
frequent home letters (`a s l d f`) come first and a rare one (`j`) keeps its
place by frequency. 4 is the smallest boost that brings `f`, the left index
finger's home, into the first lesson.

## Why mastery has a margin

Without it, one mistake (ErrEMA jumps by `Alpha` = 0.1, over the 0.05 goal)
takes a mastered letter back for about 7 of its presses, and the next letter
needs every open letter to be clean at the same moment, so the wait grows with
every letter opened. A margin between "reach" and "keep" (hysteresis, as a
thermostat has) makes the state stable: a letter is reached once and lost only
for a clear reason.

## Why the forecast counts mistakes

One slip lifts `ErrEMA` by about `Alpha` = 0.1 at once (section 4). A line
through the rounds would point up, as if the letter got worse. Counting the
mistakes of the window and using the EMA's own formula is calm about a single
slip and still honest: if the recent mistakes are not under 5 %, the EMA cannot
get there either.

## Why a straight line for the speed

It is explainable in one sentence and needs no model of learning. Its weakness:
how fast a letter improves changes (it gets more presses once it becomes the
focus, and slows down near its limit), and a straight line sees that late.

## Why UnmasteredBonus

A letter a little too slow (450 ms, speed part 0.08) would otherwise get about
the same share as any mastered letter, and could block every new letter for
good.

## Why common words first

Without it, words are drawn evenly from the whole list: about half of the
possible words are from the rare end (ranks 1000-2000), already in the first
lesson. Common words are also short, so this rule makes the first lessons
shorter too.

## Flat while learning, ramp after

One difficulty at a time: while letters open only the words change their
letters, not their rarity; after the full alphabet only the rarity grows.

## Why at most two uses of a word

The repeat penalty alone is weak when a letter has few words: `z` and `q` have
10 words each in the whole list. With the cap a round on them has about 20
different words in 30. The price is a few percent more typing to the goal,
because the focus letter gets fewer words when its words run out.

## Why real sentences

Marks sprinkled on random words read as nonsense, so Freetype's sentences are
real ones.
