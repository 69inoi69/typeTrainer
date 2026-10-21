# Audit of the learning algorithm (October 2026)

An outside look at the learning mode as it is in the code on 2026-10-16
(main at `b2131a9`). It changes nothing: no code, test or parameter was
touched. It explains how the algorithm works, which choices are justified
and which are not, where it is weak, and how to check those weak points.

How to read the labels used below:

- **Code fact**: read directly from the code; anyone can check it at the
  file and function named.
- **Math fact**: follows from the formulas with a few lines of arithmetic,
  shown in the text.
- **Simulation result**: measured with the simulated typist (section 4).
  True for that invented typist; a hint, not proof, for real people.
- **Hypothesis**: plausible, not measured.
- **Needs users**: can only be answered by real people typing.

Three levels of evidence, from weakest to strongest: **tests** show the code
does what it was written to do; **the simulation** shows how the rules behave
for an invented learner; **real users** show whether people actually learn.
Passing tests and good simulation numbers do not prove that the algorithm
teaches people well.

## 1. The learning cycle, step by step

One full turn of the loop, from a key press to the next words on screen.
File and function names are given so every step can be checked.

### 1.1 A key press becomes a sample

The browser (`web/typing.js`) records one **sample** per typed letter:
`{char: "s", errors: 1, ms: 412}`: which letter, how many wrong keys were
pressed at that place, and the time since the previous key. Every 6 words
(one **portion**) it sends the samples to `POST /api/v1/portion`.
*Code fact* (`web/typing.js`, header comment; `docs/ALGORITHM.md` §3).

### 1.2 The server updates the letter's statistics

`handlePortion` → `learn` (`internal/api/learning.go`) → `engine.Apply` →
`engine.Update` (`internal/engine/model.go`). For each letter it keeps:

- `Count`: how many times the letter was typed;
- `ErrEMA`: a running average of "was this press wrong" (0 or 1);
- `TimeEMA`: a running average of the time of **clean** presses only
  (no mistake, between 0 and 2000 ms).

The running average (EMA, exponential moving average) gives new presses more
weight than old ones. Each new press moves the average by
`step = max(0.1, 1/n)` of the distance to the new value. For the first 10
presses this is a plain average; after that, each press counts 10 %.
*Code fact* (`emaStep`, `Update`).

Example: a letter with `ErrEMA = 0` gets one mistake → `ErrEMA = 0.1`. Then
every clean press multiplies it by 0.9: 0.09, 0.081, ... It falls under 0.05
after 7 clean presses (`0.1 · 0.9^7 = 0.048`). *Math fact.*

### 1.3 Statistics become a difficulty score (0 = easy, 1 = hard)

`RawDifficulty` and `Difficulty` in `model.go`:

```
errorPart = ErrEMA / 0.25, at most 1          (a mistake every 4th press = 1)
speedPart = (TimeEMA - 400) / (1000 - 400), between 0 and 1
raw       = 0.6 · errorPart + 0.4 · speedPart
difficulty = (n · raw + 5 · 0.7) / (n + 5)    (n = Count)
```

