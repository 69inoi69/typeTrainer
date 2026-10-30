# Text rules

How to write every text a user sees: labels, buttons, descriptions,
tooltips, messages, the first-visit guide. All of them live in `web/i18n.js`. Only English is
shown for now, so only English texts exist; the Polish, Ukrainian and
Russian ones are written from them when those languages come back.

These rules apply to every change, new features included: whoever adds or
changes something decides on their own what text it needs, how much and
where, without waiting to be told. Check the text against them before
calling the work done.

## Principles

1. **Names are short, sentences are human.** A label (button, tab,
   setting name) is one or two words. Everything that is a sentence
   (tooltips, messages, Learn news, the mascot) is a whole, living sentence,
   the way a friend next to you would say it. A tooltip appears
   only when the look doesn't say enough, and says what the thing means
   for you, not how it is computed.
2. **Every text earns its place.** If removing it does not make the
   interface less clear, remove it.
3. **Don't explain the obvious.** Familiar labels such as "Caret" or "Your
   progress" need no description. Never add text to fill space or to keep a
   pattern.
4. **Explain what isn't obvious:** unusual behaviour, unfamiliar ideas,
   important limits, and consequences the user might not expect.
5. **Match detail to need.** A simple control needs little or nothing; a
   complex feature may need more. The goal is clarity, not shortness for its
   own sake.
6. **Understand the feature first.** Read its code and try it. Write what it
   really does, not what its name suggests. A rule the user runs into keeps
   its numbers ("at least 20 presses, under 5% mistakes, 30 wpm"); numbers
   the server knows come in as placeholders (`{target}`, `{min}`, `{err}`,
   `{testWpm}`, `{testAcc}`), so the text follows
   `internal/config/config.go`.
7. **Consider context.** A label clear in one place may need help in
   another. Count what is already around it: the heading, the controls, the
   icons, what the user likely knows.
8. **Precise, natural language.** No repetition, filler, generic AI
   phrasing or vague claims. Words from the code (dots, estimate, focus,
   separate stats) never reach the screen. One thing has one name
   everywhere (word list below).
9. **Spell out consequences that matter.** "Load replaces your current
   progress with the one in the file". "This cannot be undone".
10. **Don't force uniformity.** Not every setting needs a description, not
    every button needs a tooltip, not every section needs a note.
    Consistency means the same reasoning, not the same structure.
11. **Apply this on your own.** When adding or changing a feature, decide
    what text it needs, how much and where. Remove what is unneeded and add
    what is missing without being asked.
12. **Keep good text.** Change a text only when it gets clearer, more
    accurate, more consistent or easier to use.
13. **Text is part of the interface.** Think of the phone: wrapping, how
    dense the screen gets, whether extra text makes it harder to scan.

### Quick tests

- **Tooltip:** does it say more than the visible label? If it only repeats
  it, drop it. A tooltip that adds a shortcut or a rule stays.
- **Description:** would a first-time user get it wrong, or be surprised,
  without it? If not, drop it.
- **Guide step:** does it tell something the screen does not already show?

## Voice

The site sounds like a friend who types well and is glad you came: warm,
lively, with a bit of humour. Never a manual, never a cheerleader.

- **Whole sentences, not fragments.** "Only words of 6 letters or more.",
  not "Words of 6+ letters. Separate stats". No "A: B" shorthand
  ("Goal now 35 wpm", "Line: average of 10", "empty = off") outside a
  field label or a rule list such as the account rules.
- **Say what it means for you, not how it works.** "{l} is holding things
  up right now.", not "Estimate from your last 10 rounds. Slowest letter:
  {l}". Numbers stay when the user runs into the rule.
- **Keep the facts.** A livelier line still says everything the user
  needs: a limit, a consequence, what to do next. "Try Save again before
  you move on, or the round is lost." keeps the consequence; dropping it to
  sound friendly is wrong.
- **Contractions everywhere:** you've, isn't, can't, we'll, I'll. "I will
  have something to say" sounds like a robot.
- **"You" and "we".** Talk to the user as "you". The site may speak as
  "we", and often does ("We'll mix in more of these."). The mascot speaks
  as "I". Present tense, active voice.
