# User guide

Everything the trainer does, screen by screen. For a quick overview see the
[README](../README.md); for the math behind it see [ALGORITHM.md](ALGORITHM.md).

## Running it on Windows (from zero)

1. **Install Go** (once): download the Windows installer from
   <https://go.dev/dl/> (1.25 or newer) and click Next until it finishes.
2. **Check it works.** Open a *new* PowerShell window and run `go version`.
3. **Go to the project folder**, for example
   `cd C:\Users\YOUR_NAME\Desktop\typetrainer`.
4. **Start the server:** `go run .`. After a few seconds it prints
   `typeTrainer running. Open http://localhost:3000 in your browser`.
   If Windows asks about the firewall, "Allow" is fine.
5. **Open** <http://localhost:3000>. Always use this address: double-clicking
   `web/index.html` opens the page without the server, with no words and no
   statistics. If the port is taken, change `Addr` in
   `internal/config/config.go`.
6. **Stop** the server with `Ctrl + C`. Without a database (below) progress
   is lost then: export it first (**Settings → Data → Export**) and import it
   back next time.

After `git pull` restart the server: the web files are built into the program.
Optional: `go build -o typeTrainer.exe .` makes one `.exe` to double-click.

## Typing screen

- The app opens with a short start screen: the logo types itself and flies
  into the header, then the page slides in. Any key or click skips it.
- On the very first visit two short guides run, one after the other (both
  can be skipped with `Esc` or "skip", and both open again from **help**):
  - **touch typing basics**: what touch typing is (a small keyboard map where
    every key has the colour of its finger, and one line on posture), then
    put your fingers on the home row and press those eight keys, press space
    with a thumb, and "watch the screen". It reacts to the real keys
    (physical positions, so it works with any system layout). At the end:
    "Start". Everyone starts with a few letters; if you already type well,
    the next ones open quickly;
  - **how this site works**: first the idea in three sentences (the trainer
    watches every keypress and builds real-word practice around your
    weakest letter; letters open one by one), then a light ring around the
    letters, the text, the menu and the languages, with a sentence each.
- Type the grey text. Wrong key = the letter turns red and you keep going, as
  on monkeytype. Backspace fixes the current word (Ctrl+Backspace: the whole
  word); at the start of a word it takes you back into the previous word, one
  word at most, so you can finish a word you skipped. Space in the middle of a word jumps to the next one. A fixed
  mistake still counts for the letter's statistics.