The last line pulls a letter with little data towards 0.7 ("assume a new
letter is fairly hard"). After 5 presses data and assumption weigh the same;
after 50, the data weighs 10 times more. *Code fact.*

### 1.4 Is the letter mastered?

`Mastered` in `model.go`, a yes/no rule:

```
Count >= 20  and  ErrEMA <= 0.05  and  TimeEMA <= 400 ms (30 WPM)
```

It uses the raw averages, not the difficulty score. *Code fact.*

### 1.5 Does the next letter open?

`Generator.NextUnlocked` (`internal/engine/generator.go`): the next letter
opens only if **every** open letter is mastered **at this moment**. At most
one letter per check. The check runs after every portion, inside `learn`,
and once more at the end of a round (`handleResults`). *Code fact.*

The order of letters is fixed per language: by how often each letter occurs
in the word list (`letterOrder`), English starts with `e a r s t i`. The first
lesson has at least 6 letters and at least 30 real words (`firstLessonSize`).
*Code fact.*

### 1.6 Choosing the focus letter

`Generator.Portion` → `newPool` → `pickFocus`. Every open letter gets the
weight `exp(difficulty / 0.1)`, and one **focus** letter is drawn for the
whole portion with chance proportional to that weight. A gap of 0.1 in
difficulty makes a letter about 2.7 times more likely; a gap of 0.5, about
150 times. *Code fact; math fact.*

### 1.7 Choosing the words

`pickWord`, for each of the 6 slots of the portion:

- only real words from the word list, made only of open letters
  (`eligible`), and containing the focus letter (`byLetter`);
- weight = `exp(average difficulty of the word's letters / 0.1)`
  × frequency weight (`RankWeight`: words past the 200 most common get rarer;
  each focus letter keeps its 10 most common words free, `FloorWords`)
  × `0.3` for every time the word was used in the last 20 words;
- never the same word as its neighbour;
- up to 2 words typed with a mistake in the previous portion come back
  first, in random places (`RetryWords`).

*Code fact.*

### 1.8 The next exercise

The answer to `/portion` is the next portion, added at the end of the text.
Two portions (12 words) always wait ahead of the one being typed, and the
first request of a round asks for three (`AheadPortions + 1`). So a new
portion is built from the statistics as they were about 12 words before it
is typed. *Code fact* (`handlePortion`, `count`).

At the end of a round (30 words by default), `POST /results` learns from the
remaining samples, stores the round, and the loop starts again.

## 2. Why the thresholds and weights are what they are

The reasons in `docs/ALGORITHM.md` §8 and the comments of
`internal/config/config.go`, sorted by how well they are supported. The
document itself says: "The values were chosen by reasoning, not fitted to
data."

| Value | Stated reason | What supports it |
|---|---|---|
| `Temperature` 0.1 | fastest learning in the simulation | **Measured** (simulation, §11.1): fewer words to the goal than 0.15-0.25, at a small cost in variety. Measured only on the invented typist. |
| `RankStart` 200, `RankStep` 200 | size of Monkeytype's "English 200" list | **Reference to another product**, plus a simulation check that it does not slow learning. |
| `FloorWords` 10 | a portion of 6 words without a repeat | **Reasoned and measured** (§11.1: the most common `j` word falls from 15 % to 7 %). |
| `Alpha` 0.1 | "memory ≈ 20 presses" | **Reasoned.** Describes what 0.1 does, not why 20 presses is the right memory for a human. Not established. |
| `MasteryMinSamples` 20 | "≈ one EMA memory length" | **Reasoned**, tied to `Alpha`. Not established for people. |
| `MasteryErrorRate` 0.05 | "95 % accuracy, a common minimum goal" | **Claim without a source** in the repository. Common in typing courses, but no source is cited. |
| `TargetWPM` 30 | "reachable goal for a beginner" | **Claim without a source.** Not established. |
| `ErrorWeight` / `SpeedWeight` 0.6 / 0.4 | "courses put accuracy first" | **Claim without a source**; the exact split 0.6/0.4 has no stated reason. Not established. |
| `MaxErrorRate` 0.25, `SlowMs` 1000 | spread real values over 0..1; "1 s = hunting for the key" | **Reasoned only.** Not established. |
| `PriorDifficulty` 0.7, `PriorStrength` 5 | "new letters must get practised"; "a few presses are not evidence" | **Reasoned only.** The direction is clear (the prior must be above mastered letters); the exact numbers are not established. |
| `StartLetters` 6, `MinWords` 30 | "enough variety from the first minute" | **Reasoned only.** |
| `PortionWords` 6, `AheadPortions` 2, `RecentWords` 20, `RetryWords` 2, `RepeatPenalty` 0.3 | one line per portion; two lines to read ahead; variety | **Reasoned / interface choices.** The simulation shows the stream is not slower than whole exercises. |
| `RoundPortions` 5 | "chosen by the owner: a clear end" | **Product decision**, not a learning parameter. |

Nothing in the repository establishes why the human-facing numbers (5 %,
30 WPM, 20 presses, 0.6/0.4) are right for real learners. That is not a
defect in itself, but the thesis should present them as design choices to be
tested, not as known facts.

## 3. Known limitations

### 3.1 Waiting for the next letter grows with the number of open letters

The next letter needs every open letter mastered **at the same check**
(§1.5), and one mistake un-masters a letter for about 7 of its own presses
(§1.2: `Alpha` 0.1 is larger than the 0.05 threshold). So in practice the
error part of mastery means "no mistake on this letter in roughly its last 7
presses", for every open letter at once. *Math fact.*

The more letters are open, the less likely all of them are clean at the same
moment. Experiment B (section 5) measured this for a steady typist who is
truly good at every letter (300 ms per letter, a fixed hidden error rate):

| Hidden error rate | 6 letters open | 10 | 15 | 20 | 26 |
|---|---|---|---|---|---|
| 1 % | 1 chance per 9 words | 11 | 14 | 17 | 19 |
| 2 % | 15 | 22 | 38 | 49 | 86 |
| 3 % | 24 | 44 | 105 | 189 | 331 |

("1 chance per 9 words": on average every 9 words there is a check at which
all open letters are mastered. Every typist in this table is below the 5 %
goal on every letter.) *Simulation result.*

So the rule is much stricter than "under 5 % mistakes" once many letters are
open: a typist at 3 % per letter, well within the stated goal, waits around
190 words for the 21st letter. Experiment A shows the same with the learning
typist of the official simulation: from the moment all open letters are
truly at the goal (hidden values) until the next letter opens, the mean wait
grows from 29 words (6-10 letters open) to 36, 78 and 106 words (21-25
letters open). *Simulation result.*

### 3.2 The rule is too strict and too lenient at the same time

The same "7 clean presses" effect makes the rule lenient for a single
letter. A letter with a true error rate of 10 % has 7 clean presses in a row
about half of the time (`0.9^7 ≈ 0.48`). *Math fact.* In experiment A, 36 to
51 of every 100 unlocks happened while at least one open letter was still
truly worse than the goal (hidden values). In experiment E, one letter with
a true error rate of 20 % (four times the goal) did not stop the next letter
from opening: it opened after about 150 words in all 10 runs. Even at 30 %
it opened in half of the runs. *Simulation result.*

In the simulation this does no harm, because the invented typist improves
with every press anyway. For people it is open whether opening a letter
while another is still inaccurate matters. *Needs users.*

### 3.3 Getting stuck on one letter: speed, not mistakes

`docs/ALGORITHM.md` §9 names "one stubborn letter blocks progress". The
experiments show where that really happens:

- **An inaccurate letter** gets the focus a lot (45 % of portions at 10 %
  errors, 73 % at 20 %, 90 % at 30 %) and, as above, usually slips through by
  luck. *Simulation result (experiment E).*
- **A slightly slow letter** blocks progress and gets almost no extra
  practice. With one letter at 450 ms (27 WPM) and everything else at the
  goal, the next letter never opened in 3000 words, in 10 of 10 runs, while
  that letter was the focus in only 13 % of portions (about what an average
  letter gets among 10). At 420 ms it took about 240 words. *Simulation
  result (experiment E2).*

Why, in numbers: at 450 ms, `speedPart = (450 − 400) / 600 = 0.083`, so the
speed part adds only `0.4 · 0.083 = 0.033` to the difficulty. That is the
same as a gap of about one third of a focus "step" (0.1), so the focus barely
notices it. But `Mastered` needs `TimeEMA ≤ 400`, and the running average of
times wobbles only by about ±15 ms around the true 450 ms, so it almost
never gets there. *Math fact* (the ±15 ms is for the simulated ±25 % time
noise; real noise is unknown).

So the focus (soft, weights speed little near the goal) and mastery (hard
yes/no, at exactly 400 ms) disagree for slow letters. A real person who
needs more practice on a slow letter may get little of it while nothing new
opens. Whether people get stuck this way, and how often, *needs users*: a
real person improves with practice, the steady typist of E2 does not.

### 3.4 Early lessons with little data

- A new letter starts at difficulty 0.7, while mastered letters are near
  0.0-0.1, so the new letter becomes the focus almost every portion.
  *Code fact; math fact.*
- But it cannot appear before the portions already waiting are typed (§1.8):
  the first portion with the new letter usually comes 12 words after it
  opens (sooner only when a new round starts right then). In experiment A the new letter needed a median of 30 words (90 % of
  cases: 36 words or fewer) to reach the 20 presses mastery requires.
  *Simulation result.*
- The first press of a round has no time (there is no previous key), and a
  press after a mistake or a pause over 2 s does not count for speed.
  *Code fact.* A letter can be mastered only after at least one clean timed
  press (`TimedCount > 0`).
- In the first lesson, 6 letters give few words; repetition there comes
  mostly from the small alphabet, not from the focus: even random words
  repeat 28 % of the previous 20-word exercise in the simulation (`rep`
  column, section 4). *Simulation result.*

### 3.5 Rare letters

When `x`, `j`, `z` and `q` open, only 23, 22, 10 and 10 open words contain
them (experiment D; `x:23 j:22 z:10 q:10`), against 79-182 for the letters
before them. *Code fact (counted from the word list).* A portion focused on
`q` draws 6 words from 10, with the repeat penalty looking back 20 words, so
the same words come back within a few portions. `FloorWords` keeps those
10 words free of the frequency penalty, so at least they are spread evenly
(§11.1 of `docs/ALGORITHM.md`). Rare letters also appear seldom outside
their own focus, so they collect presses slowly. *Hypothesis:* the last
letters are the most repetitive part of learning. Not measured per letter
in this audit (experiment 5.5 below).

### 3.6 Word repetition

Measured by the official simulation (section 4) over the first 30 exercises
of 20 words each: the stream has 77 % different words per exercise and 42 %
of words repeated from the previous exercise; random words, 87 % and 28 %.
With every letter open (an experienced typist): 98 % and 5 %. So the focus
adds some repetition in the early lessons, and almost none later.
*Simulation result.* How repetitive it *feels*, and when it gets boring,
*needs users*.

### 3.7 Smaller points

- **No forgetting.** A letter not typed for days keeps its last statistics.
  *Code fact.* (`docs/ALGORITHM.md` §10 lists this as a future direction.)
- **A mastered letter can stop being mastered** after one mistake, and then
  blocks the next letter again (§3.1). *Code fact.*
- **A stale comment.** The header of `generator.go` and the comment on
  `NextUnlocked` say it is called "after every saved round" / "once per
  saved round". It is called after every portion (`learn` in
  `internal/api/learning.go`). `docs/ALGORITHM.md` §6 is correct.
  *Code fact.* A one-line comment fix, not a behaviour change.
