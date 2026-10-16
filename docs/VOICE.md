# How the app talks

The rules for every text a user sees (`web/i18n.js`). For now only English is
shown, so new texts are written in English only; the other blocks get redone
when their languages come back.
Read them before adding or changing a text. The aim: a calm mentor with a
sense of humour, not a stand-up comedian and not a robot.

## Seven rules

1. **Short and to the point.** One idea per sentence and one sentence per
   message where possible. Leave out a word if the meaning survives without it.
   Labels are one to three words.
2. **Say what happens, then why, if needed.** "New letters open when you
   type the current ones cleanly at 30 wpm", not "Great news: progress is
   coming".
3. **Calm, never loud.** No exclamation marks, no CAPS, no "!!!", no emoji.
   Praise is specific ("<b>r</b> mastered") rather than generic ("amazing").
4. **Humour stays, but quieter.** At most one light joke per message, and
   only where the user has a moment: the result screen, a new letter. Never
   in errors, warnings, buttons or the settings. A kaomoji `(◕‿◕)` is the
   rare exception (a record), never more than one in a message.
5. **Speak to one person, as a friend would.** "you" in English, "ty" in
   Polish, "ти" in Ukrainian, "ты" in Russian. Lower case for short labels
   and messages, as on monkeytype; sentences in guides start with a capital.
6. **Mistakes are information, not failure.** Never blame. A typo "becomes
   your next words"; a failed test is "not yet".
7. **The same thing has the same name everywhere** (see the word list). One
   text per place: no repeating on the screen what a label or the tooltip
   next to it already says.

## Word list

| Thing | en | pl | uk | ru |
|---|---|---|---|---|
| one typing run (10/30/60 words or 30/60 s) | round | runda | раунд | раунд |
| learning mode (tab: type) | learning, type | nauka | навчання | обучение |
| free practice mode | free practice, freetype (tab: freetype) | swobodne pisanie (tab: swobodnie) | вільний режим (tab: вільний) | свободный режим (tab: свободный) |
| the one-time test that opens free practice | typing test | test pisania | тест друку | тест печати |
| the yellow, weakest letter | focus | ćwiczysz | тренуєш | тренируешь |
| a letter that meets the goal | mastered | opanowana | опанована | освоена |
| words without a single mistake in a row | clean words | czyste słowa | чисті слова | чистые слова |
| speed | wpm | wpm | wpm | wpm |

`wpm` and `raw` stay in English in every language, as on monkeytype, and so
do the tab names `type` and `freetype`.

## Two kinds of text

What changes (the words, letters, numbers, messages) is monospace and
bright; what never changes (labels, menu items, explanations) is the plain
system font, and a fixed label is small grey capitals (`.lbl-ui` in
`style.css`). A new label follows the same rule, so the two never mix.

## Where each kind of text goes

- **Label** (button, tab, tile): one to three words, no full stop.
- **Tooltip**: what it is, then the shortcut after "·". One line.
- **Status line and messages**: one short line; a number in `<b>`.
- **Result screen**: one main line (it may carry the one joke), then facts.
- **Guides** (intro, tour): two or three short sentences per screen. The key
  idea in `<b>` at the start.
- **Errors**: what went wrong and what to do. No humour.

## Before you add a text

- It goes into `web/i18n.js` (English for now, see the top), never into the HTML or
  another `.js` file (the one exception is `web/file-check.js`).
- Check the word list. A new term goes into the list first.
- Read it aloud. If it sounds like an advert or a chatbot, cut it in half.