- **A little humour everywhere.** A light touch fits any text: a tooltip,
  a toast ("Your fingers have earned a break."). The
  mascot may joke and tease more. Humour never hides a fact and never
  makes fun of the user's mistakes. Errors, the reset window and anything
  that deletes data stay plain. Never emoji, never CAPS; an exclamation
  mark only from the mascot.
- **Mistakes are information.** Never blame: a failed test is "Not passed
  yet", not "Failed". A setback says what to do next ("Twice in a row and
  you slide down one.").
- **Sentence case everywhere.** Every text starts with a capital letter,
  labels and buttons too; the rest is lower case except names.

### Before and after

| Robotic | Natural |
|---|---|
| Below 92% resets the dots. Two in a row drop a level | Slip under 92% and you start this level over. Twice in a row and you slide down one. |
| WPM, raw and accuracy as you type. Turn off if they distract you | Live numbers while you type. Hide them if they make you nervous. |
| Your slowest or least accurate pairs. Half the next words have one | The pairs you stumble on. About half of the next words sneak one in. |
| {m} minutes of typing. Time for a short break | {m} minutes straight. Your fingers have earned a break. |
| Not saved: no connection. Leaving this screen drops the round | No connection, so this round isn't saved yet. Try Save again before you move on, or the round is lost. |
| Type a round and I will have something to say | Nothing to say yet. Type something and I'll judge it. |

## Where each kind of text goes

| Kind | Form | Example |
|---|---|---|
| Label (button, tab, option name) | One to three words, no full stop | "Next round", "Export" |
| Option description (Settings) | Only when the name and the control are not enough: one sentence on what it does, a second for a consequence | "Live numbers while you type. Hide them if they make you nervous." |
| Tooltip | Only when the look doesn't say it: what the thing means for you, when to turn it off if that matters, the shortcut after "·". One or two whole sentences, no mechanics | "Settings · Esc", "Every keypress, mistakes included." |
| Status line, short messages | One short line, a number in `<b>` | "Type the text to begin." |
| Result screen | Speed and accuracy big, the chart of word speeds, a row of facts (consistency, time, characters) ending in what happened, then the words. No tips | "A new letter is open: r." |
| The first-visit guide | One to three short sentences per step, the key idea first in `<b>` | "<b>Weak letters come back.</b> Letters you miss or type slowly get more words." |
| Error | What went wrong and what to do, plainly | "Couldn't load this file. Use one made with Export." |

Join parts with words or a comma, not "A · B"; only a tooltip uses "·",
before its shortcut. Labels, buttons, headings and short name-like values ("New best",
"Mastered", "≈ 3 rounds") have no full stop. Every text that is a
sentence (a description, tooltip, message, news line, guide step, the
mascot) ends with a full stop, a question mark or, for the mascot, an
exclamation mark.

## Word list

| Thing | Word |
|---|---|
| one typing run (10–50 words or 15–90 s) | round |
| the learning mode, the main one | Learn |
| the second mode, harder as you get better | Climb |
| how hard Climb is now, 1 to 10 (which words) | level |
| the third mode, plain typing | Freetype |
| the n most common words Freetype draws from | word list ("200", "1k" ... "25k" on the buttons) |
| the letter the trainer is drilling now | focus |
| a letter that meets the goal | mastered |
| the next letter to open | next letter |
| the file with all progress | Export / Import (the section is "Progress data") |
| deleting all progress | Reset progress (the button says "Reset") |
| speed | wpm after a number ("30 wpm"), WPM as a label on its own |

`wpm`, `raw` and the mode names Learn, Climb and Freetype stay in English in every
language.

## How it looks

What changes (words, letters, numbers, messages) is bright; what never
changes (labels, descriptions) is quieter, and a fixed label is small and
grey. One font everywhere: the monospace one, Geist Mono (`.lbl-ui` in `base.css`).

## Before you add a text

- Put it in `web/i18n.js`, never in the HTML or another `.js` file (the one
  exception is `web/file-check.js`, the page opened from disk). A
  `data-i18n` element in `index.html` keeps the same English text as a
  fallback.
- Check the word list. A new term goes into the list first.
- Read it once aloud. If it sounds like a manual or a telegram, rewrite
  it as you would say it. If a word can go without losing meaning or
  warmth, cut it.