- **Time belongs to the movement into a letter**, not the letter itself; the
  model treats it as the letter's (known, `docs/ALGORITHM.md` §9).

## 4. What the simulation can and cannot tell

**What exists.** `internal/sim` and `go run ./tools/sim`. An invented typist
has, for every letter, a hidden error chance (3-30 %) and a hidden time
(350-900 ms). Every press of a letter improves both a little, towards 1 % and
200 ms. Five strategies (random words, Monkeytype-like "best of 20", the
adaptive model as exercises, the stream as in the app, the stream without
the frequency penalty) get the same typists and the same random numbers. The
goal: every letter open and every hidden value at the mastery goal.
(`docs/ALGORITHM.md` §11.1.)

**Result of this audit's run** (`go run ./tools/sim -lang en`, exercises of
20 words until the goal, 20 typists):

| Strategy | Median | Reached |
|---|---|---|
| random words | 2268 | 19/20 |
| best of 20 (Monkeytype) | 302 | 20/20 |
| adaptive, T = 0.1 | 182 | 20/20 |
| stream, T = 0.1 (the app) | 166 | 20/20 |
| stream, no frequency penalty | 164 | 20/20 |

These match the published table in §11.1 within the spread of 20 runs.

**What it establishes.** Under its assumptions, targeting weak letters
reaches the goal 10+ times faster than random words and faster than best of
20, with more varied words than best of 20. It is a fair comparison of
*rules*, because every strategy meets the same typist.

