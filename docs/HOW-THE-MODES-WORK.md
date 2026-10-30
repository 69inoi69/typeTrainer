# How the modes work

How the trainer decides what you type next, as the code does it now. Every
formula here is exactly what the code does, and every number comes from
`internal/config/config.go`. Why each part is built this way, and how it
got there: [docs/thesis/04-adaptive-algorithm.md](thesis/04-adaptive-algorithm.md).

Code: `internal/engine/model.go` (the math) and `internal/engine/generator.go`
(unlocking and word selection). Tests that check each claim:
`internal/engine/*_test.go`.

---

## 1. The idea in one paragraph

The user types **real words** in one of four languages (English, Polish,
Ukrainian, Russian). For every letter the program keeps a
short, constantly updated picture of how well the user types it: how often they
make a mistake on it and how long it takes. These two numbers are combined into
one **difficulty** between 0 and 1. Letters are introduced **gradually**, the
home row and the most frequent letters first; a new letter opens only when
every open letter is typed accurately at the target speed (and stays so). Inside the open letters, each next word is
chosen at random, but with probabilities shaped by difficulty, so weak letters
show up much more often and strong ones still appear sometimes. Learning has
no settings: the model alone decides what to practise. (Climb, the second
mode in `internal/freeplay`, for people who can already type, has its own
rule, section 12, and never feeds this model; see docs/HOW-THE-CODE-WORKS.md,
"Modes".)

## 2. Design decisions

Moved to [docs/thesis/04-adaptive-algorithm.md](thesis/04-adaptive-algorithm.md), "Design decisions".

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

With the setting **Stop on a mistake** (off by default) the cursor instead
waits on a wrong key until the right one comes: there are no skips and no
extra letters, and every wrong press there counts as one more `errors` of
that position. The sample is the same as without the setting: one per
position, its errors, and `ms` to the first press there.

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
- `typed` – the first wrong key pressed at this position (only when
  `errors` > 0; missing in rounds from before 2026-10-21). The model never
  reads it: the stats screen counts which keys you mix up with it.
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
language, but a letter under a resting finger counts `HomeBoost = 4` times
(`Generator.SetHome`). The resting keys come from the layout data
(`layout.RestingKeys`): in the row with the home bumps, one key per finger,
`a s d f j k l ;` on QWERTY, `ф ы в а о л д ж` on the Russian ЙЦУКЕН. The
order is computed from the data, not written by hand, so a new language only
needs a word list and a layout. With the included lists (first lesson in bold):

| Language | Unlock order |
|---|---|
| English | **a s l d e f r** t i n o k c g h u p m y w b v j x z q |
| Polish | **a s d k j i e l o** z m n w r y c p t ł u b ę g ć ś ó ą ż f h ź ń |
| Ukrainian | **о а в і д л и т** н ж р с е у п м к з б я ь й ч ш г х ю є ц ї ф щ |
| Russian | **о а л в д е т** и с н ы ж р м у п ь к я б з г ш ч й ю х ф ц щ э ъ |

Letters that never occur in the list (Polish q v x, Ukrainian ґ) are not in the
order and never appear in exercises.

**First lesson.** At least `StartLetters = 6` letters, and more if needed until
at least `MinWords = 30` real words can be built from them: 7 letters for
English (39 words) and Russian (38), 8 for Ukrainian (35), 9 for Polish (34).
Without this rule the first lesson would cycle through a handful of words.

**Every language has its own progress.** Statistics, unlocked letters and
history are stored per language: mastering `e` in English says nothing about
`е` in Russian, even though both sit on similar keys.

**Mastery** of a letter is a plain yes/no rule on the smoothed values, with
a margin once it is reached (`engine.MeetsGoal`, `Mastered`):

```
meets the goal = n >= 20  and  ErrEMA <= 0.05  and  TimeEMA <= TargetMs (400 ms)
stays mastered =             ErrEMA <= 0.10  and  TimeEMA <= TargetMs * 1.1 (440 ms)
```

