# Interface text rules

How to write every text a user sees: labels, buttons, descriptions,
tooltips, messages, help. All of them live in `web/i18n.js`. Only English is
shown for now, so new texts are written in English only; the Polish,
Ukrainian and Russian blocks get redone when those languages come back.

Read this before adding or changing a text, and check the text against it
before calling the work done.

## The main rule

**Say what the thing does, as short as it can be without losing anything
the user needs.**

- A simple thing gets a short text. "Shows your WPM and accuracy as you type".
- A thing with a consequence gets the consequence spelled out. "Load replaces
  your current progress with the one in the file". "This cannot be undone".
- A thing whose name already says it all gets no description. "Theme" with
  Dark / Light needs nothing under it.

## Rules

1. **Describe what really happens.** Read the code before writing. Never
   promise something the app does not do, and never leave out a rule the
   user runs into (a number, a limit, what gets deleted or replaced).
2. **Keep the numbers.** A rule with numbers states them ("at least 20
   presses, under 5% mistakes, 30 wpm"). Numbers the server knows come from
   it as placeholders (`{target}`, `{min}`, `{err}`, `{testWpm}`,
   `{testAcc}`), so the text follows `internal/config/config.go`.
3. **No filler.** No text that repeats the label, describes the obvious or
   only sounds nice. If removing a sentence loses nothing, remove it.
4. **One thing, one name.** Use the word list below. The same thing is never
   called two different names.
5. **Calm and plain.** No exclamation marks, no CAPS, no emoji, no jokes,
   no advert or chatbot tone. Praise is a fact ("New best speed"), not a
   cheer.
6. **Speak to one person.** "you", present tense, active voice: "Deletes
   all your rounds", not "All rounds will be deleted".
7. **Mistakes are information.** Never blame. A failed test is "Not passed
   yet", not "Failed".
8. **Sentence case everywhere.** Every text starts with a capital letter,
   labels and buttons too; the rest is lower case except names.
9. **Leave good text alone.** Change a text only when it is wrong, unclear,
   missing something or longer than it needs to be.

## Where each kind of text goes

| Kind | Form | Example |
|---|---|---|
| Label (button, tab, option name) | One to three words, no full stop | "Next round", "Start over" |
| Option description (Settings) | One line saying what it does; a second sentence only for a consequence; none if the name is enough | "Marks where the next letter goes" |
| Tooltip | What it is, then the shortcut after "·". One line, no full stop | "Stop the round and see the result · Esc" |
| Status line, short messages | One short line, a number in `<b>` | "Type the text to begin" |
| Result screen | Numbers, then one plain line if something happened, then the letters that changed. No tips | "New letter opened: r" |
| Help, first-visit guides | One to three short sentences per item, the key idea first in `<b>` | "<b>Weak letters come back.</b> Letters you miss or type slowly get more words." |
| Error | What went wrong and what to do | "Could not load this file. Use one made with Save" |

Join parts with words or a comma, not "A · B"; only a tooltip uses "·",
before its shortcut. Labels, descriptions, tooltips and messages have no full stop at the end
(a full stop only between two sentences). Help and the first-visit guides
are full sentences and end with a full stop.

## Word list

| Thing | Word |
|---|---|
| one typing run (10/30/60 words or 30/60 s) | round |
| the learning mode, the main one | Learn |
| free practice, words from the whole list | Freetype |
| the one-time test that opens Freetype | typing test |
| the letter the trainer is drilling now | focus |
| a letter that meets the goal | mastered |
| the next letter to open | next letter |
| the file with all progress | Save / Load (the section is "Backup") |
| deleting all progress | Start over (the button is "Reset") |
| speed | wpm after a number ("30 wpm"), WPM as a label on its own |

`wpm`, `raw` and the mode names Learn and Freetype stay in English in every
language.

## How it looks

What changes (words, letters, numbers, messages) is bright; what never
changes (labels, descriptions) is quieter, and a fixed label is small and
grey. One font everywhere: the monospace one (`.lbl-ui` in `style.css`).

## Before you add a text

- Put it in `web/i18n.js`, never in the HTML or another `.js` file (the one
  exception is `web/file-check.js`, the page opened from disk). A
  `data-i18n` element in `index.html` keeps the same English text as a
  fallback.
- Check the word list. A new term goes into the list first.
- Read it once aloud. If a word can go without losing meaning, cut it.
