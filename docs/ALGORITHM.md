# The adaptive algorithm

This document explains how the trainer decides what you type next, and why
each part is built the way it is. It is written as raw material for the
thesis: every formula here is exactly what the code does, and every number
comes from `internal/config/config.go`.

Code: `internal/engine/model.go` (the math) and `internal/engine/generator.go`
(unlocking and word selection). Tests that check each claim:
`internal/engine/*_test.go`.

---

## 1. The idea in one paragraph

The user types **real words** in one of four languages (English, Polish,
Ukrainian, Russian). For every letter the program keeps a
short, constantly updated picture of how well the user types it: how often they
make a mistake on it and how long it takes. These two numbers are combined into
one **difficulty** between 0 and 1. Letters are introduced **gradually**, most
frequent first; a new letter opens only when every open letter is typed
accurately at the target speed. Inside the open letters, each next word is
chosen at random, but with probabilities shaped by difficulty, so weak letters
show up much more often and strong ones still appear sometimes. Learning has
no settings: the model alone decides what to practise. (Free practice, a
separate mode in `internal/freeplay`, draws words evenly from the whole list
and never feeds this model; see docs/ARCHITECTURE.md, "Modes".)

## 2. Design decisions

| Decision | Alternative | Why this one |
|---|---|---|
| Real words only | Generated letter combinations (pseudo-words), as in keybr.com | Words are what people type in real life, they are easier to read and read faster, and they keep motivation up. Cost: early lessons have fewer possible texts. Handled by the unlock order and the `MinWords` rule (section 6). |
| Statistics per letter | Per key pair (bigram), per word | Simplest unit that can be explained and shown on the keyboard. Bigrams are a natural extension (section 10). |
| Smoothed recent statistics (EMA) | Lifetime totals | Skill changes. A lifetime error rate remembers mistakes from weeks ago forever. |
| Probabilistic choice (softmax) | Always train the single worst letter | Always drilling one letter is boring and over-fits; probabilities give focus *and* variety. |
| Gradual unlocking | All 26 letters from the start | A beginner cannot learn 26 finger positions at once. Experienced typists go through the same steps, only much faster. |
| Statistics, not a neural network | ML model | No training data is needed, every decision can be explained with a formula, and it runs instantly on the server. |

## 3. What is measured

Typing never stops on a mistake (as on monkeytype, so the rhythm is kept):

- a wrong letter turns red and the cursor moves on;
- Backspace goes back inside the current word (Ctrl+Backspace: the whole
  word); at the start of a word it goes back into the previous word, at most
  one word back (from inside that word it does nothing more);
- space in the middle of a word jumps to the next word; the rest of the word is
  **skipped**;
- letters typed where a space belongs are **extra** letters, shown in red
  after the word.

For every **position of the text that was typed** the browser sends one sample:

```
{ char: "s", errors: 1, ms: 412 }
```

- `errors` – how many wrong keys were pressed at this position, including new
  attempts after a Backspace. Backspace changes only what the screen shows: a
  mistake corrected with Backspace **still counts**, because the first attempt
  was wrong. This also holds after going back one word: the samples of the
  first pass stay, the retyped letters only add what was missing (skipped
  letters) and new mistakes, and no letter is measured twice. If the
  previous word's portion was already sent to the server, its new presses
  are shown but not sent again. Extra letters count as errors of the space after the word.
- `ms` – time from the previous keypress to the **first** press at this
  position, measured with `keydown` and `performance.now()` (sub-millisecond
  resolution).
- **Skipped** letters were never typed, so they send no sample: a skip says
  nothing about how well the user types that letter. They still lower the
  accuracy (each skipped letter counts as one wrong press).

Some times are **ignored** for speed (but still count for accuracy):

1. the time of a position whose sample has a mistake (`errors > 0`), because
   the first attempt there was a wrong movement;
2. gaps longer than `MaxIntervalMs = 2000 ms`, which are pauses;
3. the first press of a round (no previous press) and the first press
   after a Backspace (that time is spent correcting): both get `ms = 0`
   (not measured).

**Held keys are ignored.** When a key is held down, the operating system
repeats it every ~30 ms (`keydown` with `repeat = true`). The trainer ignores
these repeats (Backspace excepted, so holding it still deletes): in a word
like `all` a repeated `l` would otherwise be recorded as a correct press
10 times faster than any real finger movement.