**What it cannot establish:**

- that real people learn faster with this trainer (the typist is invented;
  every letter learns on the same smooth curve; letters do not affect each
  other; nothing is forgotten; there is no tiredness, boredom or motivation);
- that the thresholds suit people: the goal *is* the mastery thresholds, so
  the simulation cannot judge them;
- that "more practice on weak letters" helps people the way it helps the
  invented typist, who improves with every press by construction;
- how the text feels: `dist`, `rep` and `top` are rough measures of variety.

**What the tests establish.** The 60 test functions in
`internal/engine/*_test.go` and `internal/sim/sim_test.go` check that the
code does what it was written to do (for example `TestMastered`,
`TestNextUnlocked`, `TestNext_WeakLetterGetsFocus`,
`TestPickWord_FloorSpreadsARareLetter`). The simulation test
`TestRun_EveryStrategyReachesTheGoal` checks only that every strategy
*reaches* the goal on a small word list, not that adaptive is faster. No test
checks the effects found in section 3.

## 5. Experiments

A-E were run for this audit with a small program that uses the engine and the
simulator as they are; its full code is in appendix A (save it as
`tools/audittmp/main.go`, run from the repository root, then delete it).
The rest are proposals.

### Run for this audit

| | Question | How | Result |
|---|---|---|---|
| A | How long after a learner is truly ready does the next letter open? | The official learning typist and the stream, 20 typists, English. At each unlock: words since all open letters were truly at the goal. | Mean 29 → 106 words as letters open (§3.1); 36-51 % of unlocks before truly ready (§3.2); new letter reaches 20 presses after a median of 30 words (§3.4). |
| B | How strict is "all mastered at once" for a typist already at the goal? | A steady typist (no learning), 300 ms, hidden error 1-3 %, 6-26 letters open, 10 runs × 6000 words. | Table in §3.1. |
| D | How many words contain a rare letter when it opens? | Count of open words containing the letter. | §3.5. |
| E | Does one inaccurate letter block progress? | 10 letters open, all at 1 % / 300 ms except the 10th (`d`) at 4-30 % errors. | It gets the focus often and usually slips through (§3.2, §3.3). |
| E2 | Does one slow letter block progress? | The same, `d` at 1 % errors and 380-500 ms. | From 450 ms on, never opens in 3000 words, with little extra focus (§3.3). |

