# Interface text rules

How to write every text a user sees: labels, buttons, descriptions,
tooltips, messages, the first-visit guide. All of them live in `web/i18n.js`. Only English is
shown for now, so new texts are written in English only; the Polish,
Ukrainian and Russian blocks get redone when those languages come back.

These rules apply to every change, new features included: whoever adds or
changes something decides on their own what text it needs, how much and
where, without waiting to be told. Check the text against them before
calling the work done.

## Principles

1. **Every text earns its place.** If removing it does not make the
   interface less clear, remove it.
2. **Don't explain the obvious.** Familiar labels such as "Theme" or "Your
   progress" need no description. Never add text to fill space or to keep a
   pattern.
3. **Explain what isn't obvious:** unusual behaviour, unfamiliar ideas,
   important limits, and consequences the user might not expect.
4. **Match detail to need.** A simple control needs little or nothing; a
   complex feature may need more. The goal is clarity, not shortness for its
   own sake.
5. **Understand the feature first.** Read its code and try it. Write what it
   really does, not what its name suggests. A rule the user runs into keeps
   its numbers ("at least 20 presses, under 5% mistakes, 30 wpm"); numbers
   the server knows come in as placeholders (`{target}`, `{min}`, `{err}`,
   `{testWpm}`, `{testAcc}`), so the text follows
   `internal/config/config.go`.
6. **Consider context.** A label clear in one place may need help in
   another. Count what is already around it: the heading, the controls, the
   icons, what the user likely knows.
7. **Precise, natural language.** No repetition, filler, generic AI
   phrasing, forced friendliness or vague claims. One thing has one name
   everywhere (word list below).
8. **Spell out consequences that matter.** "Load replaces your current
   progress with the one in the file". "This cannot be undone".
9. **Don't force uniformity.** Not every setting needs a description, not
   every button needs a tooltip, not every section needs a note.
   Consistency means the same reasoning, not the same structure.
10. **Apply this on your own.** When adding or changing a feature, decide
    what text it needs, how much and where. Remove what is unneeded and add
    what is missing without being asked.
11. **Keep good text.** Change a text only when it gets clearer, more
    accurate, more consistent or easier to use.
12. **Text is part of the interface.** Think of the phone: wrapping, how
    dense the screen gets, whether extra text makes it harder to scan.

### Quick tests

- **Tooltip:** does it say more than the visible label? If it only repeats
  it, drop it. A tooltip that adds a shortcut or a rule stays.
- **Description:** would a first-time user get it wrong, or be surprised,
  without it? If not, drop it.
- **Guide step:** does it tell something the screen does not already show?

## Style

- **Calm and plain.** No exclamation marks, no CAPS, no emoji, no jokes.
  Praise is a fact ("New best speed"), not a cheer.
- **Speak to one person:** "you", present tense, active voice ("Deletes all
  your rounds", not "All rounds will be deleted").
- **Mistakes are information.** Never blame: a failed test is "Not passed
  yet", not "Failed".
- **Sentence case everywhere.** Every text starts with a capital letter,
  labels and buttons too; the rest is lower case except names.

## Where each kind of text goes

| Kind | Form | Example |
|---|---|---|
| Label (button, tab, option name) | One to three words, no full stop | "Next round", "Export" |
| Option description (Settings) | Only when the name and the control are not enough: one line on what it does, a second sentence for a consequence | "Shows your WPM and accuracy as you type" |
| Tooltip | Only when it adds something: what it is, then the shortcut after "·". One line, no full stop | "Settings · Esc" |
| Status line, short messages | One short line, a number in `<b>` | "Type the text to begin" |
| Result screen | Speed and accuracy big, the chart of word speeds, a row of facts (consistency, time, characters) ending in what happened, then the words. No tips | "New letter opened: r" |
| The first-visit guide | One to three short sentences per step, the key idea first in `<b>` | "<b>Weak letters come back.</b> Letters you miss or type slowly get more words." |
| Error | What went wrong and what to do | "Could not load this file. Use one made with Save" |

Join parts with words or a comma, not "A · B"; only a tooltip uses "·",
before its shortcut. Labels, descriptions, tooltips and messages have no full stop at the end
(a full stop only between two sentences). The first-visit guide is full
sentences and ends with a full stop.

## Word list

| Thing | Word |
|---|---|
| one typing run (10–50 words or 15–90 s) | round |
| the learning mode, the main one | Learn |
| the second mode, harder as you get better | Climb |
| how hard Climb is now, 1 to 100 | level |
| the third mode, plain typing | Freetype |
| the n most common words Freetype draws from | word list ("200", "1k" ... "25k" on the buttons) |
| the letter the trainer is drilling now | focus |
| a letter that meets the goal | mastered |
| the next letter to open | next letter |
| the file with all progress | Export / Import (the section is "Data") |
| deleting all progress | Reset all progress (in "Danger zone") |
| speed | wpm after a number ("30 wpm"), WPM as a label on its own |

`wpm`, `raw` and the mode names Learn, Climb and Freetype stay in English in every
language.

## How it looks

What changes (words, letters, numbers, messages) is bright; what never
changes (labels, descriptions) is quieter, and a fixed label is small and
grey. One font everywhere: the monospace one, Geist Mono (`.lbl-ui` in `style.css`).

## Before you add a text

- Put it in `web/i18n.js`, never in the HTML or another `.js` file (the one
  exception is `web/file-check.js`, the page opened from disk). A
  `data-i18n` element in `index.html` keeps the same English text as a
  fallback.
- Check the word list. A new term goes into the list first.
- Read it once aloud. If a word can go without losing meaning, cut it.