In words: at least 20 occurrences, under 5 % mistakes, at 30 WPM or faster;
after that the letter stays mastered until it is clearly worse: over 10 %
mistakes or slower than about 27 WPM (`KeepErrorRate`, `KeepSlowdown`). It is
checked on the raw values (not on the shrunk difficulty) so it can be
explained to a user in one sentence. The state is remembered per letter
(`KeyStat.Held`, updated by every sample in `Update`).

**Next letter.** After each portion of the stream (section 7): if every open
letter is mastered, the next letter in the order opens. At most one letter per
portion. A new letter
starts at the prior difficulty 0.7, which is higher than the difficulty of the
mastered letters, so it automatically becomes the focus.

**Experienced typists** start from the first letters too (there is no "open
all letters" choice): typing well, they master the
open letters quickly and unlock the rest in a short time. Once every letter is
open the engine works only through focus.

### 6.1 Laps after Learn complete

Once every letter is open and mastered
(Learn complete), 30 WPM is no longer a goal: the typist reached it. So the
goal goes up and the letters are learned again at it, a lap at a time
(`engine.LapParams`, `lap.go`):

```
goal of lap n = min(TargetWPM + n * StepWPM, MaxWPM)
              = 30, 35, 40, 45, 50, 55, 60 wpm   (lap 0 .. 6; LastLap = 6)
```

- **When.** After the presses of a portion (or of the round's end) are
  applied, if every letter is open and mastered at the lap's goal
  (`LapDone`) and the lap is not the last, the next lap starts. The server
  keeps the lap per user and language (`Store.Lap`, `progress.lap`,
  migration 010) and every Learn round keeps the lap it was typed in
  (`sessions.lap`).
- **What changes.** Only `TargetWPM` (`Params.ForLap`): every formula of
  sections 4-7 stays and simply gets the higher goal, so the difficulty of a
  letter, its mastery and the word choice all follow it. `StartLap` turns
  `Held` off for every letter: each has to *reach* the new goal, not only
  *keep* the old one (the margin of section 6 would otherwise keep a 30 WPM
  letter "mastered" at 35). The EMAs are kept, so a letter already fast
  enough counts as mastered again at its next press and the slow ones become
  the focus. No letter is closed again.
- **Why to 60.** keybr raises its goal in the same way. Past about 60 WPM
  the limit is no longer single letters but words and their rhythm, which
  is what Climb trains.
- **What stays separate.** The personal speed goal of the settings is a
  line on the stats screen only; the algorithm never sees it.
- **The stats screen** judges every round at the goal of its own lap
  (`history.LetterTimeline`), and starts a new lap there as the trainer did.

### 6.2 The forecast: rounds to the next letter

The next letter's tooltip and the Learn stats screen say about how many
rounds the next letter is away ("≈ 6 rounds"; with every letter
open, on the stats screen, "Lap done in ≈ 6 rounds"). It only reads the numbers; nothing in the
model or the word choice sees it (`engine.RoundsToMastery`,
`history.NextForecast`).

For each open letter that is not mastered, its numbers after each of its
last `Window = 10` rounds (presses `n`, presses with a mistake `m`,
`ErrEMA`, `TimeEMA`; the rounds are the replay of the stats screen, the
last point the model as it is now). Each of the three parts of the mastery
rule gets its own estimate, and the slowest decides:

```
per round = presses in the window / rounds in the window
presses:  (20 - n) / per round
mistakes: q = mistakes / presses in the window   (the recent mistake rate)
          ErrEMA moves towards q by Alpha a press: E_k = q + (E - q)(1 - Alpha)^k,
          so it is under 0.05 after k = ln((0.05 - q) / (E - q)) / ln(1 - Alpha) presses;
          rounds = k / per round
speed:    (TimeEMA - TargetMs) / (fall of the least-squares line through TimeEMA, per round)

rounds for the letter = ceil(max of the parts not met yet), at least 1
rounds to the next letter = max over the letters still waiting
```

The least-squares slope over the points `(i, y_i)` is
`sum((i - mean i)(y_i - mean y)) / sum((i - mean i)^2)`.

**No answer** rather than a wrong one: a letter with fewer than
`MinRounds = 3` rounds (a line through two points is noise), with no timed
press yet, not typed in the window, with recent mistakes at 5 % or more,
or whose time line does not fall (not getting faster). One letter without
an answer means no answer for the next letter either, since it waits for
all of them; the panel then shows nothing (the letter line already says
what the gold letter needs). More than `MaxRounds = 50` is shown as "50+".

**Why the slowest letter.** A letter opens only when every open letter is
mastered (section 6), so the next letter is as far away as the letter
furthest from its goal.

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

Here `d` is the difficulty plus `UnmasteredBonus = 0.2` for a letter that is
not mastered yet (only for choosing, never shown as the letter's difficulty):
a letter that holds back the next one is practised more. It gets about 7 times the
weight of an equal mastered letter. While nothing is mastered every letter
gets the bonus, and softmax does not change when every weight is shifted the
same: the first lessons are not affected.

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
P(word)  = 0 when it was used MaxRepeats times in the round (and for the word just before or after)
```

Among words that contain the focus letter, the ones that also contain other weak
letters are preferred.

**Common words first.** `F(word)` works like monkeytype's "English 200",
"1k", "2k" word lists, but without a switch: while the user learns the
letters the text is made of the most common words, and rarer words come in
step by step once the whole keyboard is known. The word lists are sorted by
frequency (section 11), so a word's place in its list, its **rank**
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

- **Flat while learning, ramp after.** While letters open, only the words
  change their letters, not their rarity; after the full alphabet only the
  rarity grows.
- **The ramp counts typed letters, not rounds.** Rounds have different
  lengths (10 words to 90 seconds, section 7, "The round"), so "N rounds"
  would mean different amounts of practice. Typed letters do not depend on
  the round length. Letter mastery no longer measures progress here: every
  letter is already mastered once the last one opens. Climb does not
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
  repeat penalty looks at the last 24, so 10 words fill a portion without a
  repeat. The words are counted in the whole list, not only among the open
  words: in the first lessons every letter has few open words, and counting
  only those would let rare words in exactly where common ones matter most. Letters with many common words are not affected: their 10th word is
  inside the top 200. Affected (rank of the 10th word): en `j` 1222, `p` 275,
  `q` 1823, `x` 851, `z` (8 words in all); pl `f` 1154, `ń` 1159, `ź` 683,
  `ć` 295, `ł` 250, `ó` 239, `ą` 217; uk `ф` 1797, `щ` 447, `ї` 450, `є` 291,
  `ц` 223, `х` 209, `ш` 205; ru `ф` 1410, `ц` 845, `щ` 807, `ю` 280, `х` 237,
  `ш` 231, and `ъ`, which had a single word in the Russian list before step 9 of
  section 11 added more.
  The penalty only shapes which words of the focus letter are taken: the
  focus letter itself (step 1) does not depend on it, so a rare letter is
  never trained less because its words are rare.
- **A soft penalty, not a ban.** The weight is never 0, so rare words stay
  possible, and a letter whose words are all rare still gets practised. Early
  lessons have few words at all (in English 49 in the first lesson, only 9 of
  them among the 200 most common), so a hard limit would leave the user with
  a handful of words. The penalty only makes the common ones much more likely.
- `RankPenalty` outside `(0, 1)` or `RankStep <= 0` turns the penalty off.
  A word list shorter than `RankStart` gets no penalty at all.

**No word too often.** `RepeatPenalty = 0.3` makes a word that was used in
the last `RecentWords = 24` words of the round unlikely (24 plus the 6 of the
portion being built: the whole round of 30), and the same word never appears
twice in a row (also across the border of two portions). On top of the
penalty, a hard cap: a word used `MaxRepeats = 2` times in that window is not
picked again. When the cap leaves the focus letter no word, the slot takes
any open word by the same weights (`D`, `F` with the general `MaxRank`, the
penalty), so the round still trains the focus letter in most of its words
but no word comes a third time. Only a
dictionary too small for both rules relaxes them (first the cap, then
"not twice in a row").

**No one-letter words.** Words shorter than `MinWordLetters = 2` are left
out of learning when the generator is made (`NewGenerator`): English `a` and
`i`, Polish `w`, `z`, `o`, `u`, Russian `я`, `в`, `и`. They are among the most common words
of every list, so they came up often, and a lone letter is not a word to
practise. They are left out before anything is
counted, so they take no part in the unlock order, the first lesson or the
ranks. The word lists keep them (section 11): Climb and Freetype draw from
their own lists and are not affected.

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
from.

**The round.** The stream is cut into rounds of `RoundPortions = 5` portions
(30 words), so the user always sees how much is left (a progress ring) and
gets a result at a clear point. The last letter of the last word ends it (no space after it is needed,
right or wrong). The WPM and accuracy of the round go to
the history, and the next round starts from scratch: new waiting portions, an
empty list of recent words. Inside a round the words are still chosen portion
by portion. The time of a round ends at its last keypress. Leaving the
window in the middle of a round (another window, a hidden tab), or 10
seconds without a key, pauses it: the time away is taken out of the round
(its start and its last key move forward by it; for the 10 seconds, from
the last key on), and the first key after the pause is not measured, like
the first key after a Backspace.

A Learn round is 30 words (`RoundPortions` portions); Climb and Freetype also offer 10 to 50 words or
15 to 90 seconds (`web/settings.js`, `LENGTHS`). Only the end of the round moves: the stream
keeps asking for portions until the round has enough words (a time round
until the time is up), and a words round ends on the last letter of its
last word even in the middle of a portion; the samples of that portion go
with `/results` as usual. Word choice and the model are the same for every
length. Each round keeps its length in the history, and the stats screen
never mixes lengths.

**The earlier strategy** (`Generator.Next`, kept for the simulation): a whole
exercise of `ExerciseWords = 20` words at once, a new focus letter for every
word, the repeat penalty counted inside the exercise, statistics updated
after the exercise. Section 10 compares the two.

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
| `Temperature` | 0.1 | focus strength | chosen with the simulation (section 10): fastest learning at a small loss of variety |
| `MasteryMinSamples` | 20 | evidence needed for mastery | ≈ one EMA memory length |
| `MasteryErrorRate` | 0.05 | max mistakes for mastery | 95 % accuracy, a common minimum goal |
| `KeepErrorRate` | 0.10 | a mastered letter stays mastered up to this error rate | twice the goal: one slip (+0.1 at most) is not enough to lose it, a real problem is (section 6) |
| `KeepSlowdown` | 0.10 | ...and up to TargetMs · 1.1 (440 ms, ~27 WPM) | the running average wobbles about ±15 ms around a steady speed; 40 ms is clearly more |
| `UnmasteredBonus` | 0.2 | added to the difficulty of a letter not mastered yet, for the choice only | e^(0.2/0.1) ≈ 7 times the weight of an equal mastered letter: a blocking letter gets about half the portions among ten (section 7) |
| `HomeBoost` | 4 | a resting key counts this many times as frequent in the unlock order | the smallest boost that starts English with the home row and `f` (section 6) |
| `StartLetters` / `MinWords` | 6 / 30 | first lesson | enough variety from the first minute |
| `RepeatPenalty` | 0.3 | less repetition of recent words | variety |
| `MaxRepeats` | 2 | a word comes at most this many times in a round | the penalty alone let a rare letter's 10 words come 5-6 times in 30 (section 7); 2 still lets a mistyped word come back |
| `MinWordLetters` | 2 | shorter words never appear in learning | `a`, `i`, `в` are filler, not practice (section 7) |
| `ExerciseWords` | 20 | words per exercise of the earlier strategy (`Next`), and the unit of the simulation | short loop, model updates often |
| `PortionWords` | 6 | words per portion of the stream, one focus letter each | about one line: the model reacts after every line, the focus changes often enough not to bore |
| `AheadPortions` | 2 | portions waiting after the one being typed | about two lines to read ahead; fewer would leave the window half empty |
| `RecentWords` | 24 | the repeat penalty and the cap look at this many last words | with the portion being built (6), a whole round of 30 |
| `RetryWords` | 2 | most mistyped words put back into one portion | at most a third of a portion is repetition |
| `RoundPortions` | 5 | portions per round (30 words), one result in the history | a clear end; about 1-2 minutes for a beginner, 20 seconds for a fast typist |
| `RankStart` | 200 | words up to this frequency rank come without a penalty until every letter is open | the size of monkeytype's smallest list ("English 200"): the core words of a language |
| `RankStep` | 200 | distance in ranks that halves a word's chance | one "200 words" block per halving: rank 1000 while learning letters is 16 times rarer |
| `FloorWords` | 10 | the focus letter's most common words that always come without the frequency penalty | a portion (6 words) without a repeat, with room for the next one; only letters with few common words (`ф`, `q`, `x`, `z`) are affected |
| `RampLetters` | 10 000 | letters typed after the full alphabet until every word comes freely | about 1700-1900 words (5.2-5.9 letters per word), ~60 rounds of 30 words, an hour at 30 WPM: the list grows by ~200 words every 6 minutes of typing |
| `ConsistencyMinSeconds` | 5 | shortest round that gets a consistency (section 3) | a standard deviation of 2-3 numbers says little; 5 s is a few words even for a beginner |
| `RankPenalty` | 0.5 | weight multiplier per `RankStep` over the limit | halving is easy to explain; with `T = 0.1` one step equals about 0.07 of difficulty, so weak letters still decide first |
| `Laps.StepWPM` / `Laps.MaxWPM` | 5 / 60 | after Learn complete the goal goes up 5 WPM a lap, up to 60 (section 6.1) | as keybr; past 60 WPM single letters are no longer the limit, Climb is for that |
| `Forecast.Window` / `MinRounds` / `MaxRounds` | 10 / 3 / 50 | the forecast reads a letter's last 10 rounds, needs 3, says "50+" beyond 50 (section 6.2) | 10 rounds of a few presses are about what the EMA remembers (20 presses); with the simulation (section 10), 3 rounds answered more often than 5 at about the same error |

The values were chosen by reasoning and the simulation (section 10), not
fitted to real data; `docs/thesis/08-testing-and-verification.md` says how they could be.

## 9. Known simplifications

- **Time belongs to a transition, not a letter.** The measured time is from the
  previous key to this one, so a slow `s` after `t` may really be a slow `t→s`
  movement. It is assigned to `s`.
- **Per user, not per person.** The model is kept per account, or per browser
  for a guest (HOW-THE-CODE-WORKS.md, "Accounts"). Someone who types as a guest on
  two computers is two learners to the model; the model itself does not know
  about users at all.
- **Word lists from subtitles.** The 2000 most frequent words per language,
  counted in film and TV subtitles (section 11). That is spoken, everyday
  language: good for typing practice, but some names or slang may remain after
  filtering. Rare letters (`q`, `j`, `x`, `z`, `ф`, `щ`) have few words.
- **Simplified spelling.** Russian `ё` is typed as `е`, and Ukrainian words with
  an apostrophe (`м'ясо`, `п'ять`) are left out for now.
- **One stubborn letter blocks progress.** If one letter never reaches mastery,
  nothing new opens. The focus pushes such a letter much
  harder (`UnmasteredBonus`, section 7), but a person who does not get
  faster on it still waits; a cap (for example "open anyway after N
  portions") may be needed. Real data will tell.
- **The order is frequency with a home row boost,** not a full course plan
  (home row, then the top row, then the bottom row). A full plan would need
  words for every step; real words decide where a rare letter goes.

## 10. Simulation

Code: `internal/sim` (tests in `internal/sim/sim_test.go`), run with
`go run ./tools/sim` (or `-lang en`) from the repository root. All numbers are
in `internal/config/config.go` (`Sim`). `go test ./...` guards the main
result: `tools/sim/main_test.go` runs three typists per language and fails
if random words need less than 3 times the practice of the stream.

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

**The numbers** (recounted in issue #153). `go run ./tools/sim` on the
configured model; the earlier runs and what each change did are in
`docs/thesis/04-adaptive-algorithm.md`, "Simulation runs, in order".
Median exercises to the goal (20 typists), and the stream's variety:

| Language | Random words | Best of 20 | Adaptive, T = 0.1 | Stream (the app) | Stream, no frequency penalty | Stream variety, first 30 | Stream variety, expert |
|---|---|---|---|---|---|---|---|
| en | 2179 | 280 | 144 | 134 | 132 | 79 / 40 / 86 | 97 / 5 / 67 |
| pl | 1444 | 256 | 182 | 164 | 158 | 72 / 47 / 76 | 98 / 4 / 63 |
| uk | 1772 | 268 | 184 | 172 | 172 | 73 / 46 / 77 | 98 / 4 / 61 |
| ru | 2588 (19/20 reached) | 350 | 194 | 183 | 175 | 76 / 45 / 80 | 98 / 5 / 65 |

The stream needs 8-16 times fewer exercises than random words and 1.6-2.1
times fewer than best of 20, in every language. The forecast is within
max(2, 25 %) in 79-87 % of cases (mean error 1.2-1.5 rounds).

Limits: the typist is invented. Letters do not influence each other, there is
no forgetting, and learning is the same exponential curve for every letter. The
simulation compares strategies under the same assumptions; it does not predict
how fast a real person learns. The variety numbers are simple proxies; how
boring an exercise feels can only be measured with real users.

## 11. Languages, layouts and word lists

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
   learning leaves even those out (`MinWordLetters`, section 7), the lists keep them;
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

## 12. Climb, the second mode

Code: `internal/freeplay` (tests in `freeplay_test.go`); the routes in
`internal/api/freeplay.go`. For people who can already type: no letters
to unlock; one number, the **level** (1..10), says which words come. The
idea is the "flow channel" (Csikszentmihalyi): a task a little harder than
your skill keeps you engaged and growing; much harder frustrates, much
easier bores. So the level follows the typist, but in steps they can feel:
each level is a clear set of words, and a round is an exam at one level.

**Words only**: lower case, no capitals, no
punctuation. Climb trains the words themselves, how the letters of a word
follow each other; a comma or a capital in a list of random words is not a
sentence, it only breaks the rhythm.

**The levels** (`Params.Levels`, `MaxRank`). Level n draws evenly from the
`Levels[n-1]` most common words of the long list (`free.txt`, section 13;
a language without it uses `words.txt`, and a list shorter than a level
caps it), without the words of one letter (`MinLetters = 2`, `Longer`:
"a" and "i" are nothing to train; Freetype keeps them, as monkeytype does). A word used recently is rarer, the same word never comes twice
in a row (the same draw as Freetype).

| Level | Words | Average length (letters) | Examples | On monkeytype |
|---|---|---|---|---|
| 1 | 200 | 4.0 | every, through, left | English 200 |
| 2 | 500 | 4.6 | food, outside, country | |
| 3 | 1 000 | 5.1 | experience, planet | English 1k |
| 4 | 2 000 | 5.6 | brilliant, curious | |
| 5 | 3 000 | 5.9 | signature, monitor | |
| 6 | 5 000 | 6.2 | teenager, literature | English 5k |
| 7 | 7 500 | 6.5 | noticing, moreover | |
| 8 | 10 000 | 6.7 | eyesight, capitalism | English 10k |
| 9 | 15 000 | 7.0 | curriculum, dictated | |
| 10 | 25 000 | 7.3 | poltergeist, evaporated | English 25k |

The steps roughly double the words, not add the same number: word
frequencies fall steeply (Zipf's law), so a straight line from 200 to
25 000 would reach words nobody types ("pippin", "dubbing") by level 5,
and half of the climb would be spent on them. Five levels are monkeytype's
lists, so a typist can compare.

**The round** is typed at one level from start to end: the level of the
round is sent with every request for words and stored with the round
(`storage.Session.Level`). **The verdict** of a round (`Judge`), from its
accuracy (the share of letters typed without a mistake):

```
accuracy >= 96 %   ->  pass
accuracy <  92 %   ->  fail
otherwise          ->  hold (counts for nothing)
```

Speed never counts: on rarer words everyone slows
down, so a speed bar would either block the top levels or mean nothing on
the first ones; the result and the stats show the speed for the typist to
judge.

**Moving** (`Standing`), from the history: only the last run of rounds at
one level counts, round by round:

```
pass:  passes + 1, fails = 0     3 passes          ->  one level up
fail:  passes = 0, fails + 1     2 fails in a row  ->  one level down
hold:  fails = 0
```

A move sets both counts to 0. The top level stays the top, level 1 stays
level 1. The passes need not be in a row (a hold between them does not
matter), but a fail between them starts them again: three clean rounds
with no bad one between. Nothing is stored for the counts: every round
keeps its level, and a run at another level (the level moved, or the
typist picked one on the steps above the round bar) starts them again. A new typist
starts at `LevelStart` = 1 and can pick any level before any round.

**Old history** (rounds from before 2026-10-20, level 0..1) gets the new
level the old one stands for, the old number divided by 10, rounded up
(`LevelFromOld`: 1..10 -> 1, 44 -> 5, 91..100 -> 10): in PostgreSQL by
migration `008`, in a file (and in the copy the GitHub Pages version keeps
in IndexedDB) on import, when the file has no `climbLevels`. Those rounds
count in `Standing` like any other.

| Name | Value | Reason |
|---|---|---|
| `Levels` | 200 ... 25 000 | the table above |
| `LevelStart` | 1 | the common words; anyone who types well picks a higher level or passes it in three rounds |
| `PassAccuracy` / `FailAccuracy` | 96 / 92 | pass: at most ~1 mistake in 25 letters; fail: more than ~1 in 12 |
| `PassesUp` | 3 | one clean round can be luck, three show the level is mastered |
| `FailsDown` | 2 | one bad round is a slip, two in a row say the level is too hard |
| `History` | 50 | `Standing` reads the last 50 rounds; a longer run at one level counts from those |

All values are reasoned, not fitted; the stats screen (Climb's own) shows
every round with its level, which is the data to tune them on.

### 12.1 Weak pairs

Code: `internal/freeplay/weak.go` (tests in `weak_test.go`), used by
`Portion` and the routes. The level makes the text harder for everyone the
same way; this part is the typist's own. Someone who can already type is
rarely slow on a letter, they are slow on a **movement**: `th` flies, `ck`
stumbles. So Climb counts **letter pairs** (bigrams): the press of the
second letter, timed from the first, is the movement between the two keys.

**The data** is the raw record every Climb round keeps (`keys`: letter,
mistakes, ms since the previous press), from the last `WeakRounds = 20`
rounds of Climb. Nothing new is stored, and learning's rounds never count
(the modes stay apart). A pair is two lower-case letters typed one after
the other: a space, a mark or a capital breaks it (Shift adds its own
time). A press with no time (after a Backspace or a pause) counts only when
it was a mistake.

**The cost** of a pair is its average time per press, with a mistake
counted as a press of `WeakMissMs = 1000` ms:

```
cost(pair) = (sum of clean timed ms + mistakes * 1000) / (clean timed presses + mistakes)
```

One number for speed and accuracy together, in a unit anyone can read
("ck costs you 410 ms"). The same idea as monkeytype's "weak spot" mode,
which scores letters with a 5000 ms penalty per mistake; here per pair, and
with 1000 ms, learning's `SlowMs` ("as slow as it gets"), so that one slip
in 15 presses does not outweigh a pair that is slow every time.

**Weak** pairs are the `WeakPairs = 3` most costly ones that were pressed
at least `WeakMinSamples = 15` times and cost more than the typist's
average over all pairs. An even typist has none; so does a new one (too
little data), and then Climb is exactly as in section 12.

**The words.** Each word of a portion is, with the chance `WeakShare = 0.5`,
drawn from the words that contain a weak pair, else from all words; both
draws use the same level limit (`MaxRank`) and the same "do not repeat"
weights. If the level allows fewer than `WeakMinWords = 10` words with a weak
pair, there is no such draw (the same few words would repeat). The
result screen names the weak pairs,
so the typist sees what the next rounds practise.

| Name | Value | Reason |
|---|---|---|
| `WeakRounds` | 20 | ~3000 pair presses: a common pair gets 100+, its cost is steady; old rounds drop out as the typist improves |
| `WeakMinSamples` | 15 | a pair seen once or twice is noise |
| `WeakMissMs` | 1000 | a mistake = learning's slowest press; see above |
| `WeakPairs` | 3 | a few at once, so the text stays varied |
| `WeakShare` | 0.5 | half the words: the practice is felt, the text is still typing, not a drill |
| `WeakMinWords` | 10 | fewer words would repeat within a round |

Limits: the time of a press is the movement into it, so a pair's cost
includes how fast the typist reads ahead, not only the fingers; whether
practising a pair makes it faster, and how fast, is a question for real data
(the raw keys of every round make it measurable later).


## 13. Freetype, the third mode

Freetype is for just typing, as on monkeytype: nothing adapts and nothing
is learned. The typist picks a word list, "the n most common words" with n
one of 200, 1000, 5000, 10 000, 25 000 (`FreetypeLists` in
`internal/config`), and the words are drawn evenly from it
(`freeplay.Picker.Freetype`), in lower case, without punctuation. Every
list has its own history (`storage.FreetypeMode`): a round on 200 common
words and one on 25 000 rare ones are not compared, like rounds of
different lengths.

**Kinds of text.** A round can
be of one kind instead of plain words, and each kind has a history of its
own (`storage.FreetypeVariants`), since a round of sentences is slower than
one of plain words:

- *Long words*: only the words of the chosen list with at least `LongMin`
  (6) letters, drawn by the same rule (history per list: `1000-long`). A
  list without any gives any word.
- *Sentences* (`freeplay.Sentences`): real sentences with their capitals
  and punctuation, from Tatoeba (`data/langs/<id>/sentences.txt`, built by
  `tools/sentences/build.py`: only the language's letters, capitals and
  `TextMarks`, 4 to 18 words, every word among the 25 000 most common, so
  no names and no rare words). They have no word list. A portion is whole
  sentences drawn evenly, at least `PortionWords` words; a sentence already
  in the round is drawn again (up to `SentenceTries` times). The round
  still ends after the words or the time chosen, so the last sentence may
  be cut.

*Your own text* is the third kind: a text the typist pastes, typed word by
word in its order, each round starting where the last one ended. It stays
in the browser (`web/customtext.js`), never reaches the server, and has
one history for every text (`freetype-custom`). Only the letters of the
language, capitals and `TextMarks` (`. , ? ! ; : ' -`) are kept.

**The draw** is the one Climb uses (`draw`): a word's weight is
`RepeatPenalty^(uses in the last RecentWords words)`, and the word just
typed is never next. On a list of 25 000 words, weighing every word for
every word drawn would be slow, so `drawWord` first draws by rejection: a
random word is kept with the chance of its weight (at most 1). That gives
exactly the same odds as weighing the list (a word comes out with a chance
proportional to its weight), and as almost no word is recent, it almost
always ends at the first try. After 32 misses (a short list full of recent
words) it weighs the whole list instead, with the same odds; so the result
never depends on which way was taken (`TestDraw_OddsAreTheWeights`).

**The long list** (`data/langs/en/free.txt`, built by
`tools/wordlists/free.py`). The 2000 words of learning come from subtitle
counts with a hand-made block list (section 11). Past a few thousand words
those counts are full of names, slang and fragments, too many to block by
hand, so the long list adds a spelling dictionary: a word is kept only if
the Hunspell dictionary of the language (en_US, from SCOWL) accepts it in
lower case. Names are written with a capital there, so they drop out by
themselves. Offensive words are removed by the dictionary's own marks
(NOSUGGEST) and a public list of bad words (LDNOOBW). Of the 50 000 most
frequent subtitle words, about 30 800 pass; the list keeps the first
25 000. For now only English has a long list; a language without one
offers the lists its 2000 words allow (200 and 1000).