Commands: `go run ./tools/audittmp` (A, B, D; about 3 minutes) and
`go run ./tools/audittmp E` (E and E2). The numbers are fixed by the seeds in
the code, so a rerun gives the same output.

### Proposed next experiments

5.1 **Real-noise check for the slow-letter effect.** E2 used the simulated
time noise (±25 %). Replay real rounds: every round stores its raw key
presses (`keys`, in `/export`). Feed them through `engine.Apply` and look for
letters whose `TimeEMA` stays between 400 and 450 ms for many rounds while
nothing opens. This turns §3.3 from a simulation result into a data result.

5.2 **How long learners wait for a letter, in real data.** From the same
exports: words typed between two unlocks, against the number of open letters.
If the wait grows like in experiment A, §3.1 is confirmed on people.

5.3 **What-if runs in the simulator, without changing the app.** The
simulator takes its numbers from `config.Default()`; a copy of
`tools/audittmp` can change `ep` (for example `MasteryErrorRate` or `Alpha`)
before running A or E2, to see how much each number causes the effects.
This only explores; any change to the app's values is the owner's decision
(`AGENTS.md`: the math in `model.go` is the core of the thesis).

5.4 **Is adaptive really faster than random, as a test?** Turn the
comparison in §11.1 into a test that fails if `stream` stops beating
`random words` on the English list (with fixed seeds). Today a change that
made the adaptive model worse than random would still pass every test.

5.5 **Repetition per letter.** In `RunOpen` style, force the focus to one
letter (`q`, `z`, `j`, `x`, and a common one for comparison) for 300 words
and measure different words per 20 and the share of the most common word.
§11.1 already did this for the floor; repeating it for every letter would
show which letters are most repetitive.

5.6 **The control group.** The built-in `?group=random` study
(`docs/ALGORITHM.md` §11) is the only way to show that the algorithm helps
*people*: same practice time, compare speed and accuracy before and after.

## 6. Findings, by priority

### Confirmed (code or math, and measured in the simulation)

1. **A slightly slow letter can block all progress while getting almost no
   extra practice** (§3.3, E2). Mastery needs ≤ 400 ms exactly; the focus
   barely sees a 50 ms gap. The most important finding: it is the
   "stubborn letter" case, and the trainer does not push on it.
2. **The wait for the next letter grows with the number of open letters**
   and the rule is much stricter than "under 5 % mistakes" late in the
   alphabet (§3.1, A and B). Cause: all letters must be mastered at the same
   moment, and one mistake un-masters a letter for about 7 presses.
3. **For a single letter the error rule is lenient**: letters 2-4 times
   worse than the goal pass by luck (§3.2, A and E).
4. **A new letter usually appears 12 words after it opens** because of the
   portions waiting ahead (§3.4). Small, by design of the stream.
5. **Stale comment** on `NextUnlocked` and in the header of `generator.go`
   ("once per saved round"; it is after every portion) (§3.7).
6. **No test guards the main claim** that adaptive beats random (§4, 5.4).

### Plausible hypotheses (not measured here)

7. Rare letters (`q`, `z`, `j`, `x`) make the last part of learning the most
   repetitive (§3.5; experiment 5.5).
8. Opening a letter while another is still inaccurate (finding 3) does not
   hurt learning, because practice continues through focus. Unknown.
9. On a real keyboard, the ±15 ms wobble of `TimeEMA` is larger, which would
   make finding 1 milder; or smaller, making it worse (experiment 5.1).

### Questions only real users can answer

10. Are 30 WPM, 5 % and 20 presses good goals for people, or do learners give
    up waiting for letters (5.2)?
