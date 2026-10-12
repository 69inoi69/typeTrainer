# User guide

Everything the trainer does, screen by screen. For a quick overview see the
[README](../README.md); for the math behind it see [ALGORITHM.md](ALGORITHM.md).

## Typing screen

- The app opens with a short start screen: the logo types itself, a random
  phrase in your language, then the page slides in. Any key or click skips it.
- On the very first visit a short hands-on intro starts: put your fingers on
  the home row and press those eight keys, press space with a thumb, then
  "watch the screen". It reacts to the real keys (physical positions, so it
  works with any system layout). `Esc` or "skip" closes it; the **beginner guide**
  button reopens it. At the end: "Start" (a few letters) or "I can already touch type"
  (all letters open). Before your first exercise the letters caption also has an
  "open all letters" button.
- Type the grey text. Wrong key = the letter turns red and you must press the
  right one before moving on.
- The row of letters at the top shows your progress: open letters, the letter in
  **focus** (yellow, your weakest right now), mastered letters (green dot), and
  locked letters (outlined). Master every open letter and the next one opens.
  Under it, small status pills: focus letter, mastered open letters (with a
  bar) and the next letter; hover them for details. Caps Lock and wrong layout
  warnings appear in the same place, on top of the pills, so nothing moves.
- The keyboard shows the next key in its finger color; keys you do not need yet
  are dimmed. Above the keyboard two hands light up the finger that presses
  it (space = both thumbs, AltGr letters = right thumb + the finger).
- The **EN · PL · UK · RU** switch changes the language you practise **and the
  language of the interface** (remembered in your browser; the first time it
  follows your browser's language).
- **Tab does not restart.** Restarting throws away exactly the mistakes the
  trainer learns from, so Tab only answers with a small animation and a kind
  message; at the end you see how many times you resisted. `Esc` still gives a
  new exercise.
- The **flame + number** in the header counts clean words in a row (typed
  without a single mistake; hover for the tooltip). It gets hotter as it grows:
  green from 3, yellow from 10, orange with a flickering flame from 25, glowing
  red from 50. New records, mastered letters and new letters get
  a small celebration.
- Messages are part of the page, not pop-ups: a message takes the place of the
  status line under the letters for a few seconds, then the status line comes
  back. One at a time, the others wait their turn. The thin bar under each
  message fills up while it is shown; hover pauses it, a click skips it. Every kind has its own color, icon and small
  animation: record (gold trophy), new letter (blue, the letter itself),
  mastered (green check), streak (orange flame), Tab urges beaten (violet
  shield), Tab message (small, grey).
- Buttons under the keyboard (hover for a tooltip): **beginner guide** (the
  intro again) and the keyboard switch **off · S · M · L** (hides keyboard and
  hands, or picks a size; remembered in your browser). The keyboard never makes
  the page scroll: on a small window it shrinks to fit, L uses all the room,
  M and S a bit less.
- The two arrow buttons save your statistics (all languages, full history) to one
  `.json` file and load such a file back. Loading **replaces** the current data.
  Use it to keep progress across server restarts (or page reloads on the website).
- The red-on-click bin button resets everything: progress in all languages and
  the settings saved in your browser, as on the very first visit. It needs a
  second click (the first one turns it red), so it does not happen by accident.
- Shortcuts, also listed small at the bottom of the page: `Esc` new text ·
  `Shift + Tab` type / stats · `Alt + 1…4` language. On phones (no Esc key) a
  "new text" button is shown under the text instead.
- The header shows **wpm**, **raw** (every keypress counts, wrong ones too, like
  on monkeytype; only shown, never stored) and accuracy. Over the logo there is
  a small phrase: the same one the start screen showed, it flies there with
  the logo.
- The **keyboard / chart** icon switch at the top (or `Shift + Tab`) opens the statistics screen: totals,
  speed of every exercise, a **difficulty keyboard** (grey keys, the redder the
  harder the letter is for you, dashed = no data yet; hover or tap a key for
  its numbers), and every letter from weakest to strongest.

## Languages and layouts

English, Polish, Ukrainian and Russian, chosen with the switch at the top. Each
language keeps its own progress. Switch your **system** keyboard layout too
(Windows: Win + Space); the app shows a hint when the layout does not match.
Polish uses the standard "Polish (Programmers)" layout: ą, ę, ł... with AltGr.

## Where your progress is kept

- **Local server (`go run .`)**: in the server's memory. Stopping the server
  forgets it, so save a file with the export button first and load it back
  after the restart.
- **Website (GitHub Pages)**: in the open browser tab. Reloading the page
  forgets it; the export button works the same way.
- A database (PostgreSQL) comes later; then progress is kept automatically.
