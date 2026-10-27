# 4. The adaptive algorithm

Thesis item 4: the mathematical model of the adaptive algorithm (letter
difficulty index and weighted random choice). The model as it works now is
described in [docs/HOW-THE-MODES-WORK.md](../HOW-THE-MODES-WORK.md); the code is
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

## Audit

[ALGORITHM-AUDIT.md](ALGORITHM-AUDIT.md): an outside review of the model as
it was on 2026-10-16 (what is measured, what is assumed, weak points).
Its section 8 reruns every experiment on the model of 2026-10-25 (issue
#153): the slow-letter and waiting findings are weaker but still there.

## Reasons and history

Moved here from `docs/HOW-THE-MODES-WORK.md` (issue #152), which says only
how the modes work now. The text is as it was written there; section
numbers refer to that file.

### Design decisions

| Decision | Alternative | Why this one |
|---|---|---|
| Real words only | Generated letter combinations (pseudo-words), as in keybr.com | Words are what people type in real life, they are easier to read and read faster, and they keep motivation up. Cost: early lessons have fewer possible texts. Handled by the unlock order and the `MinWords` rule (section 6). |
| Statistics per letter | Per key pair (bigram), per word | Simplest unit that can be explained and shown on the keyboard. Climb already tracks pairs (section 12.1); pairs in Learn are an open idea (`docs/thesis/08-testing-and-verification.md`). |
| Smoothed recent statistics (EMA) | Lifetime totals | Skill changes. A lifetime error rate remembers mistakes from weeks ago forever. |
| Probabilistic choice (softmax) | Always train the single worst letter | Always drilling one letter is boring and over-fits; probabilities give focus *and* variety. |
| Gradual unlocking | All 26 letters from the start | A beginner cannot learn 26 finger positions at once. Experienced typists go through the same steps, only much faster. |
| Statistics, not a neural network | ML model | No training data is needed, every decision can be explained with a formula, and it runs instantly on the server. |

### Why the home row first

**Why the home row first (owner, 2026-10-19).** Plain frequency put
`e a r s t i` first for English: three rows at once, so a beginner reaches up
from the first minute and the fingers never learn where they rest. Touch
typing courses start from the home row for that reason. Why a boost and not
"all eight resting keys first": with real words a rare home letter would
starve. English `j` has one word among the first nine letters ("jerk"),
Russian `ф` none, and a focus on such a letter would repeat that one word.
With the boost, the frequent home letters (`a s l d f`, `о а л в д`) come first
and a rare one (`j`, `ж`, `ф`) keeps its place by frequency. A boost of 2
still started English with `a s e l d r`, 3 with `a s l e d r`; 4 is the
smallest that also brings `f`, the left index finger's home.

### Why mastery has a margin

**Why the margin (owner, 2026-10-19; the audit, `docs/thesis/ALGORITHM-AUDIT.md`
3.1).** Without it, one mistake (ErrEMA jumps by `Alpha` = 0.1, over the 0.05
goal) took a mastered letter back for about 7 of its presses, and the next
letter needed every open letter to be clean at the same moment. The wait for
a new letter then grew with every letter opened (from about 29 to about 106
words in the simulation), although every letter was at the goal. A margin
between "reach" and "keep" (hysteresis, as a thermostat has) makes the state
stable: a letter is reached once and lost only for a clear reason.

### Why the forecast counts mistakes

**Why mistakes are counted, not drawn as a line.** One slip lifts `ErrEMA`
by about `Alpha` = 0.1 at once (section 4). A line through the rounds would
then point up, as if the letter got worse, and with several letters open
one of them slipped in almost every round: the first version (a line
through `ErrEMA`) gave no answer most of the time and erred by 4-6 rounds
when it did (section 10). Counting the mistakes of the window and using
the EMA's own formula is calm about a single slip and still honest: if the
recent mistakes are not under 5 %, the EMA cannot get there either.

### Why a straight line for the speed

**Why a straight line for the speed.** It is explainable in one sentence
and needs no model of learning. Its weakness: how fast a letter improves
changes (it gets more presses once it becomes the focus, and slows down
near its limit), and a straight line sees that late.

### Why UnmasteredBonus

Before, a letter a
little too slow (450 ms, speed part 0.08) got about the same share as any
mastered letter, about 13 % of the portions, and could block every new letter
for good (the audit, section 3.3).

### Why common words first

- **Why it is needed.** Without it, words are drawn evenly from the whole
  list: whatever the open letters are, about half of the possible words are
  from the rare end of the list (ranks 1000-2000), already in the first
  lesson. So a beginner types `sister`, `arrest`, `easier` as often as `is`,
  `at`, `see`. Common words are also short, so this rule makes the first
  lessons shorter too (section 10).

### Flat while learning, ramp after

- **Flat while learning, ramp after (owner's decision, issue #25).** Until
  October 2026 the limit grew with every unlocked letter (half of the letters
  open: rank ~1100). Then a learner meets two new things at once, a new
  letter and rarer words, and a difficulty curve that the user cannot see is
  hard to explain. Now there is one difficulty at a time: while letters open
  only the words change their letters, not their rarity; after the full
  alphabet only the rarity grows. What the flat phase costs is measured in
  section 10.

### The rare-letter floor counts the whole list

(tried first: the mean rank of the first 30 exercises rose from ~330 to
  ~490)

### Why at most two uses of a word

Why (owner, 2026-10-20): the penalty alone is
weak when a letter has few words. English `z` and `q` have 10 words each in
the whole list, and a round focused on them showed only 10 different words in
30 (`pizza` 6 times, `size` 5); common short words repeated 4 times too (`an`,
`in`, `too`). With the cap a round on `z` or `q` has about 20 different words.
The price is measured in section 10: the focus letter gets fewer words when its
words run out, so reaching the goal takes a few percent more typing.

### Before the stream

Before the stream, a whole exercise of 20 words was built in advance, so
a mistake on its first word changed the text only 20 to 40 words later.

### One model for every device (no longer applies)

- **One model for every device.** Rounds typed on a phone (two thumbs on a
  touch screen) and on a physical keyboard update the same letter
  statistics, although they are different skills: slower phone rounds make
  letters look slow. Each round records what it was typed on
  (`Session.Device`: `keyboard` or `touch`), so the history can show whether
  this matters before the model treats the two differently.

### Simulation runs, in order

**Result** (20 typists per strategy; "exercises" = mean number of exercises
until the goal, a run gives up after 3000; variety in the format
dist / rep / top). The rows "adaptive, T = 0.1" and "stream, T = 0.1" use the
word frequency penalty of section 7; "stream, no frequency penalty" is the
same stream with `RankPenalty` turned off. The `T = 0.25` rows and the
comparisons in the first bullets below were measured before the frequency
penalty existed, and the whole table before the flat-then-ramp limit
(results for it below, "Flat while learning, ramp after"):

| Language | Strategy | Exercises | Variety, first 30 | Variety, expert |
|---|---|---|---|---|
| en | random words | 2447 | 87 / 28 / 73 | 100 / 1 / 60 |
| en | best of 20 | 292 | 47 / 55 / 94 | 96 / 8 / 75 |
| en | adaptive, T = 0.25 | 299 | 94 / 28 / 73 | 100 / 2 / 62 |
| en | adaptive, T = 0.1 | 176 | 79 / 45 / 78 | 99 / 3 / 62 |
| en | stream, T = 0.1 | 171 | 79 / 39 / 77 | 98 / 5 / 65 |
| en | stream, no frequency penalty | 163 | 88 / 29 / 82 | 98 / 5 / 65 |
| pl | random words | 1520 | 81 / 40 / 70 | 100 / 1 / 55 |
| pl | best of 20 | 274 | 33 / 64 / 83 | 96 / 8 / 69 |
| pl | adaptive, T = 0.25 | 450 | 86 / 50 / 71 | 100 / 1 / 55 |
| pl | adaptive, T = 0.1 | 245 | 69 / 56 / 75 | 100 / 2 / 56 |
| pl | stream, T = 0.1 | 232 | 67 / 53 / 76 | 99 / 4 / 59 |
| pl | stream, no frequency penalty | 229 | 75 / 47 / 80 | 99 / 4 / 59 |
| uk | random words | 1818 | 81 / 39 / 61 | 100 / 1 / 51 |
| uk | best of 20 | 286 | 34 / 59 / 85 | 96 / 8 / 68 |
| uk | adaptive, T = 0.25 | 464 | 90 / 44 / 66 | 100 / 2 / 53 |
| uk | adaptive, T = 0.1 | 254 | 72 / 57 / 70 | 100 / 2 / 54 |
| uk | stream, T = 0.1 | 242 | 70 / 50 / 72 | 99 / 4 / 57 |
| uk | stream, no frequency penalty | 233 | 82 / 40 / 77 | 99 / 4 / 57 |
| ru | random words | 3000 (none reached) | 83 / 38 / 60 | 100 / 1 / 56 |
| ru | best of 20 | 1175 | 34 / 59 / 81 | 96 / 8 / 72 |
| ru | adaptive, T = 0.25 | 490 | 91 / 42 / 67 | 99 / 4 / 58 |
| ru | adaptive, T = 0.1 | 259 | 78 / 48 / 73 | 98 / 4 / 59 |
| ru | stream, T = 0.1 | 259 | 77 / 43 / 75 | 97 / 5 / 62 |
| ru | stream, no frequency penalty | 251 | 85 / 34 / 77 | 97 / 5 / 62 |

`go run ./tools/sim -temps 0.1,0.15,0.2,0.25` prints the in-between values
too: exercises fall steadily as T falls (en 299, 264, 229, 173).

What this shows:

- Any targeting beats random words by 5 to 10 times. Random words almost never
  practise rare letters (Russian `ъ`, `э`, `ф`): no Russian run reached the goal.
- With the earlier value `Temperature = 0.25` the adaptive model loses to the
  simple best-of-20 rule in Polish and Ukrainian. Most of the time goes into
  unlocking (all letters open after ~430 exercises against ~240).
- Best of 20 pays for its speed with repetition: in the first lessons only a
  third of the words in an exercise are different, against 85-90 % for the
  adaptive model. It also fails on Russian: once all letters are open, words
  with the rarest letters are seldom among 20 random words.
- `T = 0.1` (the configured value since this result) makes the adaptive model the fastest
  in every language. The price is moderate: in the first lessons 5-9 points fewer
  different words and one letter pushed a bit harder (`top` +8..10 points);
  for an experienced typist the variety is practically the same.
- **The stream** (the app now, rounds of 30 words) needs 6-7 % fewer words to
  the goal than whole exercises in English, Polish and Ukrainian (163 against
  173, 229 against 246, 233 against 247), and 2 % more in Russian (251 against
  247, within the spread of 20 runs; there the rare letters `ъ`, `э`, `ф` set
  the pace). It reacts after every 6 words instead of every 20. Variety in the
  first lessons is the same within 1-6 points (fewer repeated words, `rep`).
  An experienced typist sees a few more repeated words (`rep` 4-5 % against
  2-4 %): mostly the mistyped words that come back on purpose.
  Without rounds (one endless stream, tried first) the gain was slightly
  larger (161, 221, 227, 247): each new round starts with three portions built
  from the same statistics. The owner chose rounds anyway, for a clear end and
  a result screen.
- **Common words first** (section 7). In the first 30 exercises the mean
  rank of the words falls from 905 to 391 (en), 680 to 269 (pl), 823 to 337
  (uk), 737 to 347 (ru): the text is made of common words, as intended. The
  words also get shorter: 3.7 against 4.3 letters (en), 3.5 against 4.0 (pl),
  3.4 against 4.2 (uk), 3.9 against 4.4 (ru). The price: the common words of a
  small alphabet are few, so the first lessons repeat more (`dist` 8-12 points
  lower, `rep` 6-10 points higher), and reaching the goal takes 1-5 % more
  words (171 against 163, 232 against 229, 242 against 233, 259 against 251;
  the larger gaps are about the spread of 20 runs). The experienced typist has
  every letter open, so nothing changes there.
- A milder version, a penalty on long words instead of rare ones (tried
  first), changed the first lessons by only 0.1-0.4 letters per word: unlocking
  already keeps early words short, but it does not keep them common.
- Most repetition in the first lessons comes from the **small alphabet**, not
  from the strategy: even random words repeat 28-40 % of the previous exercise.
  That part is controlled by `StartLetters` and `MinWords`, not by `T`.

**Flat while learning, ramp after** (section 7, issue #25). The stream
(`T = 0.1`) with the earlier limit (growing with every unlocked letter),
with the flat limit and ramp but no floor (`-floor 0`), and with both as
configured. "after" is the mean rank of the words typed after every letter
was open, until the goal; "rank, expert" is the mean rank over the
experienced typist's 100 exercises (every letter open from the start, so the
ramp runs during them):

| Language | Limit | Exercises | Variety, first 30 | Rank, first 30 | After | Rank, expert |
|---|---|---|---|---|---|---|
| en | grows with letters (before) | 171 | 79 / 39 / 77 | 391 | - | 1046 |
| en | flat, ramp, no floor | 168 | 77 / 42 / 78 | 346 | 603 | 785 |
| en | flat, ramp, floor 10 | 165 | 77 / 42 / 78 | 346 | 713 | 811 |
| pl | grows with letters (before) | 232 | 67 / 53 / 76 | 269 | - | 1055 |
| pl | flat, ramp, no floor | 235 | 66 / 53 / 75 | 259 | 486 | 809 |
| pl | flat, ramp, floor 10 | 240 | 66 / 53 / 75 | 259 | 605 | 822 |
| uk | grows with letters (before) | 242 | 70 / 50 / 72 | 337 | - | 1048 |
| uk | flat, ramp, no floor | 239 | 70 / 51 / 71 | 321 | 565 | 777 |
| uk | flat, ramp, floor 10 | 230 | 70 / 51 / 71 | 321 | 667 | 791 |
| ru | grows with letters (before) | 259 | 77 / 43 / 75 | 347 | - | 1043 |
| ru | flat, ramp, no floor | 251 | 77 / 44 / 74 | 318 | 669 | 816 |
| ru | flat, ramp, floor 10 | 254 | 77 / 44 / 74 | 318 | 682 | 825 |

- **Words to the goal do not change**: the differences (-5 % to +4 %) are
  within the spread of 20 runs, in both directions. Learning speed is set by
  the letter model, not by how rare the words are.
- **The first lessons get a little more common** (mean rank 4-12 % lower,
  e.g. ru 347 → 318) with the same variety. Before, the limit had already
  grown by the 30th exercise; now it waits for the whole alphabet.
- **After the alphabet the words get rarer step by step**: the experienced
  typist, whose 100 exercises (about 2000 words) span the ramp, meets a mean
  rank of ~800 instead of ~1050 (the whole list at once). The beginner reaches
  the goal soon after the last letter opens, early in the ramp: mean rank
  600-700 then.
- **The floor** does not touch the first lessons (identical numbers: it
  counts in the whole list, section 7). It makes the words of the rare letters
  more even: with every letter open and the focus on one letter for 300
  words, the most frequent word of Russian `ф` falls from 14 % to 9 % of
  them, `ц` and `щ` from 10 % to 6 %, English `j` from 15 % to 7 %, `q` from
  15 % to 11 %, Polish `f` from 12 % to 7 %. The effect is moderate, because
  the repeat penalty already stops one word from filling a portion; the
  number of different words stays the same (Ukrainian `ф` and English `q`
  have exactly 10 words in the list).

**After the home row order, the mastery margin and the bonus for unmastered
letters (2026-10-19).** The same simulation (20 typists per strategy), before
and after the three changes of sections 6 and 7 together:

| Language | Stream: exercises to the goal (median) | All letters open (exercises) | Variety, first 30 (dist / rep / top) |
|---|---|---|---|
| en | 166 → 122 (−27 %) | 149 → 106 | 77 / 42 / 78 → 77 / 43 / 84 |
| ru | 240 → 175 (−27 %) | 225 → 154 | 77 / 44 / 74 → 73 / 47 / 78 |

- **A quarter less typing to the goal** in both languages. Most of it is the
  margin: letters at the goal no longer drop out by chance, so the next
  letter opens as soon as the last one is reached.
- **The focus pushes a little harder in the first lessons** (`top` +4 to +6
  points): the unmastered letters get the bonus while the mastered ones do
  not. Repetition (`rep`) stays about the same.
- **The expert is unchanged** within the spread (every letter is mastered
  from the start, so neither the margin nor the bonus acts).

**No one-letter words, at most two uses of a word per round (2026-10-20).**
The same simulation (20 typists per strategy), the stream before and after
`MinWordLetters = 2` and `MaxRepeats = 2` (with `RecentWords` 20 → 24), and
with only the first of them (cap off) to tell the two apart:

| Language | Stream | Exercises to the goal (median / mean) | All letters open | Variety, first 30 (dist / rep / top) | Letters per word, first 30 |
|---|---|---|---|---|---|
| en | before | 122 / 127 | 106 | 77 / 43 / 84 | 3.7 |
| en | no one-letter words only | 123 / 123 | 107 | 77 / 42 / 85 | 3.8 |
| en | both (configured) | 134 / 133 | 108 | 79 / 40 / 86 | 3.9 |
| ru | before | 175 / 176 | 154 | 73 / 47 / 78 | 3.4 |
| ru | both (configured) | 183 / 185 | 154 | 76 / 45 / 80 | 3.8 |

- **Leaving out one-letter words changes nothing measurable** in English
  (within the spread); the words get a little longer, because `a` and `i`
  were among the most frequent. In Russian the first lessons lose the
  one-letter words (`я`, `в`, `и`, `с`, `у`, `а`, `о`, `к`), so the words
  get 0.4 letters longer.
- **The cap costs 5-9 % more typing to the goal** (en 123 → 134 median,
  ru 175 → 183), while the moment the last letter opens stays the same. The
  cost sits at the end: when the last, rarest letters (`j`, `x`, `z`, `q`)
  are the focus, their words run out and a third of the round goes to other
  letters, so they collect presses more slowly. `MaxRepeats = 3` (tried)
  costs nothing measurable (122 / 127) but lets a word come three times in
  a round; 2 is configured for variety, the complaint that started this.
- **The averages move little** (`dist` +2-3 points, `rep` -2-3): over the
  first 30 exercises most words were not repeated anyway. The cap acts where
  the averages do not look: per round, a rare letter's round goes from ~10 to
  ~20 different words in 30, and no word comes more than twice (counted with
  the configured generator, every letter mastered but the newest).
- The expert is unchanged within the spread.

**Forecast (2026-10-21).** How good is "Next letter ≈ N rounds" (section
6.2)? `sim.Forecasts` lets each of the 20 beginners practise with the
stream, in rounds of 30 words, until every letter is open. After every
round it makes the forecast exactly as the panel does, and when the next
letter opens it compares each forecast made since the last letter with the
rounds it really took. `go run ./tools/sim` prints the line under each
language's table. English, the first version (mistakes as a line through
`ErrEMA`) and the configured one (mistakes counted, section 6.2), each with
a few windows (`Window` / `MinRounds`):

| Mistakes | Window / min | Rounds with a forecast | Forecasts | Error, mean / median (rounds) | Within max(2, 25 %) | Too hopeful | Real wait, mean |
|---|---|---|---|---|---|---|---|
| line | 10 / 5 | 5 % | 66 | 6.0 / 2 | 52 % | 21 % | 2.0 |
| line | 6 / 3 | 8 % | 121 | 3.7 / 1 | 69 % | 31 % | 2.2 |
| counted | 10 / 5 | 9 % | 133 | 1.0 / 1 | 90 % | 23 % | 1.8 |
| **counted** | **10 / 3 (configured)** | 12 % | 178 | 1.2 / 1 | 87 % | 31 % | 2.1 |
| counted | 6 / 3 | 10 % | 137 | 1.2 / 1 | 87 % | 31 % | 1.9 |
| counted | 4 / 2 | 9 % | 126 | 1.2 / 1 | 88 % | 40 % | 2.1 |

- **Counting the mistakes is what made it work:** the mean error fell from
  4-6 rounds to about 1, and it answers about twice as often. A line
  through `ErrEMA` read every slip as "getting worse" (section 6.2).
- **The window matters little once mistakes are counted.** 3 rounds as the
  minimum answers in more rounds than 5 at about the same error; a window
  of 10 is configured because it is about what the EMA remembers.
- **It errs more often on the long side** (about two out of three misses
  are too long): it under-promises. The likely reason is the focus
  (section 7): the letter furthest from its goal gets more presses per
  round once the portions are built around it, so it improves faster than
  its past rounds say.
- **It is rarely shown in the simulation, and that is expected.** The
  simulated beginner opens a letter about every 2 rounds, so the new letter
  seldom has 3 rounds behind it before the next one opens: the forecast
  answers only when a letter takes longer, which is when a typist wants to
  know. How it does on real people (who learn more slowly and less evenly)
  can only be measured with real users: every round's numbers are in the
  history, so the same check could be run on them.

### Climb before 2026-10-20: capitals and punctuation

(Until 2026-10-20 the upper levels
added capitals and then commas and full stops.)

### Climb before 2026-10-20: a level from 1 to 100

(Until 2026-10-20 the level was a number
0..1, shown as 1..100, that moved after every 6 words; within one round it
could move 10 places, so the typist never knew what they had passed.)

### Why real sentences

(The owner chose real sentences over marks sprinkled on random
  words, which read as nonsense: "Been doing only at did very up.")