11. Does the focus feel repetitive or boring, and when?
12. Does the adaptive model help people more than random words (5.6)?
13. Does learning on a phone need its own model (`docs/ALGORITHM.md` §9;
    rounds already record the device)?

### What should not change without evidence

The product decision **real words only, from open letters** stays. Nothing
in this audit points to it as a cause: the slow-letter and waiting effects
come from the mastery rule and the focus weights, not from the word choice.
The one place where real words cost something is rare letters (few words,
more repetition, §3.5); generated letter strings would remove that, but would
give up the main idea of the product. That trade-off is not worth making
without user evidence that rare-letter repetition is a real problem, and
`FloorWords` already reduces it.

Any change to the mastery rule, `Alpha`, the weights or the thresholds
changes the core of the thesis (`AGENTS.md`) and is the owner's decision.
Possible directions, only for discussion: check mastery on a longer window or
with a margin, let the speed part weigh more near the goal, or require
mastery "most of the time over the last N checks" instead of "at one check".
Each would need the simulation rerun and `docs/ALGORITHM.md` updated.

## 7. What was inspected and run

**Files read:** `AGENTS.md`, `docs/ALGORITHM.md` (§1-12),
`internal/engine/model.go`, `internal/engine/generator.go`,
`internal/config/config.go`, `internal/api/learning.go` (`handlePortion`,
`learn`, `handleResults`), `internal/sim/sim.go`, `tools/sim/main.go`,
`web/typing.js` (portion stream), the test list of
`internal/engine/*_test.go` and `internal/sim/sim_test.go`,
`data/langs/en/words.txt` (letter counts).

**Commands:**

```
go run ./tools/sim -lang en          # official simulation, section 4
go run ./tools/audittmp              # experiments A, B, D (appendix A)
go run ./tools/audittmp E            # experiments E, E2
grep -c <letter> data/langs/en/words.txt   # rare letters: q 10, z 10, j 22, x 23
gofmt -w . ; go vet ./... ; go test ./...
```

`tools/audittmp` was created only to run the experiments and is not part of
the repository; its code is below.

## Appendix A. The experiment program

Save as `tools/audittmp/main.go` and run from the repository root. It uses
the engine and the simulator as they are, with its own copy of the
simulated typist so the hidden values can be read.