There is deliberately **no lower limit** on a single interval. keybr.com drops
results under 40 ms, but it applies that to the *average* time of a letter in
a whole lesson. Single intervals of a fast typist are often that short when the
next key is pressed before the previous one is released (rollover, typical for
letters typed with different hands), so a per-press limit would throw away
exactly the fastest real presses and make fast typists look slower.

The press right after a wrong letter is measured normally: the cursor has
already moved on, so it is an ordinary finger movement from the previous key.

Exercise-level numbers, shown to the user:

```
WPM      = (characters that are right / 5) / minutes  (standard: 1 word = 5 characters)
raw      = (all keypresses / 5) / minutes             (wrong presses count too)
accuracy = correct keypresses / all keypresses * 100  (a skipped letter = one wrong press)
```

`raw` is only shown in the header (as on monkeytype); it is not sent to the
server and the model does not use it.

**Consistency** (`internal/engine/consistency.go`) tells how even the speed
was during a round. The browser counts the keypresses in every full second
from the first keypress (a second without keys is a 0; the last, unfinished
second is left out because it would always look slow). The server computes:

```
cv          = standard deviation / mean of the counts   (coefficient of variation)
consistency = 100 * (1 - tanh(cv + cv^3/3 + cv^5/5))     (0..100 %)
```

`cv` has no unit, so keypresses per second and raw WPM per second (12 times
more) give the same value. The `tanh` maps `cv` from `[0, ∞)` to `100 … 0 %`;
the terms inside it are the start of the series of `artanh(cv)`, so for a small
`cv` the result is close to `100 * (1 - cv)`, and it never goes below 0. The
formula is the one monkeytype uses (`kogasa` in `packages/util/src/numbers.ts`),
so the numbers can be compared with that site. A round shorter than
`ConsistencyMinSeconds = 5` seconds gets none (too few values to judge). It is
kept in the history and shown to the user; the model does **not** use it.

## 4. Per-letter statistics: exponential moving average

For each letter we keep two smoothed values:

- `ErrEMA` – the probability of making a mistake on this letter,
- `TimeEMA` – the typical time per keypress, from clean presses only.

Each new sample `x` updates the value:

```
value_new = value_old + a * (x - value_old)
a = max(Alpha, 1 / n)              n = number of samples so far, Alpha = 0.1
```

For errors `x = 1` if the occurrence had a mistake, otherwise `0`. For time
`x = ms`.

**Why `max(Alpha, 1/n)`.** A plain EMA starts at 0 and needs many samples
before it means anything. With `a = 1/n`, the first samples give an exact
ordinary average (1st sample: weight 1, 2nd: 1/2, ...). Once `1/n` drops below
`Alpha` (after 10 samples), the update becomes a normal EMA.

**What `Alpha = 0.1` means.** The weight of a sample is multiplied by
`(1 - Alpha) = 0.9` with each newer sample, so it halves every
`ln 0.5 / ln 0.9 ≈ 6.6` occurrences of the letter. In practice the model
"remembers" about the last 20 occurrences. A larger `Alpha` reacts faster but is
noisier.

Lifetime counters (`Count`, `Mistakes`) are kept too, but only for display and
for the "enough evidence" rules below.

## 5. From statistics to difficulty

### 5.1 Raw difficulty

```
TargetMs  = 60000 / (TargetWPM * 5) = 400 ms           (TargetWPM = 30)

errorPart = clamp( ErrEMA / MaxErrorRate )             MaxErrorRate = 0.25
speedPart = clamp( (TimeEMA - TargetMs) / (SlowMs - TargetMs) )     SlowMs = 1000 ms

raw = ErrorWeight * errorPart + SpeedWeight * speedPart      0.6 and 0.4
```

`clamp` limits a value to the range 0..1.

- `errorPart` is 0 with no mistakes and 1 when a quarter or more of the
  occurrences have a mistake. Error rates of real typists are small numbers,
  so dividing by 0.25 spreads them over the whole 0..1 range.
- `speedPart` is 0 at the target speed or faster and grows linearly to 1 at
  one second per character. Being faster than the target is not rewarded
  further: the goal is to reach the target on every letter.
