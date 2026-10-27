# typeTrainer: development log

File names below are as they were at the time. Since issue #152 the docs
are `docs/PRODUCT.md`, `docs/CODE-RULES.md` (with the old COMMENTING.md),
`docs/HOW-THE-CODE-WORKS.md` (was ARCHITECTURE.md),
`docs/HOW-THE-MODES-WORK.md` (was ALGORITHM.md), `docs/DESIGN-RULES.md`
(was GUIDELINES.md) and `docs/TEXT-RULES.md` (was UI-TEXT.md);
`docs/USER-GUIDE.md` was removed.

How the practical part of the engineering thesis was built together with an AI
coding agent, from the first idea to a working, published application.
3–17 October 2026.

Reference material for writing the thesis · Lublin University of Technology ·
@69inoi69. Live: [69inoi69.github.io/typeTrainer](https://69inoi69.github.io/typeTrainer/) ·
Code: [github.com/69inoi69/typeTrainer](https://github.com/69inoi69/typeTrainer)

> **How to use this document.** These are working notes, not thesis text.
> They record what was decided, why, and in which order, so the thesis can
> describe the process accurately. Everything here comes from the
> conversation history (the chats and the project threads with the agent) and
> the Git history of the repository. The student's own messages were written
> in Russian; where they are quoted, they are paraphrased in English. The
> theory chapters still have to be written in your own words
> (anti-plagiarism check), and the formulas should be taken from
> `docs/ALGORITHM.md`, which always describes what the code really does.
>
> Until 13 October this log was a PDF built by a script. On 17 October it was
> converted to this Markdown file, so it can be read on GitHub and edited
> without any tools. Chapters 1–4 tell 3–12 October as they were written then
> (a few later reversals are marked); chapters 5–9 are new and cover
> 13–17 October.

## Contents

- [At a glance](#at-a-glance)
- [1. Starting point: the idea and the first prototype](#1-starting-point-the-idea-and-the-first-prototype) (3 Oct)
- [2. Defining the algorithm](#2-defining-the-algorithm) (3 Oct)
- [3. Setting up the way of working](#3-setting-up-the-way-of-working) (3 Oct, night)
- [4. The main development day](#4-the-main-development-day) (12 Oct)
- [5. Working through pull requests](#5-working-through-pull-requests) (13–14 Oct)
- [6. Testing the algorithm and choosing words](#6-testing-the-algorithm-and-choosing-words) (14–15 Oct)
- [7. Modes, settings, accounts and a database](#7-modes-settings-accounts-and-a-database) (15 Oct)
- [8. Polishing the interface](#8-polishing-the-interface) (16–23 Oct)
- [9. The algorithm audit](#9-the-algorithm-audit) (16 Oct)
- [10. Key decisions and why](#10-key-decisions-and-why)
- [11. How the AI-assisted workflow worked](#11-how-the-ai-assisted-workflow-worked)
- [12. Known limitations and open questions](#12-known-limitations-and-open-questions)
- [13. Where this material fits in the thesis](#13-where-this-material-fits-in-the-thesis)
- [Appendix: every pull request](#appendix-every-pull-request)

## At a glance

| | |
|---|---|
| What | A web application for learning touch typing. It looks and feels like Monkeytype, but it teaches: it tracks every letter's mistakes and speed and builds each exercise from real words around the user's weak letters. |
| Stack | Go (standard library only, plus the PostgreSQL driver `pgx` through `database/sql`) · plain HTML, CSS and JavaScript as native ES modules (no frameworks, no npm, no build step) · storage behind a `Store` interface: in memory by default, PostgreSQL when `DATABASE_URL` is set · accounts on the normal server · a WebAssembly build for GitHub Pages. |
| Languages | English, Polish, Ukrainian, Russian; 2000 real words each; own keyboard layout and own progress per language. Since 16 October only English is shown; the other three are hidden until English is polished. |
| Size (17 Oct) | About 7,650 lines of Go, 5,700 lines of frontend, 106 automated tests, 9 documentation files, 64 merged pull requests. |
| Timeline | Idea and first prototype: 3 Oct. Tools, Git and GitHub: 3 Oct (night). Main development day: 12 Oct (31 commits). Pull requests and the agent working in a shared project: 13–17 Oct (PR #1–#64). |
| Roles | Student: idea, product decisions, visual judgement, testing on a real PC and phone, final say, merges every pull request. AI agent (Claude): implementation, tests, documentation, research, simulations, browser checks, plain-language explanations. |

### Timeline

| When | Phase | Result |
|---|---|---|
| 3 Oct, ~16:30 | Idea | Feasibility discussion; the student's prompt with stack, features and architecture rules. |
| 3 Oct, ~16:40 | Prototype 1 | Working typing screen, keyboard with finger zones, simple adaptive weights, tests, README. |
| 3 Oct, ~16:45–17:05 | The algorithm | Student's clarification (weights, temperature, one mode, real words); version 2 with EMA, softmax, gradual unlocking; `docs/` folder. |
| 3 Oct, night | Workflow | VS Code profile, official Claude Code extension, Git for Windows, GitHub repository, `AGENTS.md` rules. |
| 12 Oct, 11:43–12:33 | Foundations | Smooth caret and stats screen; WebAssembly site on GitHub Pages; four languages; interface in four languages. |
| 12 Oct, 13:05–16:29 | Feel and UI | Rewards and streak, Tab without restart, start screen, icon toolbar, hands, hands-on intro, reset, status pills. |
| 12 Oct, 17:09–18:52 | Phones | Phone layout, keyboard hidden by default, contrast, no tap highlight. |
| 12 Oct, 19:02 | Data | Export / import of all statistics as a JSON file; first look at real data. |
| 12 Oct, 19:23–22:28 | Consistency | One look for all controls, favicon, logo, raw wpm, heatmap on the stats screen, keyboard presets, inline messages, new hands. |
| 12 Oct, 22:39 | Presentation | README for visitors; full user guide in `docs/`. |
| 13 Oct | Pull requests | This log (as a PDF), `main` protected, every change through a pull request (#1–#4). |
| 14 Oct | Shared project | The repository connected to a Claude project with threads; frontend split into modules (#5); research on similar trainers. |
| 14–15 Oct | Algorithm tests | Simulation of the algorithm against two baselines; temperature lowered to 0.1 (#6); words chosen in real time in portions, rounds of 30 words (#10); common words first (#22, #36). |
| 15 Oct | Modes and accounts | Free practice and a one-time typing test (#28); settings (#35); accounts, raw keystrokes and PostgreSQL (#30–#34); a batch of small fixes grouped into PRs (#37–#43). |
| 16 Oct | Interface | A long series of interface passes after the student's own test (#44–#60): English only, sentence case, one window style, no keyboard on phones, rulebooks for texts and design. |
| 16 Oct | Audit | Written audit of the algorithm, no code changes (#58). |
| 16–17 Oct | One screen | Result and typing screens fitted on one screen, Monkeytype-like (#61–#63); one settings window opened with Esc (#64). |
| 17 Oct | This log | Converted from PDF to Markdown and brought up to date. |

## 1. Starting point: the idea and the first prototype

*3 October*

The final semester leaves most of the time for the thesis. The student had
already chosen the stack he wanted to learn (Go for the logic, plain
JavaScript for the page, PostgreSQL for data) and wanted to test, on a real
task, how well an AI agent could build it, before deciding how to work.

**The idea**, in the student's words (paraphrased): it should look and be as
pleasant to use as Monkeytype, but it must *teach* touch typing. It should
show where to put the fingers. It needs its own algorithm that picks words.
Statistics, a database, pleasant animations. One language (English) is enough
for the thesis.

**The first prompt.** The student brought a prepared specification (written
with the help of another chat). Its main points are worth keeping, because the
project still follows them:

- Backend in Go with the standard library only; frontend in plain HTML, CSS
  and JavaScript without a build step.
- Storage in memory, but behind an interface, so PostgreSQL can be added later
  without rewriting anything.
- An on-screen keyboard coloured by finger zones that highlights the next key.
- A server-side adaptive engine: per-key attempts, errors and time; a
  difficulty score; weighted random selection.
- Architecture rules: engine knows nothing about HTTP or the database, layouts
  are data, routes start with `/api/v1/`, all tunable numbers in one place,
  unit tests for edge cases (a key with no statistics yet).
- Explicitly not now: user accounts, PostgreSQL, extra features. "The smallest
  thing that works."

**Prototype 1** came back within minutes: the typing screen, the coloured
keyboard, a placeholder formula (difficulty from error rate plus normalised
reaction time) and 9 engine tests. A browser version of the same logic could
be tried directly on the phone. The student's reaction was that it already
looked and worked like Monkeytype.

## 2. Defining the algorithm

*3 October*

After trying prototype 1, the student explained what the algorithm must really
do (paraphrased):

> "Words should be picked dynamically depending on where the person makes
> mistakes, how often, which letters are bad. There should be weights,
> something like a temperature. It should analyse the typing and give exactly
> the words where you struggle, so you train your weak spots right away. One
> mode: switching difficulty by hand is not nice, it should decide by itself.
> And maybe a short, not boring intro for people who cannot type at all."

He also asked whether this needs "its own AI". The answer that shaped the
thesis: **no neural network is needed**. Plain statistics can do it (keybr.com
works this way too), and for a thesis this is an advantage: every decision can
be written as a formula and defended, instead of "the model decided". The
weaknesses of prototype 1 were named and fixed in version 2:

| Problem in prototype 1 | Change in version 2 |
|---|---|
| Lifetime error rate: old mistakes are never forgotten. | Exponential moving average (EMA) per letter for errors and time; recent presses count more. |
| A word was chosen through one random letter, the effect was weak. | First a focus letter, then a word that contains it and preferably other weak letters. |
| Linear weights. | Softmax with a temperature T: P ~ exp(difficulty / T). One parameter controls how hard it pushes on weak letters. |
| Beginners see all 26 letters at once. | Gradual unlocking by letter frequency; a new letter opens when all open ones are mastered. |
| One correct press makes a letter look perfect. | Shrinkage towards a prior (assume a new letter is fairly hard until there is evidence). |

Two further product decisions came from the student here:

- **Real words only.** He disliked keybr's letter combinations; he had learned
  to type himself by retyping Wikipedia articles. Real words are easier to
  read and keep motivation up.
- **Documentation for the thesis from day one:** how the algorithm works and
  why, plus a reading list. A market analysis (Monkeytype, keybr and others)
  was deliberately postponed until he has tried those sites himself.
- Accounts, profile pages and leaderboards were mentioned as a possible future
  and explicitly kept out of scope. (Accounts were built later, on 15 October,
  see chapter 7.)

The result of the evening was version 2 with 17 engine tests and the `docs/`
folder: `ALGORITHM.md`, `ARCHITECTURE.md`, `LITERATURE.md`.

The parameter values as of 17 October (all in `internal/config/config.go`;
the temperature was 0.25 until the simulation in chapter 6, and the portions,
rounds and word-rarity rules were added there too):

```
per letter (EMA, a = max(0.1, 1/n)):  ErrEMA and TimeEMA (time from clean presses only)
raw         = 0.6 * clamp(ErrEMA / 0.25) + 0.4 * clamp((TimeEMA - 400 ms) / 600 ms)
difficulty  = (n * raw + 5 * 0.7) / (n + 5)          prior 0.7, worth 5 samples
P(letter)   ~ exp(difficulty / 0.1)                  the focus letter of a portion
P(word)     ~ exp(mean difficulty of its letters / 0.1) * 0.3^(uses)
              * 0.5^(rarity steps beyond the 200 most common words)
mastered    = n >= 20 and ErrEMA <= 5 % and TimeEMA <= 400 ms (30 wpm)
unlocking   : all open letters mastered -> the next letter (by frequency) opens
first lesson: at least 6 letters and at least 30 real words
portions    : 6 words with one focus letter, built while you type; a round = 5 portions (30 words)
```

## 3. Setting up the way of working

*3 October, night*

The same night the project moved from a downloaded zip to a proper setup on
the student's laptop (Windows, PowerShell). The advice was that a good AI
workflow today means the agent works directly in the project folder, and that
the tool matters less than a few habits around it:

- **Git and GitHub from the first day**, so every working step is a save point
  and any mistake can be undone.
- **VS Code with a clean profile** for the thesis (only Go, the official
  Claude Code extension, Mistral Vibe, SQLTools with the PostgreSQL driver)
  instead of switching to VSCodium.
- **One agent per task**, never two editing the same files at once.
- **A rules file in the repository** that every agent reads at the start of a
  session.

Small practical problems were solved on the way and are typical for a first
setup: port 8080 was taken by another program (the server moved to port 3000,
which is exactly why all settings live in one config file); VS Code did not
see Git until it was restarted; the GitHub repository had to be created before
the first push. The first commit, *Add agent rules*, landed on 4 October at
01:21.

### The project rules (AGENTS.md)

The rules file turned the student's requirements into instructions every
agent follows. Its main points:

- Who the agent works with: explain every change in simple words; talk in
  Russian, write code and docs in English; work in small steps and show a plan
  for anything bigger than one feature; never commit or push without being
  asked.
- Stack that must not change without asking: Go standard library, plain
  JavaScript, no frameworks, no npm.
- Architecture: the engine is pure logic; all data goes through `Store`; every
  tunable number in `config.go`; layouts and word lists are data; keypress
  handling stays light (one layout read per frame, CSS or Web Animations
  only).
- **The math in `model.go` is the core of the thesis: formulas and parameter
  values must not change without asking.** When behaviour changes,
  `ALGORITHM.md` and the tests change in the same task.
- Not now: leaderboards, profile pages, more themes, more languages.
- Definition of done: gofmt, go vet and go test pass, edge cases tested, docs
  updated, a short summary for the student.

The rules grew with the project (four languages, i18n, visual rewards in
`fx.js`, the two builds, accounts, the guideline files), but the core stayed
the same. On 12 October changes were pushed straight to `main`; from
13 October `main` is protected and every change goes through a pull request
that the student merges himself (chapter 5).

## 4. The main development day

*12 October*

On 12 October the project went from a local prototype to a published,
four-language application in 31 commits. The student worked partly at home and
partly from his phone during classes, testing the live site and sending
screenshots with comments. The phases below follow the Git history.

### 4.1 Polishing the core (11:43)

- The caret became one element that glides between letters; key presses
  animate with the Web Animations API, so typing stays fast.
- Statistics moved to their own screen with an animated type / stats switch:
  totals, a speed chart, every letter with its difficulty.
- A common beginner trap was explained and handled: opening `index.html` by
  double-click (file://) cannot work, the page must come from the server. The
  page now says so.

### 4.2 An online version without a server (11:55, 12:25)

GitHub Pages can only host static files. Instead of rewriting the logic in
JavaScript, the **same Go code is compiled to WebAssembly** and runs in the
browser: `main.go` starts the normal server, `main_wasm.go` exposes the API to
JavaScript, a small shim sends `/api/v1/` requests to it, and shared setup
lives in `setup.go`. Every push to `main` runs the tests and republishes the
site. A caching bug (browsers mixing old and new files after a deploy) was
fixed by versioning every asset with the commit id.

### 4.3 Four languages (12:21, 12:33)

- Word lists: the 2000 most frequent words per language from FrequencyWords
  (OpenSubtitles 2018, CC BY-SA 4.0), filtered by a documented script
  (`tools/wordlists/build.py`) instead of hand-made lists, so the thesis can
  describe how they were made.
- Layouts as data: Polish Programmers (AltGr letters), Ukrainian and Russian
  ЙЦУКЕН. Languages are configured in `data/languages.json`; a new language
  needs no code.
- **Each language keeps its own progress**: being good at English says nothing
  about Ukrainian.
- The engine works on letters (runes), not bytes, for ą and Cyrillic; formulas
  unchanged.
- Caps Lock and a wrong system layout are detected and **not counted as
  mistakes**; the user gets a hint instead.
- The whole interface follows the practice language. Finger hints use the
  grammatical case each language needs (for example "lewym małym palcem",
  "лівим мізинцем").

### 4.4 Making it feel alive (13:05–13:51)

- Visual rewards in a separate file (`fx.js`): confetti, counting numbers,
  small bumps, a clean-word streak. Rule: rewards never change what is
  measured or sent.
- **Tab does not restart the exercise.** A deliberate product decision at the
  time: restarting throws away exactly the mistakes the trainer learns from.
  Tab answered with a kind message, and the number of resisted restarts was
  shown at the end. *Reversed on 16 October* (chapter 8): Tab now starts a new
  round, as on Monkeytype; the dropped round is not saved, but the presses
  already sent stay learned, so nothing the trainer learns from is lost.
- A start screen: the logo types itself, a short phrase appears, the logo flies
  into the header. It also covers the WebAssembly loading.
- A centred layout with an icon toolbar and tooltips; two hands above the
  keyboard that light up the finger for the next key.
- A hands-on first-visit intro instead of a text to read: press the eight
  home-row keys (detected by physical key position, so it works with any
  system layout), press space, start. Experienced typists could open all
  letters (removed on 15 October: everyone starts from the first letters).
- Shortcuts: Shift + Tab for type / stats, Alt + 1…4 for the language. The
  header switches stay exactly centred in every language.

### 4.5 Details that came from using it (14:55–16:29)

From here most changes were the student's reactions after using the app.
Examples of how feedback became decisions:

| Student's feedback (paraphrased) | What changed |
|---|---|
| Notifications overlap at the bottom; they should be top right, stay longer, with a progress bar, and look different per type (but not random). | A stack of messages with a time-left bar; six kinds (record, new letter, mastered, streak, Tab resisted, Tab) with their own colour, icon and small animation. |
| "A reset button would be nice, to get back to the starting state quickly while there is no database." | New Store method and API route; a two-click bin button that resets all languages and browser settings. |
| "When I press Tab, the caret flies across the screen." | Bug found: two animations multiplied the same CSS transform. The caret position moved to a separate property. |
| "Make everything smooth, without fanaticism; the layout warning disappears abruptly." | Folding, fading and growing transitions for warnings, keyboard, intro and language switch. |
| "I like the whole interface to stay in place; the warning pushes everything up." Status text should be icons. | Status pills under the letters; warnings appear on top of them in one fixed slot, so nothing moves. |

### 4.6 Phones (17:09–18:52)

- Tested by the student on his phone during class: a big empty gap under the
  header, notifications covering the header.
- Fixes: phone-only layout rules, compact messages, the on-screen keyboard
  **hidden by default on touch devices** (there are no physical keys to look
  at), content centred when it is hidden.
- Higher-contrast switches and no blue flash when tapping.

### 4.7 Getting data out (19:02)

The student asked whether he should send his statistics later for debugging.
Because progress lived only in memory (and only in the open tab on the
website), an **export / import** of all statistics as one JSON file was added:
full history, per language, validated on import (impossible numbers or foreign
letters are rejected and nothing changes). It keeps progress across restarts,
lets the data be analysed, and is the natural first format for moving to
PostgreSQL. The first exported file (two exercises typed on a phone) was
checked: all counters added up, and it showed why conclusions need about 20
presses per letter.

### 4.8 One consistent look (19:23–22:28)

The evening was spent on consistency and clarity. Several features went
through more than one version until they felt right:

| Feature | Iterations |
|---|---|
| Keyboard size | Slider 0–140 % → buttons − / 100 % / + → presets off · S · M · L that are shares of the largest keyboard that fits the window, so the typing screen never scrolls. (Replaced on 14 October by a fully automatic size.) |
| Hands | Bars per finger → SVG hand with palm and outlines → one soft shape with fully coloured fingers → thumbs pointing up and fingers inside the palm, "so it looks natural". |
| Notifications | Queue at the bottom → stack top right with a time bar → part of the interface: a message temporarily replaces the status line under the letters. |
| Heatmap | Red overlay on the typing keyboard → the student did not understand what he was looking at → a grey keyboard on the stats screen where red means difficulty, with a legend and numbers on hover. |
| Streak | Small counter → same size and line as wpm / acc, with a flame that gets "hotter" at 10, 25 and 50 clean words. |

- Other additions: a tab icon (a yellow key with the home-row bump), a logo
  with a small random motto that the start-screen phrase flies onto, **raw
  wpm** next to wpm (all keypresses, shown only, never stored), keyboard
  shortcut hints at the bottom, a "beginner guide" button, a flat background.
- A question the student asked about the algorithm ("what algorithm and which
  words did you take?") was answered with a worked example on his own data,
  which is a good format for the thesis too.

### 4.9 Presenting the project (22:39)

The README was rewritten for a random visitor of the public repository: logo,
one-line pitch, a link to the live site, why it exists, what it does, the
algorithm in 30 seconds, quick start, credits. The detailed description of
every screen moved to `docs/USER-GUIDE.md`.

### Side work: the thesis schedule (harmonogram)

In the same period the official thesis schedule (PDF for the supervisor) was
rewritten twice. The student wanted an iterative, flexible plan instead of
fixed dates for each task, with the writing of the theoretical and practical
parts as their own stages, no milestones, and signature fields for the student
and the supervisor.

## 5. Working through pull requests

*13–14 October*

### 5.1 Main is protected (13 Oct, PR #1–#4)

On 13 October the way of working changed: `main` became protected, and every
change now reaches it through a pull request that the student reads and merges
himself. The agent works in a separate branch and never pushes to `main`. This
gives a review step and a clean history: every PR is one understandable unit
that can be undone on its own.

- **#1** the first version of this log (then a PDF built by a Python script).
- **#2** a shorter README.
- **#3** the rule "main is protected, work through pull requests" in
  `AGENTS.md`.
- **#4** a Monkeytype-style typing flow and redrawn hands.

### 5.2 A shared project with threads (14 Oct)

On 14 October the repository was connected to a Claude project: one shared
chat where the student drops requests, and a separate thread (with its own
agent) for each task. The agents share a memory of the project's decisions
and the student's preferences, so a new thread does not have to ask again.
The first thread reviewed the whole project and named its weak points: a
1,300-line `app.js`, no tests for the API, adaptivity on single letters only,
and no evidence yet that the algorithm beats random words. It suggested a
simulation (chapter 6).

### 5.3 The frontend split into modules (14 Oct, PR #5)

`app.js` was split into 10 native ES modules. The plan was revised after the
student pasted a review from another AI model, which was checked against the
code rather than followed blindly: the renaming of shared state to one object
`S` came first as its own commit, `letters.js` was merged into `typing.js`,
and `input.js` was kept separate to avoid an import cycle. A **three-layer
import rule** (imports only go down, no cycles) is written at the top of
`web/state.js` and checked by a Go test (`webmodules_test.go`). The cache
versioning from 12 October was extended to module imports.

### 5.4 Research on similar trainers (14–15 Oct)

Notes are in the project files; the main findings for the market analysis:

- **keybr**: ignores errors (its confidence is target time / real time),
  always focuses on the one weakest letter, uses generated pseudo-words,
  updates its averages once per lesson. AGPL licence.
- **Monkeytype**: has a "weakspot" mode (it draws 20 random words and takes
  the one with the weakest letters), an event log of every keystroke, a
  consistency metric, AFK handling. GPL licence.
- **typecelerate**: closed source, uses bigrams and trigrams over a window of
  the last 6 tests, aimed at intermediate typists who choose what to train.
  The contrast for the thesis: manual control there, automatic adaptation
  here. Ideas noted for later: "spacegrams" (the space and the letters around
  it), freshness of words across exercises.
- The licences mean **ideas may be borrowed, code may not be copied**.
- Taken over: store raw data (every keystroke), and use Monkeytype's weakspot
  as a second baseline in the simulation.
- Rejected: dropping presses faster than 40 ms (it would drop real fast
  presses). Instead the operating system's auto-repeat of a held key is now
  ignored (`ALGORITHM.md` §3).
- The four keyboard layouts were checked against the official ones: no
  errors.
- A paid "agent wiki" service was looked at and rejected (paid, its claims
  could not be verified).

## 6. Testing the algorithm and choosing words

*14–15 October*

### 6.1 The simulation (PR #6)

A simulation (`go run ./tools/sim`) lets a simulated typist with weak letters
learn with three ways of choosing words: random words, Monkeytype's
"best of 20", and our softmax. It counts how many exercises it takes to master
the whole alphabet.

- With the original temperature **T = 0.25 our softmax lost** to "best of 20"
  in Polish and Ukrainian.
- With **T = 0.1 it was the best in all four languages**: English 173,
  Polish 246, Ukrainian 247, Russian 248 exercises, against random words
  2447, 1520, 1818 and "did not finish" in Russian.
- The student worried that a lower temperature makes the text repetitive. So
  variety was measured first: T = 0.1 costs only 5–9 points of word variety,
  and the repetition early on comes from the small number of open letters, not
  from the temperature.
- The student approved T = 0.1. This is the first parameter change that came
  from evidence instead of reasoning, and it is the core of the evaluation
  chapter. The same PR gave the text a dark, terminal-like card.

### 6.2 Redesign and real-time word choice (PR #7–#10)

The student sent a long list of wishes after using the site. It became:

- **#7** a quieter header, live numbers, a little humour, a profile stub, a
  README link after the repository rename.
- **#8** a fixed window of 3 lines of text; a result screen instead of
  pop-up messages (fast typists never look at pop-ups); a site tour; a fix of
  the new-record check.
- **#9** an automatic keyboard size instead of the S/M/L presets (moved into
  #10).
- **#10** **words are chosen while you type**: portions of 6 words, each with
  its own focus letter, built from the latest data through a new route
  `/api/v1/portion`; a word with a mistake comes back soon. The student first
  chose an endless ribbon of text, then rejected it ("there must be
  boundaries") and chose **rounds of 30 words**. The simulation shows 6–7 %
  faster learning in English, Polish and Ukrainian.

### 6.3 Common words first (15 Oct, PR #22, #36)

Issues #12–#21 were written by another AI model (Mistral) from a review; each
was checked against the code (no invented problems were found). The student
overruled one of them ("one mode is crap, there must be a choice"), which led
to free practice (chapter 7).

- **#22 (issue #21):** beginners saw rare words. A penalty for word length had
  a weak effect. The student wanted the Monkeytype feeling of
  "200 → 1k → 2k words", so it became a **penalty for rare words**: each step
  of 200 ranks beyond the 200 most common words halves a word's chance. In the
  first lessons the average word rank went from 905 to 391, for 1–5 % slower
  learning in the simulation.
- **#36 (issue #25):** until the whole alphabet is open, only the 200 most
  common words come without the penalty; after that the penalty-free range
  grows gradually with the letters typed. A rare letter always gets
  at least 10 words (the Russian "ф" has no word in the top 200).
- **#23 (issue #13 and a new metric):** no text selection by dragging, the
  round ends on the last letter, a calmer new-letter effect, "open all
  letters" removed (everyone starts from the first letters), new words fade
  in, and a **consistency** metric (`engine/consistency.go`), shown only for
  rounds longer than 5 seconds.

### 6.4 Explaining instead of only shipping

While #36 was being planned, the student said he did not understand the plans
(variables like K and N, ranks, formulas) and felt reduced to "approve and
merge". This became a lasting rule: explain in plain words with concrete
examples, no variable names without a plain explanation, offer simple choices,
and name which decisions are his. For the thesis this matters directly: he
must be able to defend every part.

## 7. Modes, settings, accounts and a database

*15 October*

### 7.1 Two modes and a test (PR #28, #29)

The student's model of the product:

- **Learning** holds all the algorithm work and is the main focus until the
  defence. No difficulty switches: the algorithm decides.
- **Free practice** draws words evenly from the whole list, has its own
  history and **never touches the letter model** (`internal/freeplay`). It is
  a future Monkeytype-like mode with its own statistics, deliberately minimal
  until after the defence.
- It opens when every letter is unlocked, or after a one-time **typing test**:
  one 30-word round at 30 WPM and 97 % accuracy, checked by the server. There
  is no self-declared skill level; the test is the only early way in, and it
  is provisional.

**#29** cleaned up the repository around this structure: the HTTP handlers
split into four files, `letters.js` and `result.js` split out of `typing.js`,
the tests run on every pull request (`.github/workflows/tests.yml`), the
keyboard keeps one size across modes and is hidden by default in free
practice.

### 7.2 Settings (PR #35)

Round length (10 / 30 / 60 words or 30 / 60 seconds), live numbers and the
caret style. The student caught a problem in the plan: **rounds of different
lengths must never be mixed** in one chart or record, because a 10-word round
and a 60-second round are not comparable. Every round now stores its length
(migration 002) and the statistics can be filtered by length. The rule
"settings change how much and how it looks, never what" went into `AGENTS.md`.
The typing test ignores the settings.

### 7.3 Accounts and PostgreSQL (PR #30–#34)

The student asked how far the project is. The estimate was: learning mode
about 75 % as an app, the thesis about 40–45 %. He then asked for real
accounts and a database. Rust and Redis were discussed and rejected (Redis is
a cache written in C, not needed here); PostgreSQL through `pgx` became the
one allowed third-party module.

- **#30** every `Store` method takes the user id.
- **#31** every round is stored raw, with every keystroke and its time, so the
  data can be re-analysed later with a different formula.
- **#32** sign up / log in / log out in pure Go: passwords hashed with
  PBKDF2-SHA256 (600,000 iterations), a session cookie; a password or a login
  token itself is never stored, only its hash.
- **#33** `PostgresStore`, used when `DATABASE_URL` is set; tables in numbered
  migration files. Both stores pass the same tests.
- **#34** a guest per browser (cookie, stored hashed) so visitors without an
  account do not share progress; at most 10 failed logins per 15 minutes;
  a setting for running behind a proxy.

On GitHub Pages there is no server, so there are no accounts there; progress
stays in the tab unless saved with Export. Pages stays until the project gets
its own server; then Pages and the WebAssembly build go away in one PR. The
student plans to learn DevOps on this step himself (Docker with the app and
PostgreSQL, a VPS, a domain with HTTPS, monitoring).

### 7.4 A batch of small items (PR #37–#43)

The student asked for **fewer pull requests**: items are grouped by category
into a few PRs, with one commit per item inside, so a single item can still be
undone.

- **#37** words for rare letters (ъ, z), Backspace into the previous word
  (issue #26), words appearing one by one (issue #24), and the **hidden control
  group** `?group=random` for the thesis study (learning draws random open
  words; every round stores its group; never shown in the interface).
- **#38** typing feel (issue #18, kept open on purpose as a feedback loop: the
  student types and says "more / less", one number in `web/feel.js` changes)
  and bigger hands (issue #19).
- **#39** screen layout: side navigation, a light theme, statistics on one
  screen, login top right, a bottom bar on phones (issues #16, #17).
- **#40** texts: a first style guide for interface texts and two guides
  (issues #15, #20).
- **#41** `docs/COMMENTING.md` and comments across the repository (why, not
  what; every file says what it is for).
- **#42** a steadier test that sometimes failed by chance.
- **#43** README.

## 8. Polishing the interface

*16–17 October*

### 8.1 After the student's own test (PR #44–#54)

On 16 October the student typed on the site himself and sent a long list of
problems. It took many passes, and several lessons about the way of working
came out of it (section 11.2).

- **#44** the modes named for the interface; Backspace fixed on Android; one
  caret colour; a quicker intro; **only English is shown**: Polish, Ukrainian
  and Russian are hidden until English is polished (their data stays and keeps
  passing the tests); the light theme rebuilt with its own palette; one
  window style for every panel.
- **#45** a snappier caret (100 → 35 ms) and word fade.
- **#46** the result screen shows only what is useful (each letter's time
  before → after in ms instead of percentages) and stays until the user
  presses Next round or Enter. In the same PR the agent had swapped the font
  without being asked; the student was upset, the font was restored, and the
  rule "change only what was asked" was written down.
- **#47–#48** blocks on the result screen, per-screen help, sentence case
  instead of all-lowercase, toggles with Off on the left and On on the right,
  a Next round button, letter chips.
- **#49–#50** a design skill for the agent and a review by another model
  (Gemini), checked against the code.
- **#51–#53** a lighter block caret; the words of the round coloured by speed
  with a word-speed chart; a tick for mastered letters; the phone keyboard
  closes after a round; Try again after a failed test; the name in the header.
- **#54** a tap bug fixed, the name written **typeTrainer** everywhere, a full
  text pass.

### 8.2 Rulebooks for texts and design (PR #55, #56)

- **#55** settings texts, a README rewrite, the text guide renamed to
  `docs/UI-TEXT.md`.
- **#56** the student's own **12 principles for interface texts** in
  `docs/UI-TEXT.md` (every text earns its place, nothing for the obvious,
  explain what is not obvious and spell out consequences, the same word for
  the same thing, check the code before writing) and `docs/GUIDELINES.md`
  (product, layout, breakpoints, hierarchy, interaction, accessibility).
  `AGENTS.md` links both; every later change follows them.

### 8.3 Phones without the drawn keyboard (PR #57)

On phones and tablets the drawn keyboard and hands are gone: a touch screen
has its own keyboard, and the freed space goes to bigger text. Every round
now records its input device (keyboard or touch, migration 004). The letter
model stays shared across devices for now; whether to split it is decided
later from data (`ALGORITHM.md` §9). An opinion from another model (ChatGPT)
was weighed here too.

### 8.4 Small fixes (PR #59, #60)

- **#59** the website link fixed (the address is case-sensitive:
  `typeTrainer`).
- **#60** Next round as an icon "›", Try again as "↻".

### 8.5 One screen, like Monkeytype (16–17 Oct, PR #61–#63)

The student wanted the result and typing screens to fit on one screen with no
empty gaps. The loop changed: before any code reached a PR, the agent posted
screenshots (desktop and phone), and the student answered with comments
pinned on the images.

- **#61** the result on one screen, without a box and without the keyboard;
  the record line "New best! Keep it up, king" (the student's choice);
  Correct / Wrong / Extra / Missed labels; the navigation moved into the
  header as icons. **Tab starts a new round again**, reversing the 12 October
  rule (see 4.4).
- **#62** one scale for all same-looking elements; result variant A
  (Monkeytype-like: big WPM and accuracy on the left, a wide word-speed chart
  on the right, consistency / time / characters below); typing variant T1
  (no card, bigger text); the Faster / Slower lists and the "Already mastered"
  pill removed (the ticks on the letters already say it).
- **#63** after a UX audit: the letters row stays fixed at the top on both
  screens; the chart title "Speed of each word, wpm"; the focus letter hidden
  on the result screen and no longer called "weakest letter" (in the agent's
  runs it was not the weakest letter in 66 of 99 portions, because softmax
  picks it at random by weight); "Next" became "Next letter".

### 8.6 One settings window (16–17 Oct, PR #64)

Esc on any screen, or the gear, opens **one centred settings window** in the
style of Monkeytype's command palette: a search field on top, ↑ ↓ to choose a
row, ← → to change a value, Enter to press, Esc to close. Esc during a round
stops the round first. Rows: Words, Time, Live speed, Keyboard, Caret, Theme,
Data (Export / Import, renamed from Save / Load) and a Danger zone with
"Reset all progress" behind a confirmation dialog whose focus starts on
Cancel. All settings are one list in `web/settings.js`, so a new setting is
one entry.

The panel went through several sizes (730 → 423 → 393 → 341 px high). During
these iterations the student set the strongest working rule so far: **first
say what you understood and what you plan to change, wait for agreement, and
only then change code** (16 October, late evening). He also checked
Monkeytype himself and corrected an answer the agent had given from memory.

### 8.7 Tuning by feel (18–23 Oct)

After 17 October many values were set by eye: the student typed, said what
felt wrong, and one number or rule changed. The code comments used to retell
each of these talks; issue #147 moved the reasons into plain comments and
kept here only what the student confirmed.

- **The caret glide** (`web/feel.js` caretGlideMs). Tried in turn: 70 ms on
  a very steep curve (73% of the way in the first frame, then a crawl: it
  read as a low frame rate); Monkeytype's "medium", 100 ms even (too soft);
  a step-and-settle curve at 80 and 55 ms (behind the letters); Monkeytype's
  "smooth caret: fast", 85 ms on an almost even in-out curve (still behind);
  that curve in 60 ms; finally 65 ms, the student's own pick (20 Oct).
- **The caret at fast typing** (23 Oct, confirmed): the student asked
  whether the caret could go faster when typing fast. The glide now takes
  a part of the average time between keys (PR #141).
- **The long caret** (22 Oct, confirmed): with a mark on every space, the
  caret suddenly grew two lines tall where a line wraps. Its height now
  comes from the font size, never from the letter (PR #126); the browser
  check in `tools/browser` guards it (PR #156).
- **The zoom** (18 Oct, confirmed, more than once): at 90% browser zoom the
  page fit, at 100% the keyboard got too little height. The root font size
  now grows smoothly with the window height (`web/base.css`).

## 9. The algorithm audit

*16 October, PR #58*

`docs/ALGORITHM-AUDIT.md` is a written review of the algorithm with numbers
from the simulation only. It changes no code. Its findings:

1. **A slightly slow letter can block new letters for ever.** A letter at
   450 ms against the 400 ms target is not mastered, but its difficulty is so
   low that it is rarely chosen for practice.
2. **The wait for a new letter grows with the alphabet** (about 29 words early,
   about 106 late), because all open letters must be mastered at the same time
   and one error resets about 7 presses of progress.
3. **The error rule per letter is lax:** a letter with 10–20 % errors can
   still pass.

Decision: **no formula changes until there is real data.** The student, his
sister and other beginners type in learning mode on a computer keyboard and
send their Export files; a later task replays them through the model. The
literature behind the audit was checked to be real: Gentner 1983, Keith &
Ericsson 2007, Dhakal 2018, Feit 2016, Yechiam 2003, Pelánek 2017,
Carpenter 2022. The student will ask the supervisor which sources are
expected.

## 10. Key decisions and why

*For the design chapter*

| Decision | Alternative | Why (and where it is documented) |
|---|---|---|
| Real words only | Generated letter combinations (keybr) | Closer to real typing, easier to read, more motivating. Student's decision. ALGORITHM.md §2. |
| No difficulty switches in learning | Manual levels (200 / 1K / 5K words) | The algorithm decides; nothing to configure. Student's decision. AGENTS.md. |
| Two modes and a test (15 Oct) | One mode only | The student wanted a choice; learning keeps the algorithm, free practice is separate and never touches the letter model. AGENTS.md. |
| Statistics, not a neural network | A trained model | No training data needed, every step explainable and defensible, instant. ALGORITHM.md §2. |
| EMA per letter | Lifetime averages | Skill changes; old mistakes should fade (half-life ≈ 6.6 occurrences). §4. |
| Prior / shrinkage | Trust the first presses | One correct press is not evidence; new letters start as fairly hard and get practised. §5.2. |
| Softmax with temperature T = 0.1 | Always the worst letter; T = 0.25 | Focus and variety. T = 0.1 won the simulation in all four languages and costs little variety (14–15 Oct). §7. |
| Portions of 6 words chosen while typing, rounds of 30 | One exercise built in advance; an endless ribbon | Reacts to mistakes within the round; rounds give boundaries and comparable results. |
| Common words first | Any word from the 2000 | Feels like Monkeytype's 200 → 1k → 2k; beginners meet familiar words. |
| Gradual unlocking by frequency | All letters at once; "open all letters" | A beginner cannot learn 26 positions at once; experienced typists unlock the rest quickly by typing well. §6. |
| Tab starts a new round (16 Oct) | Tab never restarts (12 Oct) | Familiar from Monkeytype; the dropped round is not saved but the presses already sent stay learned. |
| Rounds of different lengths never mixed | One chart for all | Results of a 10-word and a 60-second round are not comparable. |
| Wrong layout / Caps Lock are not mistakes | Count every wrong key | They have nothing to do with typing skill and would ruin the statistics. §12. |
| Own progress per language | One shared profile | Skill in one language says nothing about another. §6. |
| Only English shown for now | All four languages | Polish one language first; the others come back later. |
| No drawn keyboard on phones; device stored per round | Same screen everywhere | A touch screen has its own keyboard; the data decides later whether devices need separate models. §9. |
| Raw keystrokes stored | Only totals | The data can be re-analysed with a new formula later. |
| Formulas unchanged after the audit | Fix the audit findings now | Fix from real data, not from a simulation only. ALGORITHM-AUDIT.md. |
| Hidden control group `?group=random` | No comparison | Needed for the evaluation; never shown in the interface. |
| Go stdlib + plain JS, pgx the only module | Frameworks | Small, readable, defensible code; nothing hidden in libraries. AGENTS.md. |
| Store interface | Direct database code | In memory or PostgreSQL behind the same interface and the same tests. ARCHITECTURE.md. |
| Passwords and tokens only as hashes | Store them directly | A leaked database reveals no passwords or logins. |
| WebAssembly for the website | Rewrite the logic in JS | One codebase for the server and the website; nothing duplicated. ARCHITECTURE.md. |
| Rewards never affect measurement | — | The data stays trustworthy for evaluation. AGENTS.md. |
| raw wpm shown only | Store it | Familiar from Monkeytype; not part of the model. |
| Heatmap on the stats screen | Toggle on the typing screen | Analysis belongs next to the statistics; the typing screen stays clean. |

## 11. How the AI-assisted workflow worked

*For the methodology chapter*

This section describes the process itself, which can be part of the
methodology: the student designed the product and made the decisions, the
agent implemented and verified them.

### 11.1 The loop for every change

```
1. Request    the student describes what he wants, often by voice or with an
              annotated screenshot, in the shared chat
2. Clarify    the agent says in plain words what it understood and what it plans
              to change; for bigger work a short plan; real choices as simple
              questions. Nothing is changed before the student agrees.
3. Preview    for interface work: screenshots (desktop and phone), 2-3 variants
              for bigger layout questions; the student comments on the images
4. Implement  in small steps in a separate branch, following AGENTS.md and the
              guideline files
5. Check      gofmt, go vet, go test; the app is driven in a headless browser at
              desktop and phone sizes
6. Publish    a pull request with one commit per item; CI runs the checks and the
              WebAssembly build
7. Report     a short summary in plain Russian: what changed, which files, how to check
8. Merge      the student reads and merges; GitHub Pages republishes the site
9. Feedback   the student tries it on his PC and phone; the next iteration starts
```

### 11.2 Lessons about working with the agent

These came from things that went wrong; each became a written rule the agents
follow:

- **Explain in plain words (15 Oct).** The student felt reduced to "approve and
  merge" when plans used variables and jargon. Now every plan uses concrete
  examples, and decisions that are his are named as such.
- **Change only what was asked (16 Oct).** An unrequested font change in #46
  broke trust and made things worse. Vague "make it better" passes kept
  breaking things; the better input is an exact specification per screen,
  written after looking at other sites.
- **Preview first (16 Oct).** For interface work, screenshots before a PR;
  the student answers with comments pinned on the image.
- **Discuss before doing (16 Oct, late evening).** After the same thing was
  redone many times: first say what was understood and what will change, wait
  for agreement, ask instead of guessing, and answer "why is it like this"
  directly (including "there is no good reason").
- **Check the reference, not memory.** The agent's answers about how
  Monkeytype works were sometimes wrong; the site itself is checked instead.
- **Fewer pull requests.** Related items go into one PR, one commit per item,
  so any single item can still be undone. Nothing is added to a PR after it is
  announced; a new PR is opened instead.
- **Other models' opinions are checked, not followed.** Reviews from Mistral,
  ChatGPT and Gemini were useful, but every claim was checked against the code
  first.

### 11.3 Division of work

| Student | AI agent |
|---|---|
| The idea, the target users and the "feel" (Monkeytype look, but teaching). | Turning requests into code that follows the project rules. |
| Product decisions: real words, two modes and a test, rounds and their lengths, what is in and out of scope. | Proposing the statistical model, simulating it and explaining trade-offs; never changing the formulas without asking. |
| Visual judgement: consistency, what feels natural, exact wording of texts. | Tests, documentation kept in sync with the code, research on other trainers. |
| Testing on real devices (Windows PC and his phone) and reporting what felt wrong. | Automated checks in a browser at several screen sizes before every pull request. |
| Final say on every change; merging every pull request. | Explaining every change in simple words so it can be defended. |

### 11.4 What made it work

- A written rules file and guideline files, so every new session starts with
  the same constraints.
- A shared project memory, so a new thread knows earlier decisions.
- Small pull requests and immediate deployment: every change could be seen on
  the phone soon after the merge.
- Honest feedback in the student's own words; several features only became
  good on the second or third try.
- Documentation as part of each task, so the thesis material grows with the
  code.
- Evidence before changes to the algorithm (the simulation, the audit).
- Verification before reporting: what was checked, and what could not be
  checked.

### 11.5 Points to address in the thesis

- Agree with the supervisor how AI use is described and whether the
  repository may stay public before the defence.
- The theoretical text is written by the student (anti-plagiarism); this log
  and the chats are raw material, not text to copy.
- The student must be able to explain the algorithm and the key architecture
  decisions in his own words. The agreed plan: read the code file by file
  (`model.go` → `generator.go` → `api/learning.go` → frontend), explain each
  file in his own words and get corrections; shortcuts found on the way become
  GitHub issues and are cleaned up in small one-thing PRs.

## 12. Known limitations and open questions

*For the evaluation chapter*

- **Parameters were chosen by reasoning, then checked only in simulation.**
  The temperature was tuned on simulated typists (chapter 6); real data from
  export files and the hidden control group are the way to test the rest.
- **A slightly slow letter can block progress** and is rarely drilled; the
  wait for a new letter grows with the alphabet; the error rule per letter is
  lax (audit, chapter 9). Deliberately left until real data exists.
- **The focus letter is not always the weakest letter:** softmax picks it at
  random by weight, which is the point (variety), but it must not be described
  as "your weakest letter".
- **Time belongs to a transition, not a letter:** a slow "t→s" is recorded on
  "s". Bigram statistics are a natural extension.
- **Little data looks hard:** with few presses every letter is pulled towards
  the prior 0.7, so the heatmap is mostly red at first.
- **Phone and keyboard data measure different skills.** The device is now
  stored per round, but the letter model is still shared; an evaluation must
  not mix them.
- **No accounts on GitHub Pages:** progress there lives in the open tab unless
  saved with Export. Accounts and PostgreSQL work only on the normal server,
  which has not been deployed to a VPS yet.
- Only English is shown; the other three languages need a new pass.
- Lowercase only (no Shift yet): English "I" appears as a lone "i";
  single-letter words are kept only when they are real words.
- Raw wpm is inflated in the first second of an exercise (very little time
  has passed).
- Free practice and the typing test are minimal and provisional by design.

## 13. Where this material fits in the thesis

*Writing plan*

| Chapter | Material available | Still to do |
|---|---|---|
| Introduction, goal, scope | The idea (§1), scope and "not now" list (AGENTS.md), the two modes (§7). | Motivation in your own words. |
| Market analysis | Monkeytype as the look-and-feel reference; keybr as the teaching reference; typecelerate as the manual-control contrast (§5.4). | Try the sites yourself and compare. |
| Theory | Reading list in docs/LITERATURE.md; sources checked in the audit (§9). | Read and write the chapter yourself; ask the supervisor which sources are expected. |
| Design of the algorithm | docs/ALGORITHM.md: formulas, parameters, design decisions (§10 of this log). | Explain it in your own words; figures. |
| Implementation | docs/ARCHITECTURE.md, the two builds, accounts and PostgreSQL (§7.3), docs/GUIDELINES.md and docs/UI-TEXT.md, the workflow (§11). | Choose what to show; screenshots of the current version. |
| Evaluation | The simulation (§6.1), the audit (§9), 106 tests, raw keystrokes, the hidden control group, export files from real users. | Collect data, replay it, maybe a small study (adaptive vs random). |
| Conclusions and future work | Limitations (§12); a VPS deployment, bigrams, separate device models, free practice as a full mode, profiles and leaderboards. | Write after the evaluation. |

## Appendix: every pull request

Dates are the merge dates. The full commit list is in the Git history
(`git log --reverse --oneline`); the first commit (4 October) already
contained the prototype from 3 October together with the rules files, and
12 October was 31 commits straight to `main`.

| PR | Merged | Change |
|---|---|---|
| #1 | 13 Oct | Development log (PDF) |
| #2 | 13 Oct | Shorter README |
| #3 | 13 Oct | Rule: main is protected, work through pull requests |
| #4 | 13 Oct | Monkeytype-style typing flow, redrawn hands |
| #5 | 14 Oct | Frontend split into ES modules, import rule test |
| #6 | 15 Oct | Simulation of the algorithm, T = 0.1, terminal-like text card |
| #7 | 15 Oct | Quieter header, live numbers, profile stub |
| #8 | 15 Oct | 3-line text window, result screen, site tour, record fix |
| #9 | 15 Oct | Automatic keyboard size (continued in #10) |
| #10 | 15 Oct | Words chosen while typing: portions of 6, rounds of 30 |
| #22 | 15 Oct | Common words first (issue #21) |
| #23 | 15 Oct | Typing fixes (issue #13), consistency metric |
| #28 | 15 Oct | Free practice and the one-time typing test (issue #27) |
| #29 | 15 Oct | Repository cleanup, tests on every PR |
| #30 | 15 Oct | User id in every Store method |
| #31 | 15 Oct | Raw rounds with every keystroke |
| #32 | 15 Oct | Accounts: sign up, log in, log out |
| #33 | 15 Oct | PostgresStore and migrations |
| #34 | 15 Oct | Guest per browser, login limit, security |
| #35 | 15 Oct | Settings: round length, live numbers, caret (issue #14) |
| #36 | 15 Oct | Top 200 words free until the alphabet is open (issue #25) |
| #37 | 15 Oct | Rare-letter words, Backspace, words one by one, hidden control group |
| #38 | 15 Oct | Typing feel knobs (issue #18), bigger hands (issue #19) |
| #39 | 15 Oct | Side navigation, light theme, one-screen stats, phone bar |
| #40 | 15 Oct | Text style guide and guides (issues #15, #20) |
| #41 | 16 Oct | docs/COMMENTING.md and comments everywhere |
| #42 | 16 Oct | Steadier test |
| #43 | 16 Oct | README |
| #44 | 16 Oct | UI review: English only, light theme, one window style |
| #45 | 16 Oct | Snappier caret and word fade |
| #46 | 16 Oct | Useful result screen, original font restored |
| #47 | 16 Oct | Result blocks, per-screen help, sentence case |
| #48 | 16 Oct | Next round button, letter chips |
| #49 | 16 Oct | Design skill for the agent |
| #50 | 16 Oct | Design pass checked against a Gemini review |
| #51 | 16 Oct | Lighter block caret, words with their speed |
| #52 | 16 Oct | Mastered tick, word-speed chart, result details |
| #53 | 16 Oct | Phone keyboard closes, Try again, name in the header |
| #54 | 16 Oct | Tap bug, typeTrainer everywhere, text pass |
| #55 | 16 Oct | Settings texts, README rewrite, UI-TEXT.md |
| #56 | 16 Oct | Text principles and docs/GUIDELINES.md |
| #57 | 16 Oct | No drawn keyboard on touch screens, device per round |
| #58 | 16 Oct | Algorithm audit (docs only) |
| #59 | 16 Oct | Website link fixed |
| #60 | 16 Oct | Icon buttons for Next round and Try again |
| #61 | 16 Oct | Result on one screen, Tab restarts again |
| #62 | 17 Oct | Result variant A, typing variant T1, uniform scale |
| #63 | 17 Oct | UX audit fixes: letters row, chart title, focus letter |
| #64 | 17 Oct | One settings window opened with Esc |
| this | 17 Oct | This log converted from PDF to Markdown and updated |

Numbers #11–#21 and #24–#27 are issues, not pull requests.