```go
// Audit experiments for docs/thesis/ALGORITHM-AUDIT.md (appendix A).
// Run: go run ./tools/audittmp     (A, B, D)
//
//	go run ./tools/audittmp E   (E)
package main

import (
	"fmt"
	"math"
	"math/rand"
	"os"
	"sort"
	"strings"

	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/language"
	"typingtrainer/internal/sim"
)

// typist: the same model as internal/sim.Typist, but with readable hidden values.
type typist struct {
	err, time map[string]float64
	learn     bool
	rng       *rand.Rand
	p         sim.Params
}

func (t *typist) typeText(text string, first bool) []engine.Sample {
	var out []engine.Sample
	for _, r := range text {
		if r == ' ' {
			continue
		}
		c := string(r)
		s := engine.Sample{Char: c}
		if t.rng.Float64() < t.err[c] {
			s.Errors = 1
		}
		if !first {
			s.Ms = t.time[c] * (1 + t.p.TimeNoise*(2*t.rng.Float64()-1))
		}
		first = false
		out = append(out, s)
		if t.learn {
			t.err[c] = t.p.ErrFloor + (t.err[c]-t.p.ErrFloor)*(1-t.p.LearnRate)
			t.time[c] = t.p.TimeFloor + (t.time[c]-t.p.TimeFloor)*(1-t.p.LearnRate)
		}
	}
	return out
}

func (t *typist) skilled(letters []string, ep engine.Params) bool {
	for _, c := range letters {
		if t.err[c] > ep.MasteryErrorRate || t.time[c] > ep.TargetMs() {
			return false
		}
	}
	return true
}

func load(id string) []string {
	data, _ := os.ReadFile("data/languages.json")
	langs, _ := language.Parse(data)
	for _, l := range langs {
		if l.ID == id {
			list, _ := os.ReadFile("data/langs/" + id + "/words.txt")
			return l.Words(string(list))
		}
	}
	panic(id)
}

func main() {
	cfg := config.Default()
	ep := cfg.Engine
	words := load("en")
	if len(os.Args) > 1 && os.Args[1] == "E" {
		expE(words, cfg, ep, false)
		expE(words, cfg, ep, true)
		return
	}
	expA(words, cfg, ep)
	expB(words, cfg, ep)
	expD(words, cfg, ep)
}

// A: beginner with the stream. For every unlock: words from "all open letters
// truly good (hidden)" to "the model opens the next letter", and words from an
// unlock until the new letter has MasteryMinSamples presses.
func expA(words []string, cfg config.Config, ep engine.Params) {
	type acc struct{ lag, n, early int }
	buckets := map[string]*acc{}
	var toEvidence []int
	runs := 20
	for run := 0; run < runs; run++ {
		seed := int64(run + 1)
		gen := engine.NewGenerator(words, rand.New(rand.NewSource(seed)), ep)
		gen.SetWordParams(cfg.Words)
		st := &sim.Stream{Gen: gen, EP: ep}
		rng := rand.New(rand.NewSource(seed))
		t := &typist{err: map[string]float64{}, time: map[string]float64{}, learn: true, rng: rand.New(rand.NewSource(seed + 1000)), p: cfg.Sim}
		for _, c := range gen.Order() {
			t.err[c] = cfg.Sim.ErrMin + rng.Float64()*(cfg.Sim.ErrMax-cfg.Sim.ErrMin)
			t.time[c] = cfg.Sim.TimeMin + rng.Float64()*(cfg.Sim.TimeMax-cfg.Sim.TimeMin)
		}
		stats := map[string]engine.KeyStat{}
		unlocked := gen.Start()
		w := 0
		readyAt := -1
		unlockAt, newLetter := -1, ""
		for w < 3000*20 && unlocked < len(gen.Order()) {
			text := st.Text(stats, unlocked, 0)
			samples := t.typeText(text, st.RoundStart())
			st.Observe(samples)
			w += len(strings.Fields(text))
			stats = engine.Apply(stats, samples, ep)
			if newLetter != "" && stats[newLetter].Count >= ep.MasteryMinSamples {
				toEvidence = append(toEvidence, w-unlockAt)
				newLetter = ""
			}
			open := gen.Order()[:unlocked]
			if readyAt < 0 && t.skilled(open, ep) {
				readyAt = w
			}
			next := gen.NextUnlocked(stats, unlocked, ep)
			if next > unlocked {
				b := bucket(unlocked)
				if buckets[b] == nil {
					buckets[b] = &acc{}
				}
				if readyAt < 0 {
					buckets[b].early++
				} else {
					buckets[b].lag += w - readyAt
					buckets[b].n++
				}
				unlocked = next
				readyAt = -1
				unlockAt, newLetter = w, gen.Order()[unlocked-1]
			}
		}
	}
	fmt.Println("A. Beginner, stream, en, 20 typists")
	keys := []string{"06-10", "11-15", "16-20", "21-25"}
	for _, k := range keys {
		a := buckets[k]
		if a == nil {
			continue
		}
		mean := 0.0
		if a.n > 0 {
			mean = float64(a.lag) / float64(a.n)
		}
		fmt.Printf("  open %s: unlocks %d, mean words from truly-ready to opened %.0f, opened before truly ready %d\n", k, a.n+a.early, mean, a.early)
	}
	sort.Ints(toEvidence)
	fmt.Printf("  words from unlock until the new letter has %d presses: median %d, p90 %d (n=%d)\n",
		ep.MasteryMinSamples, toEvidence[len(toEvidence)/2], toEvidence[len(toEvidence)*9/10], len(toEvidence))
}

func bucket(n int) string {
	switch {
	case n <= 10:
		return "06-10"
	case n <= 15:
		return "11-15"
	case n <= 20:
		return "16-20"
	}
	return "21-25"
}

// B: a steady typist (no learning) who is truly good at every letter: hidden
// error p, 300 ms. With N letters open, how often are ALL N mastered by the
// model at a check (after each portion), and how many words between such
// moments (= the wait for the next letter)?
func expB(words []string, cfg config.Config, ep engine.Params) {
	fmt.Println("B. Steady skilled typist (300 ms, hidden error p), en, words per 'all mastered' moment")
	for _, p := range []float64{0.01, 0.02, 0.03} {
		line := fmt.Sprintf("  p=%.2f:", p)
		for _, n := range []int{6, 10, 15, 20, 26} {
			hits, checks := 0, 0
			wordsTotal := 0
			for run := 0; run < 10; run++ {
				seed := int64(run + 1)
				gen := engine.NewGenerator(words, rand.New(rand.NewSource(seed)), ep)
				gen.SetWordParams(cfg.Words)
				st := &sim.Stream{Gen: gen, EP: ep}
				t := &typist{err: map[string]float64{}, time: map[string]float64{}, rng: rand.New(rand.NewSource(seed + 1000)), p: cfg.Sim}
				for _, c := range gen.Order() {
					t.err[c], t.time[c] = p, 300
				}
				un := gen.Clamp(n)
				stats := map[string]engine.KeyStat{}
				w := 0
				for w < 6000 {
					text := st.Text(stats, un, 0)
					samples := t.typeText(text, st.RoundStart())
					st.Observe(samples)
					w += len(strings.Fields(text))
					stats = engine.Apply(stats, samples, ep)
					if w < 1000 { // warm up
						continue
					}
					checks++
					all := true
					for _, c := range gen.Order()[:un] {
						if !engine.Mastered(stats[c], ep) {
							all = false
							break
						}
					}
					if all {
						hits++
					}
				}
				wordsTotal += w - 1000
			}
			per := "never"
			if hits > 0 {
				per = fmt.Sprintf("%.0f", float64(wordsTotal)/float64(hits))
			}
			line += fmt.Sprintf("  N=%d: %4.0f%% of checks, 1 per %s words;", n, 100*float64(hits)/float64(checks), per)
		}
		fmt.Println(line)
	}
}

// D: rare letters: open words that contain each letter at the moment it opens.
func expD(words []string, cfg config.Config, ep engine.Params) {
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), ep)
	fmt.Println("D. Open words containing the letter at the moment it opens (en)")
	line := " "
	for n := gen.Start() + 1; n <= len(gen.Order()); n++ {
		c := gen.Order()[n-1]
		k := 0
		for _, w := range gen.Words(n) {
			if strings.Contains(w, c) {
				k++
			}
		}
		line += fmt.Sprintf(" %s:%d", c, k)
	}
	fmt.Println(line)
}

// E: one stubborn letter. A steady typist with 10 open letters: every letter
// at 1% errors and 300 ms, except the 10th letter at hidden error q
// (E2: at hidden time q ms, with 1% errors). Over
// 3000 words after a 500-word warm-up: share of portions whose focus is the
// stubborn letter (until the next letter opens), and whether and when the
// next letter opened.
func expE(words []string, cfg config.Config, ep engine.Params, slow bool) {
	values := []float64{0.04, 0.06, 0.10, 0.20, 0.30} // hidden error of the stubborn letter
	if slow {
		values = []float64{380, 400, 420, 450, 500} // hidden ms of the stubborn letter (1% errors)
		fmt.Println("E2. One slow letter (10 open, others 1% / 300 ms), en, 10 runs")
	} else {
		fmt.Println("E. One inaccurate letter (10 open, others 1% / 300 ms), en, 10 runs")
	}
	for _, q := range values {
		focusN, portions, opened, openW := 0, 0, 0, 0
		var stub string
		for run := 0; run < 10; run++ {
			seed := int64(run + 1)
			gen := engine.NewGenerator(words, rand.New(rand.NewSource(seed)), ep)
			gen.SetWordParams(cfg.Words)
			t := &typist{err: map[string]float64{}, time: map[string]float64{}, rng: rand.New(rand.NewSource(seed + 1000)), p: cfg.Sim}
			un := gen.Clamp(10)
			for _, c := range gen.Order() {
				t.err[c], t.time[c] = 0.01, 300
			}
			stub = gen.Order()[un-1]
			if slow {
				t.time[stub] = q
			} else {
				t.err[stub] = q
			}
			stats := map[string]engine.KeyStat{}
			w := 0
			for w < 3500 {
				por := gen.Portion(stats, un, 0, nil, nil, ep)
				text := strings.Join(por.Words, " ")
				samples := t.typeText(text, w == 0)
				w += len(por.Words)
				stats = engine.Apply(stats, samples, ep)
				if w < 500 {
					continue
				}
				portions++
				if por.Focus == stub {
					focusN++
				}
				if gen.NextUnlocked(stats, un, ep) > un {
					opened++
					openW += w - 500
					break
				}
			}
		}
		label := fmt.Sprintf("%.0f%%", 100*q)
		if slow {
			label = fmt.Sprintf("%.0f ms", q)
		}
		fmt.Printf("  stubborn %s at %s: focus on it in %.0f%% of portions, opened the next letter in %d/10 runs, mean %.0f words after warm-up\n",
			stub, label, 100*float64(focusN)/float64(portions), opened, float64(openW)/math.Max(1, float64(opened)))
	}
}
```