- Mistakes weigh a bit more (0.6) than speed (0.4). Touch typing courses
  usually put accuracy first, because a fast but wrong movement is being
  memorised.
- A letter with no clean, timed press yet gets `speedPart = 1`.

### 5.2 Shrinkage towards a prior

A single correct press would make a letter look perfect. So the raw value is
pulled towards an assumed **prior** while there is little evidence:

```
difficulty = (n * raw + k * prior) / (n + k)        prior = 0.7, k = 5, n = samples
```

This is a Bayesian average (also called additive smoothing). With `n = 0` the
difficulty equals the prior, so a **new letter starts as fairly hard** and gets
practised. After 5 samples data and prior weigh the same; after 50 the data
weighs 10 times more.

### 5.3 Worked example

Seven letters are open. The user is good at `e` and struggles with `s`:

| Letter | n | ErrEMA | TimeEMA | errorPart | speedPart | raw | difficulty | weight `exp(d/T)` |
|---|---|---|---|---|---|---|---|---|
| e | 60 | 0.02 | 300 ms | 0.08 | 0 | 0.048 | 0.098 | 2.66 |
| s | 30 | 0.12 | 520 ms | 0.48 | 0.20 | 0.368 | 0.415 | 63.4 |

If the other five letters look like `e`, then `s` is chosen as the focus with
probability `63.4 / (63.4 + 6 * 2.66) ≈ 80 %`, instead of `1/7 ≈ 14 %` for
uniform choice.

## 6. Unlocking letters

**Order.** Letters are sorted by how often they occur in the word list of the
language. The order is computed from the data, not written by hand, so a new
language only needs a word list. With the included lists (first lesson in bold):

| Language | Unlock order |
|---|---|
| English | **e a r s t i** n o l d c g h u p m y f w b k v x j q z |
| Polish | **a i e o z m n** w r s y c d p t k j ł u b l ę g ć ś ó ą ż h f ź ń |
| Ukrainian | **о а и т в н р і** с е д у п л м к з б я ь й ч ш г ж х ю є ц ї щ ф |
| Russian | **о а е т и с н р** л в д м у п ь к я з б г ш ч й ы ж ю х ц щ ф э ъ |

Letters that never occur in the list (Polish q v x, Ukrainian ґ) are not in the
order and never appear in exercises.

**First lesson.** At least `StartLetters = 6` letters, and more if needed until
at least `MinWords = 30` real words can be built from them: 6 letters for
English, 7 for Polish, 8 for Ukrainian and Russian. Without this rule the first
lesson would cycle through a handful of words.

**Every language has its own progress.** Statistics, unlocked letters and
history are stored per language: mastering `e` in English says nothing about
`е` in Russian, even though both sit on similar keys.

**Mastery** of a letter is a plain yes/no rule on the smoothed values:

```
mastered = n >= 20  and  ErrEMA <= 0.05  and  TimeEMA <= TargetMs (400 ms)
```

In words: at least 20 occurrences, under 5 % mistakes, at 30 WPM or faster.
It is checked on the raw values (not on the shrunk difficulty) so it can be
explained to a user in one sentence.

**Next letter.** After each portion of the stream (section 7): if every open
letter is mastered, the next letter in the order opens. At most one letter per
portion. A new letter
starts at the prior difficulty 0.7, which is higher than the difficulty of the
mastered letters, so it automatically becomes the focus.