- The row of letters right above the text shows your progress: open letters, the letter in
  **focus** (yellow: the next few words are built around it; it is picked
  anew every few words, weaker letters more often), mastered letters (a small green tick), and
  locked letters (outlined). A letter is mastered when you have typed it at
  least 20 times, recently with under 5% mistakes and at 30 wpm or faster
  (the numbers come from the server's settings). Master every open letter
  and the next one opens.
  Above the text, on the line of the live numbers (after the word counter),
  a quiet status line: the focus letter (the same gold square as the tinted
  letters in the text) and the next letter to open; hover them for details.
  With the live numbers hidden it moves up to the word counter. It never
  moves while you type: every number keeps the room of its widest value.
  The result screen hides it: the next round picks its own
  focus. Caps Lock and wrong layout warnings appear on top of that whole
  line, so nothing moves.
- The keyboard shows the next key in its finger color; keys you do not need yet
  are dimmed. Above the keyboard two hands light up the finger that presses
  it (space = both thumbs, AltGr letters = right thumb + the finger).
- The screen has three fixed places, as in a real app:
  - **the header**: the logo on the left, the account on the right ("log in"
    with a person icon until you are logged in, then your picture and name);
  - **the navigation**: a column at the left edge of a wide window, a bar at
    the bottom of a narrow window or a phone. Two groups: the three screens
    **Learn**, **Freetype** and **Stats**, then **Help** and **Settings**.
    The chosen screen has a short yellow bar next to it.
  From your first keypress until the end of the round everything around the
  text steps back: the logo turns grey and the controls almost vanish (move
  the mouse over them to bring them back).
- Two kinds of text: what changes (the words, letters, numbers, messages) is
  bright; what never changes (labels, menus, explanations) is quieter,
  labels small and grey. Everything uses one monospace font, Geist Mono,
  which comes with the app (it looks the same on every computer).
- **Learn** and **Freetype** in the navigation choose the mode. **Learn** is
  learning, the trainer: it picks words for your weak letters and opens new
  ones. **Freetype** is free practice: words from the whole list, its own
  history, and nothing changes in learning (nothing is shown above its
  text). **stats** shows the statistics
  of the mode you were in; once freetype is open, a small learn / freetype
  switch on the stats screen changes the mode there too. Freetype opens when every letter is open, or
  right away if you pass the **typing test**: while it is locked (a small
  lock on its icon), clicking it starts the test, one round of 30 words at
  30 wpm with 97% accuracy. Only a full round counts (`Esc` stops the test);
  if it does not pass, the result's button says **Try again** and starts
  the test once more (the Learn tab goes back to learning). The mode is
  remembered per language.
- **Settings** (`Esc`, or the gear in the navigation) opens one window in
  the middle of the screen. Typing filters it (search), `↑ ↓` pick a row,
  `← →` change its value, `Enter` presses a button, `Esc` closes it. On a
  phone the Settings button in the bottom bar opens it. What is in it:
  - **round length**: 10, 20, 30, 40 or 50 words, or 15, 30, 60 or 90 seconds (default 30
    words). A words round ends with the last letter of its last word, a time
    round when the time is up; the counter in the text card shows the words
    or the seconds left. The typing test is always 30 words.
  - **live speed** (wpm and accuracy while typing): on or off. A brand-new user does
    not see them until the first finished round (a beginner should not
    chase speed); then they appear and you can hide them again. The word
    counter and the streak always stay.
  - **caret**: a thin line (default), a block over the letter, a bar under
    it (underline) or a frame around it (outline).
  - **theme**: dark (default) or light: a warm paper page with white cards,
    its own colours rather than the dark theme turned inside out.
  - **keyboard** (the keys and the hands): on or off (same as `Alt + K`; remembered
    in your browser, separately for learning and for free practice / the
    test, where they start hidden). Not on a phone or tablet: there you type
    on the device's own keyboard, so the option is not shown. There
    is no size setting: the keyboard is always as big as the window allows
    without making the page scroll.
  - **data**: **export** writes all languages and the full history
    to one `.json` file, **import** reads such a file back and **replaces** the
    current data (use it to keep progress across server restarts or page
    reloads on the website).
  - **danger zone**: **reset all progress** deletes everything: progress in all
    languages and the settings saved in your browser, as on the very first
    visit. A window asks first ("Reset all progress? This can't be undone.",
    Cancel has the focus), so it does not happen by accident.
  The settings only change how much you type and how it looks; what you
  practise is still up to the trainer. They are kept in this browser.
- For now only English is offered. When Polish, Ukrainian and Russian come
  back, a language switch changes the language you practise **and the
  language of the interface**.
- **Tab starts a new round** (as on monkeytype): the round you were typing
  is dropped and not saved; the keypresses already sent on the way stay with
  your letters. `Esc` ends the round early, shows its result and opens the
  settings over it.
- **Rounds of 30 words, picked while you type.** The text is not ready in
  advance: it grows a few words at a time (a portion of 6 words around one
  focus letter), and every new portion is chosen from your newest statistics.
  The two lines ahead never change under your eyes. A word you mistyped comes
  back a line or two later. The counter `12/30 words` shows how much of the
  round is left. The round ends as soon as the last letter of its last word is
  typed (no space needed); 10 seconds without a key also end it.
- The **bolt + number** at the right end of the numbers line counts clean words
  in a row (typed without a single mistake; hover for the tooltip). It gets
  hotter as it grows: green from 3, yellow from 10, orange with a zapping bolt
  from 25, glowing red from 50. New records, mastered letters, new letters and
  the streak at 10 and every 25 words get a small confetti.
- **While you type** the feedback is where your eyes already are: the focus
  letter of each portion is tinted in the text, the letter under the caret
  is a step brighter than the rest, and the numbers line changes once per
  word (calm, not every key). A letter typed right settles from a short warm
  flash into the text colour; a mistake makes the caret shrink, turn red
  and shake for a tenth of a second. The key on the drawn keyboard dips and
  the finger that pressed it taps down with it. While you pause, the caret
  breathes (fades out and in) instead of blinking.
- **The result** opens as one short sequence: the speed counts up from 0,
  the word chart draws itself from left to right, then the facts, the words
  and the button follow. **The stats screen** opens the same way: the tiles
  rise one after another and the bars grow from the baseline. On a desktop
  the whole stats screen fits the window: the chart takes the height the
  rest leaves.
- **When the round ends** the text window shows the result instead of the
  text: the numbers first (speed in wpm, accuracy and the **consistency** of
  your speed: how even the pace was, 100 % = every second the same; rounds
  under 5 seconds get none). Under them, smaller: Characters (right, wrong,
  extra and missed letters, for example `128/3/0/1`; hover for what each
  number is) and the Time of the round, from the first to the last press.
  Then one plain line if something happened (a
  new letter ("New letter" over the letter on a gold key, at the end of the row of numbers, like "Mastered"), a new record, mastered letters), then which letters got faster
  or slower, as the time per press before and now (for example
  `s 320→250ms`), Faster on the left and Slower on the right, then the
  words of the round as you typed them, a letter that had a mistake
  underlined in red. Each word is coloured by its speed in this round, from
  red (your slowest words) through yellow to green (your fastest); the
  legend above the chart ("Speed of each word, wpm") shows the wpm range of each colour. The steps are
  equal parts between your slowest and fastest word, as on Monkeytype, so
  the colours compare words of one round, not you with anyone. When every
  word had about the same speed, all are yellow and there is no legend.
  Above the words, a small chart shows the speed of each word in the order
  you typed them: one dot per word in its speed colour, a red cross above a
  word that had a mistake (hover or tap a dot for the word and its speed).
  Thin lines separate the parts of the result.
  Hover a word (or tap it on a phone) to see its own speed: the average
  time per press of its letters and the space after it, in wpm. Each part
  is its own block with some air between (good news, a new letter or a
  record, on a soft yellow tint), and the window is only as wide and as tall as what it
  shows (a long list of words scrolls inside). No
  jokes or tips there. The result stays until you go on on purpose:
  **Enter**, **Tab** or the yellow **Next round** button
  (a tap on it also opens the phone keyboard, so you can type at once) (letters do nothing there, and there is no
  timer). Switching to another mode from there closes it too. On a phone
  the keyboard closes when the round ends, and it stays closed while the
  result is open, also after a look at the stats and back.
- Small messages under the letters are only used outside typing (a file
  saved or loaded).
- **Help** (the **?** in the navigation) opens a panel about the screen you
  are on: a few short points for Learn, Freetype, the typing test or Stats
  (bold start, read in seconds), then **Walkthroughs** (**Touch typing basics**
  everywhere, **Tour of this screen** on Learn; Enter / → next, Esc closes;
  from the stats screen they first go back to typing), then the keys.
- On a touch screen there is no `Esc`: a small **stop** button under the text
  card ends the round (it appears with the first letter). The shortcut line
  is hidden there; on the stats screen it shows only the keys that work
  there.
- On a narrow screen the page dims behind Help; behind Settings it always
  dims.
- Shortcuts, also listed small at the bottom of the page: `Esc` stop /
  settings ·
  `Shift + Tab` Learn / stats · `Alt + K` keyboard and hands on / off.
- **Stats**: nothing on the page can be selected by dragging; instead the
  stats screen has **image** (a PNG card with the five numbers, the speed of
  the last 30 rounds and every letter, in the colours of the current theme).
  It takes what the screen shows.
- The top line of the text card shows **wpm**, **raw** (every keypress counts,
  wrong ones too, like on monkeytype; only shown, never stored) and accuracy.
  It is dim while you read and bright while you type. The caret keeps one
  colour.
- The text window has one fixed size (3 lines): only its content changes. A
  longer text scrolls up line by line, the line you type stays the second one.
- The **profile** in the top right corner shows your name on the left of
  the picture ("Guest" until you set one; "Log in" where accounts work and
  you are not logged in; on a phone a long name ends with "…"). With the
  local server (`go run .`)
  you can **sign up** or **log in** there (name: 3–20 of a–z, 0–9, `_`, `-`;
  password: at least 8 characters). Your progress is then kept under your
  account; **log out** returns to the guest. Without an account every
  browser is its own guest, remembered by a cookie: clearing the browser's
  cookies starts a new guest from zero. A new account starts from the
  first letters. Accounts survive a restart only with a database (see
  "Keeping progress in PostgreSQL"). The picture (a colour, or your own image) is kept only in
  this browser. On the website (GitHub Pages) there are no accounts: you can
  set a name and a picture, kept only in this browser; "reset" forgets them.
- **stats** in the navigation (or `Shift + Tab`) opens the statistics screen.
  It fits on one screen without scrolling on a usual desktop (1280×800 and
  up), so "how am I doing?" takes a glance:
  - a row of round lengths and the numbers: rounds, best wpm, and the
    averages of the last 10 rounds (wpm, accuracy, consistency). Rounds of
    different lengths are never mixed: the row always has all nine lengths
    (10–50 words, 15–90 s; older 60-word rounds keep their own button), it opens on the one chosen in the
    settings, and a length with no rounds yet shows empty numbers;
  - the speed of every round (hover a bar for its numbers);
  - side by side (learning only): a **difficulty keyboard** (grey keys, the
    redder the harder the letter is for you, dashed = no data yet) and every
    letter as a small chip from weakest to strongest, with a thin red bar for
    how hard it is and a green tick when mastered.
  The exact numbers are in tooltips: hover, tap, or move to a key or chip
  with `Tab`.

## A user study (for the thesis)

To compare the algorithm with random words on real people, give half of the
participants this link (with your own address):

```
http://localhost:3000/?group=random
```

and the other half the normal address. In the "random" group the words are
chosen at random from the open letters; everything else is the same, and
nothing on the screen says which group it is. Every round remembers its
group, and **Export** saves it, so you can compare the two groups later.
`?group=adaptive` puts a browser back to normal. A reset clears the group:
open the link again after one.

## Languages and layouts

For now only English is offered. Polish, Ukrainian and Russian are in the data
and come back later; then a switch at the top chooses the language, and each
language keeps its own progress. Switch your **system** keyboard layout too
(Windows: Win + Space); the app shows a hint when the layout does not match.
Polish uses the standard "Polish (Programmers)" layout: ą, ę, ł... with AltGr.

## Where your progress is kept

- **Local server with a database** (`DATABASE_URL` set, see below): in
  PostgreSQL, for the guest and every account. Nothing is lost when the
  server stops.
- **Local server without a database** (`go run .` alone): in the server's
  memory. Stopping the server forgets everything (accounts too), so save a
  file first (settings, **export**) and import it back after the restart.
- **Website (GitHub Pages)**: in the open browser tab. Reloading the page
  forgets it; **save** and **load** work the same way.

## Keeping progress in PostgreSQL (Windows)

1. **Install PostgreSQL** (once): the installer from
   <https://www.postgresql.org/download/windows/>. Keep the default port
   5432 and remember the password you choose for the user `postgres`.
2. **Create the database** (once): Start menu → *SQL Shell (psql)*, press
   Enter on every question until it asks for the password, type it, then:
   `CREATE DATABASE typetrainer;`
3. **Start the trainer with it**, in PowerShell in the project folder:

   ```
   $env:DATABASE_URL = "postgres://postgres:YOUR_PASSWORD@localhost:5432/typetrainer"
   go run .
   ```

   The log says `storage: PostgreSQL`. The variable lives only in this
   PowerShell window; set it again in a new one. If the password has
   characters like `@`, `:` or `/`, write them as `%40`, `%3A`, `%2F`.
4. The tables are created on the first start. pgAdmin (installed with
   PostgreSQL) shows them: `typetrainer` → Schemas → public → Tables.

Optional, to run the database tests too: create a second database
`typetrainer_test` (its tables are emptied by every test run), then
`$env:TT_TEST_DATABASE_URL = "postgres://postgres:YOUR_PASSWORD@localhost:5432/typetrainer_test"`
and `go test ./...`.
