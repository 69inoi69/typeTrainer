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
   `Typing trainer running. Open http://localhost:3000 in your browser`.
   If Windows asks about the firewall, "Allow" is fine.
5. **Open** <http://localhost:3000>. Always use this address: double-clicking
   `web/index.html` opens the page without the server, with no words and no
   statistics. If the port is taken, change `Addr` in
   `internal/config/config.go`.
6. **Stop** the server with `Ctrl + C`. Without a database (below) progress
   is lost then: save it first with the export button and load it back next
   time.

After `git pull` restart the server: the web files are built into the program.
Optional: `go build -o typetrainer.exe .` makes one `.exe` to double-click.

## Typing screen

- The app opens with a short start screen: the logo types itself, a random
  phrase in your language, then the page slides in. Any key or click skips it.
- On the very first visit a short hands-on intro starts: put your fingers on
  the home row and press those eight keys, press space with a thumb, then
  "watch the screen". It reacts to the real keys (physical positions, so it
  works with any system layout). `Esc` or "skip" closes it; the **beginner guide**
  button reopens it. At the end: "Start". Everyone starts with a few letters;
  if you already type well, the next ones open quickly.
- Type the grey text. Wrong key = the letter turns red and you keep going, as
  on monkeytype. Backspace fixes the current word (Ctrl+Backspace: the whole
  word); at the start of a word it takes you back into the previous word, one
  word at most, so you can finish a word you skipped. Space in the middle of a word jumps to the next one. A fixed
  mistake still counts for the letter's statistics.
- The row of letters at the top shows your progress: open letters, the letter in
  **focus** (yellow, your weakest right now), mastered letters (green dot), and
  locked letters (outlined). Master every open letter and the next one opens.
  Under it, small status pills: focus letter, mastered open letters (with a
  bar) and the next letter; hover them for details. Caps Lock and wrong layout
  warnings appear in the same place, on top of the pills, so nothing moves.
- The keyboard shows the next key in its finger color; keys you do not need yet
  are dimmed. Above the keyboard two hands light up the finger that presses
  it (space = both thumbs, AltGr letters = right thumb + the finger).
- The header is quiet, as on monkeytype: on the left the logo and two small
  icons (typing / statistics), on the right the languages and the profile.
  The chosen option has a short yellow line under it. From your first
  keypress until the end of the round the header steps back: the logo turns
  grey, the controls almost vanish (move the mouse over the header to bring
  them back) and the small phrase over the logo turns into a "typing" one.
- **learning · free** in the header chooses the mode. **Learning** is the
  trainer: it picks words for your weak letters and opens new ones.
  **Free practice** gives words from the whole list, keeps its own history
  (the statistics screen shows it while free practice is chosen) and changes
  nothing in learning. Free practice opens when every letter is open, or
  right away if you pass the **typing test**: while it is locked (a small
  lock on the tab), clicking it starts the test, one round of 30 words at
  30 wpm with 97% accuracy. Only a full round counts (`Esc` stops the test);
  you can take it again any time. The mode is remembered per language.
- The **gear** in the bottom bar opens the **settings**:
  - **round length**: 10, 30 or 60 words, or 30 or 60 seconds (default 30
    words). A words round ends with the last letter of its last word, a time
    round when the time is up; the counter in the text card shows the words
    or the seconds left. The typing test is always 30 words.
  - **wpm and accuracy while typing**: show or hide. A brand-new user does
    not see them until the first finished round (a beginner should not
    chase speed); then they appear and you can hide them again. The word
    counter and the streak always stay.
  - **caret**: a thin line (default) or a block.
  The settings only change how much you type and how it looks; what you
  practise is still up to the trainer. They are kept in this browser.