**Experienced typists** start from the first letters too (there is no "open
all letters" choice, a decision of the owner): typing well, they master the
open letters quickly and unlock the rest in a short time. Once every letter is
open the engine works only through focus.

## 7. Choosing the words

The text is a **stream**: it is not built in advance but a few words at a
time while the user types, each time from the newest statistics. One piece
of the stream is a **portion** of `PortionWords = 6` words (about one line),
built by `Generator.Portion`. Only words made entirely of open letters are
allowed.

**Step 1, what to train: one focus letter for the whole portion.**

```
P(letter) = exp(d_letter / T) / Σ exp(d_i / T)        T = Temperature = 0.1
```

This is the softmax (Boltzmann) distribution, used in the same way in
reinforcement learning for choosing between actions. The **temperature** `T` is
one knob for "how hard to push on weaknesses":

- difficulty 1 against difficulty 0 gives a ratio of `e^(1/0.1) = e^10 ≈ 22000`;
  a gap of 0.1 in difficulty already gives `e ≈ 2.7`;
- with `T → 0` it always picks the single worst letter;
- with a large `T` every letter is almost equally likely.

`exp` is never 0, so no letter disappears from practice. Because the focus is
drawn again for every portion, it changes every few words: the user works on
one letter at a time, but never on the same one for long.

**Step 2, how to train it: every word of the portion contains the focus letter.**

```
D(word)   = average difficulty of the word's letters (each occurrence counts)
F(word)   = RankPenalty^(max(0, rank(word) - MaxRank) / RankStep)
P(word)  ~ exp(D(word) / T) * F(word) * RepeatPenalty^(uses in the last RecentWords words)
```

Among words that contain the focus letter, the ones that also contain other weak
letters are preferred.

**Common words first.** `F(word)` works like monkeytype's "English 200",
"1k", "2k" word lists, but without a switch: while the user learns the
letters the text is made of the most common words, and rarer words come in
step by step once the whole keyboard is known. The word lists are sorted by
frequency (section 12), so a word's place in its list, its **rank**
(0 = the most common word), says how common it is.

```
letters still locked:  MaxRank = RankStart
every letter open:     MaxRank = RankStart + (words in the list - RankStart) * min(1, typed / RampLetters)
```

`typed` = letters typed in learning rounds that ended with every letter open
(`Store.LettersTyped`, the sum of `chars` of those rounds in the history).
With `RankStart = 200`, `RankStep = 200` and `RankPenalty = 0.5`, every lesson
before the full alphabet allows the 200 most common words freely, and every
200 places further down the list halve a word's chance (rank 1000: 1/16).
When the last letter opens, the limit grows in a straight line and reaches the
whole list (about 2000) after `RampLetters = 10 000` letters, about 1700-1900
words or an hour at 30 WPM; then the penalty is gone. Choices behind this:

- **Why it is needed.** Without it, words are drawn evenly from the whole
  list: whatever the open letters are, about half of the possible words are
  from the rare end of the list (ranks 1000-2000), already in the first
  lesson. So a beginner types `sister`, `arrest`, `easier` as often as `is`,
  `at`, `see`. Common words are also short, so this rule makes the first
  lessons shorter too (11.1).
- **Flat while learning, ramp after (owner's decision, issue #25).** Until
  October 2026 the limit grew with every unlocked letter (half of the letters
  open: rank ~1100). Then a learner meets two new things at once, a new
  letter and rarer words, and a difficulty curve that the user cannot see is
  hard to explain. Now there is one difficulty at a time: while letters open
  only the words change their letters, not their rarity; after the full
  alphabet only the rarity grows. What the flat phase costs is measured in
  11.1.
- **The ramp counts typed letters, not rounds.** Rounds have different
  lengths (10 words to 60 seconds, section 7, "The round"), so "N rounds"
  would mean different amounts of practice. Typed letters do not depend on
  the round length. Letter mastery no longer measures progress here: every
  letter is already mastered once the last one opens. Free practice does not
  count: it never touches learning data. The number is computed from the
  history, so it needs no new stored field and survives export/import; a
  reset starts it again.
- **A floor for rare letters.** Some letters have almost no words among the
  200 most common: Russian `ф` and `ъ`, Ukrainian `ф`, English `q`, `x`, `z`
  have none, Polish `f` none, `ń` and `ź` one. Their words are all far down
  the list, and the penalty makes the most common of them much more likely
  than the others (two words 400 places apart: 4 times). So the focus letter
  uses its own limit:

  ```
  MaxRank(focus) = max(MaxRank, rank of the focus letter's FloorWords-th most common word in the list)
  ```

  With `FloorWords = 10`, the 10 most common words of such a letter come
  freely (all of its words if it has fewer). A portion has 6 words and the
  repeat penalty looks at the last 20, so 10 words fill a portion without a
  repeat. The words are counted in the whole list, not only among the open
  words: in the first lessons every letter has few open words, and counting
  only those would let rare words in exactly where common ones matter most
  (tried first: the mean rank of the first 30 exercises rose from ~330 to
  ~490). Letters with many common words are not affected: their 10th word is
  inside the top 200. Affected (rank of the 10th word): en `j` 1222, `p` 275,
  `q` 1823, `x` 851, `z` (8 words in all); pl `f` 1154, `ń` 1159, `ź` 683,
  `ć` 295, `ł` 250, `ó` 239, `ą` 217; uk `ф` 1797, `щ` 447, `ї` 450, `є` 291,
  `ц` 223, `х` 209, `ш` 205; ru `ф` 1410, `ц` 845, `щ` 807, `ю` 280, `х` 237,
  `ш` 231, and `ъ`, which had a single word in the Russian list before step 9 of
  section 12 added more.
  The penalty only shapes which words of the focus letter are taken: the
  focus letter itself (step 1) does not depend on it, so a rare letter is
  never trained less because its words are rare.
- **A soft penalty, not a ban.** The weight is never 0, so rare words stay
  possible, and a letter whose words are all rare still gets practised. Early
  lessons have few words at all (in English 49 in the first lesson, only 9 of
  them among the 200 most common), so a hard limit would leave the user with
  a handful of words. The penalty only makes the common ones much more likely.
- `RankPenalty` outside `(0, 1)` or `RankStep <= 0` turns the penalty off.
  A word list shorter than `RankStart` gets no penalty at all. `RepeatPenalty = 0.3` makes a word that was used in the
last `RecentWords = 20` words of the stream unlikely, and the same word never
appears twice in a row (also across the border of two portions). If the
focus letter has too few words, a word without it is taken.

**Mistyped words come back.** Words the user typed with a mistake (a wrong or
extra letter, or skipped letters; a mistake fixed with Backspace counts too)
are typed again: up to `RetryWords = 2` of them are put into the next portion
that is built, at random places, instead of new words. They are not repeated
right away, because of the waiting portions (below), but about 2 portions
later. Repeating a missed item after a short gap is the idea of spaced
practice; here it is the simplest version, one repetition. A word the user
went back into (Backspace, section 3) and retyped without a new mistake is
already practised and does not come back, unless its portion was sent before
the fix.

**Focus shown to the user** is the focus letter of the portion being typed.

**When does the model react?** After every portion. When the space after its
last word is typed, the portion's samples are sent, the statistics are
updated (and maybe a letter opens), and the answer is one new portion built
from the new values. It is added at the end of the text. `AheadPortions = 2`
portions always wait after the one being typed, so the user can read ahead
(12 words, shown one more for each finished word) and **words already on the
screen never change**. The cost
is a delay: a new portion is typed about 12 words after the data it was built
from. Before the stream, a whole exercise of 20 words was built in advance, so
a mistake on its first word changed the text only 20 to 40 words later.

**The round.** The stream is cut into rounds of `RoundPortions = 5` portions
(30 words), so the user always sees how much is left (a counter `12/30`) and
gets a result at a clear point. The last letter of the last word ends it (no space after it is needed,
right or wrong); Esc or
10 seconds without a key end it early. The WPM and accuracy of the round go to
the history, and the next round starts from scratch: new waiting portions, an
empty list of recent words. Inside a round the words are still chosen portion
by portion. The time of a round ends at its last keypress, so the pause that
ended it early does not lower the WPM.

The settings (`web/settings.js`) can make a round 10 or 60 words, or 30 or
60 seconds, instead of the default 30 words (`RoundPortions` portions, which
the typing test always uses). Only the end of the round moves: the stream
keeps asking for portions until the round has enough words (a time round
until the time is up), and a words round ends on the last letter of its
last word even in the middle of a portion; the samples of that portion go
with `/results` as usual. Word choice and the model are the same for every
length. Each round keeps its length in the history, and the stats screen
never mixes lengths.

**The earlier strategy** (`Generator.Next`, kept for the simulation): a whole
exercise of `ExerciseWords = 20` words at once, a new focus letter for every
word, the repeat penalty counted inside the exercise, statistics updated
after the exercise. Section 11.1 compares the two.

## 8. Parameters

All in `internal/config/config.go`.

| Name | Value | Meaning | Reason for the value |
|---|---|---|---|
| `Alpha` | 0.1 | EMA smoothing | half-life ≈ 6.6 occurrences, memory ≈ 20 |
| `MaxIntervalMs` | 2000 | longer gaps are pauses | a 2 s gap is far slower than any real keystroke |
| `TargetWPM` | 30 | goal speed (400 ms / char) | reachable goal for a beginner; raise it for advanced users |
| `SlowMs` | 1000 | "maximally slow" | 1 s per letter = hunting for the key |
| `MaxErrorRate` | 0.25 | "maximally inaccurate" | spreads realistic error rates over 0..1 |
| `ErrorWeight` / `SpeedWeight` | 0.6 / 0.4 | mix of the two parts | accuracy first, but speed matters |
| `PriorDifficulty` | 0.7 | assumption about an unseen letter | new letters must get practised |
| `PriorStrength` | 5 | how many samples the prior is worth | a few presses are not yet evidence |
| `Temperature` | 0.1 | focus strength | chosen with the simulation (section 11.1): fastest learning at a small loss of variety; was 0.25 |
| `MasteryMinSamples` | 20 | evidence needed for mastery | ≈ one EMA memory length |
| `MasteryErrorRate` | 0.05 | max mistakes for mastery | 95 % accuracy, a common minimum goal |
| `StartLetters` / `MinWords` | 6 / 30 | first lesson | enough variety from the first minute |
| `RepeatPenalty` | 0.3 | less repetition of recent words | variety |
| `ExerciseWords` | 20 | words per exercise of the earlier strategy (`Next`), and the unit of the simulation | short loop, model updates often |
| `PortionWords` | 6 | words per portion of the stream, one focus letter each | about one line: the model reacts after every line, the focus changes often enough not to bore |
| `AheadPortions` | 2 | portions waiting after the one being typed | about two lines to read ahead; fewer would leave the window half empty |
| `RecentWords` | 20 | the repeat penalty looks at this many last words | the same window as one exercise had |
| `RetryWords` | 2 | most mistyped words put back into one portion | at most a third of a portion is repetition |
| `RoundPortions` | 5 | portions per round (30 words), one result in the history | chosen by the owner: a clear end; about 1-2 minutes for a beginner, 20 seconds for a fast typist |
| `RankStart` | 200 | words up to this frequency rank come without a penalty until every letter is open | the size of monkeytype's smallest list ("English 200"): the core words of a language |
| `RankStep` | 200 | distance in ranks that halves a word's chance | one "200 words" block per halving: rank 1000 while learning letters is 16 times rarer |
| `FloorWords` | 10 | the focus letter's most common words that always come without the frequency penalty | a portion (6 words) without a repeat, with room for the next one; only letters with few common words (`ф`, `q`, `x`, `z`) are affected |
| `RampLetters` | 10 000 | letters typed after the full alphabet until every word comes freely | about 1700-1900 words (5.2-5.9 letters per word), ~60 rounds of 30 words, an hour at 30 WPM: the list grows by ~200 words every 6 minutes of typing |
| `ConsistencyMinSeconds` | 5 | shortest round that gets a consistency (section 3) | a standard deviation of 2-3 numbers says little; 5 s is a few words even for a beginner |
| `RankPenalty` | 0.5 | weight multiplier per `RankStep` over the limit | halving is easy to explain; with `T = 0.1` one step equals about 0.07 of difficulty, so weak letters still decide first |

The values were chosen by reasoning, not fitted to data. Tuning them on real
user data is a good subject for the evaluation chapter (section 11).

## 9. Known simplifications

- **Time belongs to a transition, not a letter.** The measured time is from the
  previous key to this one, so a slow `s` after `t` may really be a slow `t→s`
  movement. It is assigned to `s`.
- **Per user, not per person.** The model is kept per account, or per browser
  for a guest (ARCHITECTURE.md, "Accounts"). Someone who types as a guest on
  two computers is two learners to the model; the model itself does not know
  about users at all.
- **One model for every device.** Rounds typed on a phone (two thumbs on a
  touch screen) and on a physical keyboard update the same letter
  statistics, although they are different skills: slower phone rounds make
  letters look slow. Each round records what it was typed on
  (`Session.Device`: `keyboard` or `touch`), so the history can show whether
  this matters before the model treats the two differently.
- **Word lists from subtitles.** The 2000 most frequent words per language,
  counted in film and TV subtitles (section 12). That is spoken, everyday
  language: good for typing practice, but some names or slang may remain after
  filtering. Rare letters (`q`, `j`, `x`, `z`, `ф`, `щ`) have few words.
- **Simplified spelling.** Russian `ё` is typed as `е`, and Ukrainian words with
  an apostrophe (`м'ясо`, `п'ять`) are left out for now.
- **One stubborn letter blocks progress.** If one letter never reaches mastery,
  nothing new opens. The focus pushes that letter, which is the intended
  behaviour, but a cap (for example "open anyway after N exercises") may be needed.
- **Letter frequency, not keyboard position,** decides the order. Courses often
  start from the home row instead. This could be added as a second sorting key.

## 10. Where your own model can go further

These are directions, not things that are built:

1. **Bigram statistics.** Keep the same `KeyStat` for pairs like `th`, `ng`, and
   add their difficulty to `D(word)`. Directly targets the transition problem
   from section 9.
2. **Word-level choice in one step.** Instead of "letter, then word", a single
   softmax over `D(word)` with a different aggregation (sum, max, mean).
3. **Forgetting over time.** Skill fades between sessions. Half-life regression
   (Settles & Meeder, 2016) models the probability of recall as a function of time
   since last practice; the same idea can raise the difficulty of letters not seen
   for days.
4. **Fitting parameters.** With logged data, choose `Alpha`, `T` and the weights
   that best predict the next mistake.

## 11. How to show that it works (ideas for the evaluation chapter)

- **Unit tests** already show the core properties: a weak letter appears at least
  twice as often (`TestNext_WeakLetterGetsFocus`), old mistakes fade
  (`TestUpdate_RecentDataWins`), one press is not evidence
  (`TestDifficulty_ShrinkageNeedsEvidence`), only open letters are used.
- **Simulation** (built, see section 11.1).
- **Small user study.** Two groups (adaptive vs. random words), the same total
  practice time, compare WPM and accuracy before and after. The control group
  is built in and hidden: opening the site with `?group=random` puts that
  browser (or account) into it in every language, `?group=adaptive` takes it
  back (`web/app.js`, `POST /api/v1/group`). In the control group learning
  works as usual (the same letter model, the same unlocking, the same rounds
  and history) except the word choice: `Generator.RandomPortion` draws the
  open words uniformly, never the same word twice in a row, with no focus
  letter, no frequency penalty and no mistyped words coming back, like the
  "random words" strategy of the simulation (11.1). Every learning round
  stores its group (`Session.Group`, in `/export` too), so the two groups'
  rounds can be told apart in the data. The interface does not show the
  group, so participants do not know which one they are in; the letters bar
  only shows no focus letter. A reset or a new browser drops the group: open
  the link again.
- **Raw data.** Every round in the history keeps its raw keypresses
  (`keys`: letter, mistakes, time, in order; ARCHITECTURE.md, "Raw round
  records"), and `/export` writes them to the file. Replaying them through
  `engine.Apply` rebuilds the letter statistics, so the same real data can be
  run with other values of `Alpha` or the weights (section 10, point 4), and
  learning curves per letter can be drawn for the evaluation chapter.

### 11.1 Simulation

Code: `internal/sim` (tests in `internal/sim/sim_test.go`), run with
`go run ./tools/sim` (or `-lang en`) from the repository root. All numbers are
in `internal/config/config.go` (`Sim`).

**The simulated typist.** Every letter has a hidden error probability, drawn
uniformly from 0.03..0.30, and a hidden time per press, drawn from
350..900 ms. Each press of a letter improves it:

```
value = floor + (value - floor) * (1 - LearnRate)      LearnRate = 0.02
```

with floors of 1 % errors and 200 ms. A press is wrong with the hidden
probability and takes the hidden time ±25 % (uniform). The goal is reached when
every letter's **hidden** values meet the mastery goal (≤ 5 % errors,
≤ 400 ms). The hidden values are used only to judge the result; the strategies
see only what a real browser would send.

**Five strategies,** all with the same statistics (`engine.Apply`), the same
unlocking rule (`NextUnlocked`), and for each run the same typist and the same
random numbers:

1. **random words:** any open word, uniformly;
2. **best of 20 (monkeytype):** a copy of monkeytype's "weakspot" mode. Each
   letter has an EMA of (press time + 5000 ms for a mistake) over about 50
   presses; for every word slot 20 random open words are drawn and the one with
   the highest mean letter score is taken;
3. **adaptive (softmax):** this project's `Generator.Next`, 20 words at once,
   statistics updated after each exercise (the app before the stream);
4. **stream:** this project's `Generator.Portion` exactly as the app uses it
   now (section 7): rounds of 5 portions of 6 words, 2 waiting, statistics
   updated after each portion, mistyped words come back;
5. **stream, no frequency penalty:** the same, with `RankPenalty` off, to show
   what the "common words first" rule of section 7 changes.

Strategies 1-3 work in exercises of 20 words. The stream has no exercises, so
everything is counted in words and reported in "exercises" of 20 words: 163
exercises means 3260 words typed. The variety numbers of the stream are
measured on blocks of 20 words in a row.

**Variety.** A faster strategy is useless if it is boring, so the simulation
also measures how repetitive the exercises are (means over exercises):

- `dist`: share of different words in one exercise (100 % = no word twice);
- `rep`: share of words that were also in the previous exercise;
- `top`: share of words that contain the exercise's most common letter
  (how hard one letter is pushed);
- `len`: mean letters per word, and `rank`: mean place of the words in the
  frequency list, 0 = the most common word (printed by the tool, not in the
  table below; quoted in the bullets).

They are measured twice: on the **first 30 exercises** of the beginner above
(few open letters), and on an **experienced typist** with every letter
already open (every letter starts at ≤ 5 % errors and 150..350 ms) over 100
exercises.

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

Limits: the typist is invented. Letters do not influence each other, there is
no forgetting, and learning is the same exponential curve for every letter. The
simulation compares strategies under the same assumptions; it does not predict
how fast a real person learns. The variety numbers are simple proxies; how
boring an exercise feels can only be measured with real users.

## 12. Languages, layouts and word lists

**Layouts** (`data/layouts/`): English QWERTY; Polish "Programmers" (the
standard in Poland: QWERTY, Polish letters with AltGr, e.g. AltGr + a = ą);
Ukrainian and Russian ЙЦУКЕН. Finger zones are the same for every layout, by
key position. AltGr letters are shown in the corner of their base key; for such
a letter the trainer highlights the base key and the AltGr key together.

**The system layout is not replaced.** The user switches the operating system's
keyboard layout, as in real life (Windows: Win + Space). If the typed letter
is not in the language's alphabet at all (for example Latin letters while
practising Ukrainian), the app does not count a mistake but shows a hint to
switch the layout. Caps Lock is detected the same way. Wrong-layout presses
would otherwise ruin the statistics for reasons that have nothing to do with
typing skill.

**Word lists** (`data/langs/<id>/words.txt`) come from FrequencyWords
(Hermit Dave), word frequencies counted in the OpenSubtitles 2018 corpus
(CC BY-SA 4.0). Subtitle frequencies are a good model of everyday language
(Brysbaert & New, 2009). `tools/wordlists/build.py` rebuilds the lists and
documents every filtering step:

1. lowercase; Russian ё → е;
2. only words made of the language's alphabet;
3. one-letter words only if they are real words (en: a, i; pl: a, i, o, u, w, z; ...);
4. no tokens without a vowel (encoding garbage in the source);
5. Ukrainian: drop words more than 1.6× more frequent in the Russian list
   (Ukrainian subtitles contain a lot of Russian text; known Russian words fall
   between 1.7× and 2×, real shared words like "я" or "не" at about 1×);
6. Polish: drop words more frequent in the English list (untranslated names);
7. hand-made block lists in `tools/wordlists/block_<id>.txt`: names, places,
   profanity, sound tags ("sighs") and fragments ("don" from "don't");
8. keep the first 2000;
9. a letter that is in fewer than 10 of them (the `FloorWords` of section 7)
   gets its next most frequent words appended at the end, until it has 10.
   This adds 9 Russian words (`ъ` was in a single word: `объяснить`) and 2
   English ones (`z`: `zero`, `magazine`). The added words are the rarest
   in the list for the app. Not for Polish `q`, `v`, `x` and Ukrainian `ґ`:
   they occur only in loan words and names, and filling them brings in names
   (`vincent`, `quinn`, `ґрегорі`).
