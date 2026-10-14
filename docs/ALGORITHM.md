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
show up much more often and strong ones still appear sometimes. There is one
mode and no settings: the model alone decides what to practise.

## 2. Design decisions

| Decision | Alternative | Why this one |
|---|---|---|
| Real words only | Generated letter combinations (pseudo-words), as in keybr.com | Words are what people type in real life, they are easier to read and read faster, and they keep motivation up. Cost: early lessons have fewer possible texts. Handled by the unlock order and the `MinWords` rule (section 6). |
| Statistics per letter | Per key pair (bigram), per word | Simplest unit that can be explained and shown on the keyboard. Bigrams are a natural extension (section 10). |
| Smoothed recent statistics (EMA) | Lifetime totals | Skill changes. A lifetime error rate remembers mistakes from weeks ago forever. |
| Probabilistic choice (softmax) | Always train the single worst letter | Always drilling one letter is boring and over-fits; probabilities give focus *and* variety. |
| Gradual unlocking | All 26 letters from the start | A beginner cannot learn 26 finger positions at once. The same engine also serves experienced typists: they open everything in the intro. |
| Statistics, not a neural network | ML model | No training data is needed, every decision can be explained with a formula, and it runs instantly on the server. |

## 3. What is measured

Typing never stops on a mistake (as on monkeytype, so the rhythm is kept):

- a wrong letter turns red and the cursor moves on;
- Backspace goes back inside the current word (Ctrl+Backspace: the whole
  word), and into the previous word only if that word has a mistake;
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
  was wrong. Extra letters count as errors of the space after the word.
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
3. the first press of the exercise (no previous press) and the first press
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
| e | 60 | 0.02 | 300 ms | 0.08 | 0 | 0.048 | 0.098 | 1.48 |
| s | 30 | 0.12 | 520 ms | 0.48 | 0.20 | 0.368 | 0.415 | 5.27 |

If the other five letters look like `e`, then `s` is chosen as the focus with
probability `5.27 / (5.27 + 6 * 1.48) ≈ 37 %`, instead of `1/7 ≈ 14 %` for
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

**Next letter.** After each exercise: if every open letter is mastered, the
next letter in the order opens. At most one letter per exercise. A new letter
starts at the prior difficulty 0.7, which is higher than the difficulty of the
mastered letters, so it automatically becomes the focus.

**Experienced typists** choose "I can already touch type" in the intro and get
all letters at once. From then on the engine works only through focus.

## 7. Choosing the words

Every exercise has `ExerciseWords = 20` words. Only words made entirely of open
letters are allowed. Each word slot is filled in two steps.

**Step 1, what to train: pick a focus letter.**

```
P(letter) = exp(d_letter / T) / Σ exp(d_i / T)        T = Temperature = 0.25
```

This is the softmax (Boltzmann) distribution, used in the same way in
reinforcement learning for choosing between actions. The **temperature** `T` is
one knob for "how hard to push on weaknesses":

- difficulty 1 against difficulty 0 gives a ratio of `e^(1/0.25) = e^4 ≈ 55`;
- with `T → 0` it always picks the single worst letter;
- with a large `T` every letter is almost equally likely.

`exp` is never 0, so no letter disappears from practice.

**Step 2, how to train it: pick a word that contains the focus letter.**

```
D(word)   = average difficulty of the word's letters (each occurrence counts)
P(word)  ~ exp(D(word) / T) * RepeatPenalty^(times already used in this exercise)
```

Among words that contain the focus letter, the ones that also contain other weak
letters are preferred. `RepeatPenalty = 0.3` makes repeating a word inside one
exercise unlikely, and the same word never appears twice in a row.

**Focus shown to the user** is simply the open letter with the highest
difficulty.

**When does the model react?** Statistics are updated after each exercise, and
the next exercise is generated from the new values. Exercises are kept short (20
words, about 100 characters: 40 seconds at 30 WPM, 20 seconds at 60 WPM) so this
feels immediate. Updating after each word
would be possible, but the text would change under the user's eyes.

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
| `Temperature` | 0.25 | focus strength | strong focus (×55) without excluding anything |
| `MasteryMinSamples` | 20 | evidence needed for mastery | ≈ one EMA memory length |
| `MasteryErrorRate` | 0.05 | max mistakes for mastery | 95 % accuracy, a common minimum goal |
| `StartLetters` / `MinWords` | 6 / 30 | first lesson | enough variety from the first minute |
| `RepeatPenalty` | 0.3 | less repetition inside one exercise | variety |
| `ExerciseWords` | 20 | words per exercise | short loop, model updates often |

The values were chosen by reasoning, not fitted to data. Tuning them on real
user data is a good subject for the evaluation chapter (section 11).

## 9. Known simplifications

- **Time belongs to a transition, not a letter.** The measured time is from the
  previous key to this one, so a slow `s` after `t` may really be a slow `t→s`
  movement. It is assigned to `s`.
- **One global user.** There are no accounts yet; all statistics belong to whoever
  uses the server.
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
  practice time, compare WPM and accuracy before and after.

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

**Three strategies,** all with the same statistics (`engine.Apply`), the same
unlocking rule (`NextUnlocked`), 20 words per exercise, and for each run the
same typist and the same random numbers:

1. **random words:** any open word, uniformly;
2. **best of 20 (monkeytype):** a copy of monkeytype's "weakspot" mode. Each
   letter has an EMA of (press time + 5000 ms for a mistake) over about 50
   presses; for every word slot 20 random open words are drawn and the one with
   the highest mean letter score is taken;
3. **adaptive (softmax):** this project's `Generator.Next`.

**Result** (20 typists per strategy, exercises until the goal, mean; a run gives
up after 3000 exercises):

| Language | random words | best of 20 | adaptive, T = 0.25 | adaptive, T = 0.1 (test only) |
|---|---|---|---|---|
| en | 2447 | 292 | 299 | 173 |
| pl | 1520 | 274 | 450 | 246 |
| uk | 1818 | 286 | 464 | 247 |
| ru | 3000 (none reached) | 1175 | 490 | 248 |

What this shows:

- Any targeting beats random words by 5 to 10 times. Random words almost never
  practise rare letters (Russian `ъ`, `э`, `ф`): no Russian run reached the goal.
- With the current `Temperature = 0.25` the adaptive model loses to the
  simple best-of-20 rule in Polish and Ukrainian. Most of the time goes into
  unlocking (all letters open after ~430 exercises against ~240). The likely
  reason: the softmax still spends much practice on letters that are already
  good, while best of 20 almost always takes a word with the weakest letter.
- With `T = 0.1` the adaptive model is the best in every language. That column
  was run only as an experiment: the configured value is still 0.25.
- Best of 20 fails on Russian: once all letters are open, words with the
  rarest letters are seldom among 20 random words, so they are seldom practised.
  The adaptive model picks the letter first and then a word that contains it,
  so even a letter with a handful of words gets practised.

Limits: the typist is invented. Letters do not influence each other, there is
no forgetting, and learning is the same exponential curve for every letter. The
simulation compares strategies under the same assumptions; it does not predict
how fast a real person learns.

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
8. keep the first 2000.