- The **EN · PL · UK · RU** switch changes the language you practise **and the
  language of the interface** (remembered in your browser; the first time it
  follows your browser's language).
- **Tab does not restart.** Restarting throws away exactly the mistakes the
  trainer learns from, so Tab only answers with a small animation; the result
  screen then says how many times you resisted. `Esc` (stop) ends the round
  early and shows its result.
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
  letter of each portion is tinted in the text, the caret turns green while your speed is at
  the goal, and the numbers line changes once per word (calm, not every key).
- **When the round ends** the text window shows the result instead of the
  text: one main line (a new letter with a joke about it, a new record,
  mastered letters, or a short verdict on accuracy), which letters got faster
  or slower, the **consistency** of your speed (how even the pace was, 100 % =
  every second the same; rounds under 5 seconds get none), and now and then a tip. Space, Enter or any letter goes on at
  once; otherwise the next text comes when the thin bar is full (hover pauses
  it). The texts are picked at random from small pools in every language.
- Small messages under the letters are only used outside typing (a file
  saved or loaded).
- **How this site works:** the **?** icon in the header starts a short tour:
  each part of the page gets a light ring and a sentence or two about it
  (Enter / → next, Esc closes). On the first visit it starts by itself after
  the intro.
- Buttons in the bottom bar (hover for a tooltip): **beginner guide** (the
  intro again) and the **keyboard** button (hides or shows keyboard and hands,
  same as `Alt + K`; remembered in your browser, separately for learning and
  for free practice / the test, where it starts hidden). There is no size setting:
  the keyboard is always as big as the window allows without making the page
  scroll, and it grows or shrinks when the window changes.
- The two arrow buttons save your statistics (all languages, full history) to one
  `.json` file and load such a file back. Loading **replaces** the current data.
  Use it to keep progress across server restarts (or page reloads on the website).
- The red-on-click bin button resets everything: progress in all languages and
  the settings saved in your browser, as on the very first visit. It needs a
  second click (the first one turns it red), so it does not happen by accident.
- Shortcuts, also listed small at the bottom of the page: `Esc` stop ·
  `Shift + Tab` type / stats · `Alt + 1…4` language · `Alt + K` keyboard and
  hands on / off. On phones (no Esc key) a "stop" button is shown under
  the text instead.
- The top line of the text card shows **wpm**, **raw** (every keypress counts,
  wrong ones too, like on monkeytype; only shown, never stored) and accuracy.
  It is dim while you read and bright while you type. Over the logo there is a
  small phrase: the same one the start screen showed, it flies there with the
  logo.
- The text window has one fixed size (3 lines): only its content changes. A
  longer text scrolls up line by line, the line you type stays the second one.
- The **profile** in the top right corner: with the local server (`go run .`)
  you can **sign up** or **log in** there (name: 3–20 of a–z, 0–9, `_`, `-`;
  password: at least 8 characters). Your progress is then kept under your
  account; **log out** returns to the guest. Without an account every
  browser is its own guest, remembered by a cookie: clearing the browser's
  cookies starts a new guest from zero. A new account starts from the
  first letters. Accounts survive a restart only with a database (see
  "Keeping progress in PostgreSQL"). The picture (a colour, or your own image) is kept only in
  this browser. On the website (GitHub Pages) there are no accounts: you can
  set a name and a picture, kept only in this browser; "reset" forgets them.
- The **keyboard / chart** icon switch at the top (or `Shift + Tab`) opens the statistics screen. Rounds of different
  lengths are never mixed: a row of lengths above the numbers shows the one
  chosen in the settings, and you can pick another length you have played. Then: totals
  (with the average consistency of the last 10 rounds),
  speed of every exercise, a **difficulty keyboard** (grey keys, the redder the
  harder the letter is for you, dashed = no data yet; hover or tap a key for
  its numbers), and every letter from weakest to strongest.

## Languages and layouts

English, Polish, Ukrainian and Russian, chosen with the switch at the top. Each
language keeps its own progress. Switch your **system** keyboard layout too
(Windows: Win + Space); the app shows a hint when the layout does not match.
Polish uses the standard "Polish (Programmers)" layout: ą, ę, ł... with AltGr.

## Where your progress is kept

- **Local server with a database** (`DATABASE_URL` set, see below): in
  PostgreSQL, for the guest and every account. Nothing is lost when the
  server stops.
- **Local server without a database** (`go run .` alone): in the server's
  memory. Stopping the server forgets everything (accounts too), so save a
  file with the export button first and load it back after the restart.
- **Website (GitHub Pages)**: in the open browser tab. Reloading the page
  forgets it; the export button works the same way.

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
