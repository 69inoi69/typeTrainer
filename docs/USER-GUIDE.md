# User guide

Everything the trainer does, screen by screen. For a quick overview see the
[README](../README.md); for the math behind it see [ALGORITHM.md](ALGORITHM.md);
to run it yourself see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Phones and tablets

On a touch screen without a mouse the page shows only your **stats** and the
**account** in the corner: typing practice needs a computer keyboard (the
trainer teaches ten fingers on real keys, and typing with thumbs would give
it wrong numbers about your letters). A short line at the top says so. There
is no navigation and no intro. On GitHub Pages the stats are the ones kept in
this browser, so a phone shows its own (usually none); with an account on
the normal server, it shows yours.

## Typing screen

- The app opens with a short start screen (about a second): the key icon
  pops in, the word types itself, and the two fly together
  into the header, then the page slides in. Any key or click skips it.
- On the very first visit a short guide, **touch typing basics**, runs (skip
  it with `Esc` or "skip"; it does not come back): what touch typing is (a
  small keyboard map where every key has the colour of its finger, and one
  line on posture), then put your fingers on the home row and press those
  eight keys, press space with a thumb, and "watch the screen". It reacts
  to the real keys (physical positions, so it works with any system
  layout). `←` `→` (or `A` `D`, except on the home row step, where they are
  keys to press) go back and on. At the end: "Start". Everyone starts with a
  few letters; if you already type well, the next ones open quickly. There
  is no help menu and no tour of the page (owner, 2026-10-18): the site
  still changes too often for a guide to it.
- Type the grey text. Wrong key = the letter turns red and you keep going, as
  on monkeytype. Backspace fixes the current word (Ctrl+Backspace: the whole
  word); at the start of a word it takes you back into the previous word, one
  word at most, so you can finish a word you skipped. Space in the middle of a word jumps to the next one. A fixed
  mistake still counts for the letter's statistics.
- The row of letters right above the text shows your progress: open letters, the letter in
  **focus** (yellow: the next few words are built around it; it is picked
  anew every few words, weaker letters more often), mastered letters (green,
  with a small tick), and locked letters (crossed out; the one that opens
  next has a gold dashed frame, hover it for the rule). An open letter's
  colour goes from red to green as it gets closer to mastered (a letter not
  typed yet has no colour), and a thin bar under it says the same in
  length. A letter is mastered when you have typed it at
  least 20 times, recently with under 5% mistakes and at 30 wpm or faster
  (the numbers come from the server's settings). Master every open letter
  and the next one opens.
  Before the first key, the line of the live numbers also says how many
  letters are open and to type the text to begin; once you type it holds
  only the numbers (the focus and the next letter are in the row above).
  It never moves while you type: every number keeps the room of its widest
  value.
  Caps Lock and wrong layout warnings appear on top of that whole
  line, so nothing moves: a small card with what is wrong and, for the
  layout, the usual keys that switch it on your system (Windows Win + Space,
  macOS and ChromeOS Ctrl + Space, Linux Super + Space). In Chrome and Edge
  the wrong layout shows as soon as the page opens, before any key (and goes
  away once you switch); in other browsers (Firefox, Safari, and Brave, which
  hides the layout from sites) after the first keys. Caps Lock shows at the
  first mouse move or any key, in every browser, and goes once it is off. A key typed
  in the wrong layout or with Caps Lock never starts the round.
- The keyboard shows the next key as the one key in its full finger color
  (bright on the dark theme, a deep shade on the light one), raised a little
  and glowing in that color, so the corner of the eye finds it without
  looking down; keys you do not need yet
  are dimmed. A small hand rides along the top edge of the keyboard, right
  above the column of the next key, and lights up the finger that presses
  it (space = both thumbs, AltGr letters = right thumb + the finger, a
  capital = the finger + the other hand's little finger on Shift). The next
  letter in the text takes the colour of that finger, so you can see the
  finger without looking down.
- The keyboard shows only in Learn, while letters are still opening: that
  is when you learn where the keys are. Once every letter is open, and in
  Climb and Freetype, it is hidden: by then you type without looking. It
  is not a setting. When it goes or comes it fades; its room stays, so the
  letters and the text stand at the same place in all three modes. No setting but the text size changes its size; browser
  zoom makes it smaller or bigger together with the rest of the page.
- The screen has three fixed places, as in a real app:
  - **the header**: the logo on the left, the account on the right ("log in"
    with a person icon until you are logged in, then your picture and name);
  - **the navigation**: a column at the left edge of a wide window, a bar at
    the bottom of a narrow window or a phone. Two groups: the three screens
    **Learn**, **Climb**, **Freetype** and **Stats**, then **Settings**.
    The chosen screen has a short yellow bar next to it.
  From your first keypress until the end of the round everything around the
  text steps back: the whole header fades, the logo a little less than the
  controls (move the mouse over them to bring them back).
- Two kinds of text: what changes (the words, letters, numbers, messages) is
  bright; what never changes (labels, menus, explanations) is quieter,
  labels small and grey. Everything uses one monospace font, Geist Mono,
  which comes with the app (it looks the same on every computer).
- **Learn**, **Climb** and **Freetype** in the navigation choose the mode;
  all are open to everyone, and the mode is remembered per language.
  - **Learn** is for beginners: the trainer opens the letters one by one,
    starting on the home row (`a s l d e f r` in English), and picks words
    for your weak letters. Its progress is in plain sight, there is no stats
    screen for it: in the row of letters every open letter has a thin bar of
    how close it is to mastered (its weakest part: presses, mistakes or
    speed), and its tooltip says its numbers and what it still needs
    ("needs fewer mistakes, more speed"); the next letter's tooltip names
    the letters still to master. On the keyboard the letter of a key you
    have mastered fades away: your fingers know it, your eyes need not look.
    After every round the result says which letters are mastered, which to
    practise and why, and which letter comes next.
    The words are real words, never one letter alone (`a`, `i`), and no
    word comes more than twice in a round.
  - **Climb** is for those who can already type: no letters to unlock, the
    text simply gets harder as you get better. It is words only, in lower
    case. There are ten levels: level 1 draws from the 200 most common
    words, then 500, 1 000, 2 000, 3 000, 5 000, 7 500, 10 000, 15 000 and
    all 25 000 at level 10. A whole round is typed at one level. A round at
    96% accuracy or more counts; three of them take you a level up. A round
    under 92% starts the count again, two in a row take you a level down.
    Speed does not count. The status line shows the level with one dot per
    round counted, and the result says what the round counted for. The
    round bar lets you pick any level (the count starts again). Climb also learns
    your **weak pairs**: the two-letter movements (`ck`, `ou`...) your
    last 20 Climb rounds were slowest or least accurate on. Half the words
    carry one of them, and the result names them. After the first round or
    two there is not enough data yet, and the words are plain.
  - **Freetype** is just typing, as on monkeytype: nothing adapts. The row
    above the text picks the word list: **200**, **1k**, **5k**, **10k** or
    **25k**, the most common words of the language (a click starts a new
    round on that list; it is remembered per language). The words are in
    lower case, without punctuation, unless you switch on a kind of text
    before the lists (one at a time; a second click goes back to plain words):
    - **long words**: only words of 6 letters or more from the list;
    - **sentences**: real sentences with capitals, commas and full stops
      (from Tatoeba); the word lists step aside;
    - **your text**: paste a text (up to 5000 characters) and type it word
      by word; each round starts where the last one ended. It stays in
      your browser; **edit** changes it. The word lists step aside.
    The result names the list and the kind of text.
  **Stats** are Learn's, Climb's and Freetype's: on top you pick which (and,
  for Freetype, the kind of text and the word list); every list and kind
  has its own rounds and bests.
- **The round bar** above the text says what a round of this mode is; a
  click starts a new round with it, and each mode remembers its own:
  - Learn: **15 words** or **30 words**, at the right end of the line just
    above the text, next to the word counter;
  - Climb: **Words** or **Time**, then 10, 20, 30, 40 or 50 words or 15, 30,
    60 or 90 seconds (default 30 words);
  - Freetype: the kind of text and the word list (200 to 25k), then the same as Climb.
  A words round ends with the last letter of its last word, a time round
  when the time is up; the counter in the text card shows the words or the
  seconds left. While you type the bar steps out of sight.
- **Settings** (`Esc`, or the gear in the navigation) opens one window in
  the middle of the screen. Typing filters it (search), `↑ ↓` pick a row,
  `← →` change its value, `Enter` presses a button, `Esc` closes it. On a
  phone the Settings button in the bottom bar opens it. On top, a short
  line types itself in the look you choose (text size, caret, its
  movement, the marks on spaces, the theme), and stays in view while you
  scroll, so every change shows at once. Hold the mouse over a setting's
  name and a tooltip says what you get from it. What is in it, by group:
  **Screen**
  - **live stats** (wpm, raw speed and accuracy while typing): on or off. A brand-new user does
    not see them until the first finished round (a beginner should not
    chase speed); then they appear and you can hide them again. The word
    counter always stays.
  - **text size**: small, normal (default) or large text on a computer
    screen.
  - **caret movement**: smooth (default: the caret glides to the next
    letter, quicker when you type fast, so it keeps up with your keys) or
    jump (it moves at once).
  - **clean words in Freetype**: the bolt and number above the caret (clean
    words in a row), on or off (default). Learn and Climb never show it.
  - **background**: keycaps falling slowly in the empty fields at the
    sides, on or off (default).
  - **caret**: a thin line (default) or a block over the letter. It stands
    still when you stop typing.
  - **theme**: dark (default) or light: a warm paper page with white cards,
    its own colours rather than the dark theme turned inside out.
  **Typing**
  - **stop on a mistake**: off (default) or on. On, the caret waits on a
    wrong key until you press the right one: no red letters run ahead, no
    skipped or extra letters. Every wrong press still counts as a mistake of
    that letter, exactly as without the setting.
  - **sounds**: off (default), mistakes (a short low tone) or every key (a
    soft click, and the tone on a mistake), and their **volume** (25-100%,
    shown only with a sound on). Choosing one plays it once.
  - **break reminder, minutes**: off (default), 20, 30, 45 or 60. After that
    much typing with no break (a gap of 5 minutes between rounds is a break)
    a calm message at the end of a round suggests a rest.
  **Keyboard**
  - **next key**, **hand above the keys** and **finger colour in the text**
    act while the keyboard shows (in Learn, until every letter is open);
    not on a phone or tablet. Each works on its own, in any
    combination. The keys are always in their finger colours.
  - **next key**: on (default) or off. Off, the next key does not light up:
    you find every key from memory.
  - **hand above the keys**: on (default) or off. Off, there is no hand;
    its room stays, so the keyboard keeps its size and place.
  - **finger colour in the text**: on (default) or off. On, the next letter
    in the text is in the colour of the finger that types it.
  **Goals**
  - **daily goal, minutes**: off, 5 to 60 (15 by default). The Learn panel
    shows today's typing time against it, a Learn round that reaches it
    pauses with "Daily goal reached", and the stats calendar rings every
    day that met it.
  - **speed goal, wpm**: off (default), 30, 40, 50, 75, 100, 125, 150 or
    200. The stats screen then shows how far you are from it. Only for you:
    the trainer does not change, letters still open at its own speed.
  - **progress data**: **export** writes all languages and the full history
    to one `.json` file, **import** reads such a file back and **replaces** the
    current data (use it to keep progress across server restarts, or to
    move it from the website to another browser).
  - **reset progress**: the **reset** button deletes everything: progress in all
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
  your letters. `Esc` pauses the round and opens the settings; the first key
  after them goes on with it.
- **A round that could not be saved** (no connection) is tried again
  twice by itself. If it still fails, Climb and Freetype show the result
  anyway with **Save again**; leaving that screen drops the round, and an
  unsaved Climb round does not move your level. In Learn a message offers
  the same button; the letters of that round are counted either way. A
  round the server turns down as impossible (for example faster than
  400 WPM) is not tried again.
- **Rounds of 30 words, picked while you type.** The text is not ready in
  advance: it grows a few words at a time (a portion of 6 words around one
  focus letter), and every new portion is chosen from your newest statistics.
  The two lines ahead never change under your eyes. A word you mistyped comes
  back a line or two later. The counter `12/30 words` shows how much of the
  round is left. The round ends as soon as the last letter of its last word is
  typed (no space needed). Leaving the window (Alt+Tab, another app,
  another tab) or 10 seconds without a key pause the round, before the
  first key too: everything between the header and the shortcuts (the
  letters, the panel, the text, the keyboard) blurs and steps back under
  a breathing pause sign and "Paused", the clock stops (a timed round does
  not run out), and any key goes on; the time away does not count. In
  Learn, reaching the daily goal pauses the round the same way, with a
  green tick and "Daily goal reached" instead.
- In Freetype, with the streak turned on in the settings: from 3 clean
  words in a row (typed without a single mistake) a small
  **bolt and number** ride just above the caret and count them; the colour
  warms as the streak grows (gold, orange from 10, rose from 25, violet
  from 50). Every clean word after that makes the number hop once; at 10,
  25, 50 and every 50 after, the whole badge gives a small bump.
  A mistake ends the streak and the badge goes away. New
  records, mastered letters and new letters still get a small confetti.
- **While you type** the feedback is where your eyes already are: the focus
  letter of each portion is tinted in the text, and the numbers line changes once per
  word (calm, not every key). A letter typed right turns white at once (as
  on monkeytype, nothing to slow the page down); a mistake makes the caret shrink, turn red
  and shake for a tenth of a second. The lit key on the drawn keyboard dips
  a little as its light goes out, and the next key and finger light up. While you pause, the caret
  stands still. Every space shows a faint dot, so it reads as a key too.
- **The result** (Climb and Freetype) comes about a tenth of a second after
  the last letter: the caret reaches the end, the finished text fades out
  (this wait is not in the speed), and the whole result fades in at once
  while rising a little. In Learn the last letter turns white, and the next
  round's words fade in.
  **The stats screen** opens with a short entrance: the tiles
  rise one after another and the bars grow from the baseline, but only when
  there is something new since you last looked; switching back and forth
  between the screens plays nothing again, and a result you come back to
  keeps its final look.
- **When the round ends** the text window shows the result instead of the
  text: the numbers first (speed in wpm, accuracy and the **consistency** of
  your speed: how even the pace was, 100 % = every second the same; rounds
  under 5 seconds get none). Under them, smaller: Characters (right, wrong,
  extra and missed letters, for example `128/3/0/1`; hover for what each
  number is) and the Time of the round, from the first to the last press.
  **Learn has no result screen** (owner, 2026-10-20): the next round
  starts at once, and the **Learn panel**, two lines under the letters,
  tells what the round did. The first line is four fixed columns, each a
  small grey label over its value ("—" while it has nothing yet; hover
  for when it fills): **Last round**, the last round's speed and
  accuracy, each with an arrow when it differs from your average of the
  10 rounds before it (from 3 rounds on, the same round length only; hover
  the arrow for the average); **Next letter ≈ 6 rounds**, a guess of how
  many rounds the next letter is away (from the trend of your last 6 rounds
  of each letter still to master; the slowest decides, since the next
  letter waits for all of them; "50+" for a long way). It shows nothing
  rather than a wild guess: while a letter has fewer than 3 rounds, or
  is not getting better (its recent mistakes are not under 5%, or it is
  not getting faster);
  after Learn complete the column is the **Lap** ("Lap 2 of 7 ≈ 6 rounds",
  when the lap ends); **Clean streak** ("4 rounds at 97%+": the highest of
  100, 98, 97, 95 and 90% reached two rounds in a row or more); and
  **Daily goal**, your typing time today in every mode against the daily
  goal (15 minutes unless you change it in Settings; Off leaves the
  column empty), on a ring that fills as the time passes, with the days
  in a row you met it in its label. This line is the summary between
  rounds: it shows before the first key of a round and goes with the
  first key, so while you type the screen holds only the letters row
  (it slides down into the panel's place, closer to the text), the word
  counter, the live numbers (if they are on in Settings) and the text;
  the letter being learned is the gold chip in the row. The line just
  above the text uses the same six columns as the panel, so their
  dividers line up: the word counter, then the news of the last round at
  rest or the live numbers right after the counter while you type, and on
  the right the round switch (at rest).
  After every line of words the letters row, the forecast and the daily
  goal are drawn again, and a number that changed counts to its new value
  and glows gold for a moment. The news shows right after a round with
  news, until you start typing: a new letter, the letters you
  mastered, your fastest round of this length, once per language
  "Every letter is open", and a new lap. **Laps** (after keybr): when every
  letter is mastered at 30 wpm, Learn is complete and the next lap starts
  at once: the same letters, the goal 5 wpm higher (35, 40, ... up to 60
  wpm, 7 laps in all). The letters that are already that fast turn green
  again with their next press, the slow ones come up more until they catch
  up; no letter closes. After the last lap the news says every lap is done
  (hover it for what comes next: the words keep growing towards the 2000
  most common, and Climb and Freetype are there). The panel steps back while you type. Hovering a gold
  letter in the text says why it is gold.
  Everything below is the
  result of Climb and Freetype. In Climb the row of facts ends with the
  **Level** and how far it moved in this round, and the **Weak pairs** your
  next rounds practise. Then which letters got faster
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
  is its own block with some air between (good news on a soft yellow
  tint), and the window is only as wide and as tall as what it
  shows (a long list of words scrolls inside). No
  jokes or tips there. The result stays until you go on on purpose:
  **Enter**, **Tab** or the yellow **Next round** button
  (a tap on it also opens the phone keyboard, so you can type at once) (letters do nothing there, and there is no
  timer). Switching to another mode from there closes it too. On a phone
  the keyboard closes when the round ends, and it stays closed while the
  result is open, also after a look at the stats and back.
- Small messages under the letters are only used outside typing (a file
  saved or loaded).
- On a touch screen the shortcut line is hidden.
- Behind Settings the page dims.
- Shortcuts, also listed small at the bottom of the page (each screen lists
  only the keys that work on it): `Tab` new round · `Esc` settings ·
  `Shift + Tab` typing / stats ·
  `Ctrl + Backspace` delete the word.
- **Stats**: nothing on the page can be selected by dragging; instead the
  stats screen has **image** (a PNG card with the five numbers and the speed
  of the last 30 rounds of Climb, in the colours of the current theme).
  It takes what the screen shows.
- The top line of the text card shows **wpm**, **raw** (every keypress counts,
  wrong ones too, like on monkeytype; only shown, never stored) and accuracy.
  The caret keeps one colour.
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
  CONTRIBUTING.md, "With PostgreSQL"). The picture (a colour, or your own image) is kept only in
  this browser. On the website (GitHub Pages) there are no accounts: you can
  set a name and a picture, kept only in this browser; "reset" forgets them.
- **stats** in the navigation (or `Shift + Tab`) opens the statistics screen,
  a page that scrolls, built after monkeytype's account page, with a switch
  of the mode on top (Learn, Climb, Freetype):
  - the **personal bests** on top: two cards, rounds of 10–50 words and of
    15–90 seconds (older 60-word rounds keep their own cell), the best wpm of
    every length big with the accuracy of that round under it ("—" before the
    first round). A click on a cell picks the length everything below shows
    (it opens on the mode's own length): rounds of different lengths
    are never mixed;
  - **time typed**, every round length and every mode together, counted
    for **today**, the **last 7 days** or **all time** (the switch on the
    right; your choice is remembered): time typing, rounds, words, **days in a row** (a day not practised yet does not break
    it; a whole missed day does) and an **activity calendar** of the last
    year (fewer weeks on a narrow screen), a square a day, brighter the
    longer you typed, with the months above and Mon / Wed / Fri on the left
    (hover a square for the day); a day on which you met your daily goal
    has a green ring. Days end at your own midnight;
  - the picked length in detail: rounds, and the averages of the last 10
    rounds (wpm, accuracy, consistency), each with a small green or red
    arrow for how it moved against the 10 rounds before; the **accuracy
    streak**: your longest run of rounds in a row at 95% accuracy or better,
    with the same for 97% and 100% under it (hover it to see the run you are
    on now); speed does not count there, only care; with a **goal** set
    in the settings (30–200 wpm, learning only) one more tile with the goal,
    how much the average of the last 10 is still below it, and a bar of the
    way (the goal is only for you: letters still open at the trainer's own
    speed); **image** saves these numbers as a picture;
  - the speed of every round (hover a bar for its numbers), with a line for
    the average of the last 10 rounds and a dashed line for the goal (yours,
    or else the trainer's); in Learn the letter a round opened stands over
    its bar, because the speed drops when a new letter comes and climbs back;
  - for **Learn** only, three panels under the chart: **your letters,
    round by round**, a row per letter and a square per round, coloured as
    the letters row colours it (red far from mastered, green mastered), so
    you see when each letter opened and how long it took to turn green;
    **one letter** (click a letter of the grid; the weakest is shown first):
    its speed after every round against the dashed goal line, and its
    numbers now; and the **keys you mix up**: "r, you press t, 12 times",
    for every pair that happened at least three times (counted from
    2026-10-21 on: older rounds did not keep which key was pressed). The
    letters are worked out again from your saved rounds, so rounds dropped
    with Tab are not in the picture. Each round is judged at the goal of
    its own lap. Under the grid: the lap (after Learn complete) and the
    same forecast as on the Learn panel;
  - side by side (learning only): a **difficulty keyboard** (grey keys, from
    gold to red the harder the letter is for you, against your hardest
    letter; dashed = no data yet) and every letter as a small chip from
    weakest to strongest, with a bar on the same scale and a green tick
    when mastered.
  The exact numbers are in tooltips: hover, tap, or move to a key or chip
  with `Tab`.

## Languages and layouts

For now only English is offered. Polish, Ukrainian and Russian are in the data
and come back later; then a switch at the top chooses the language, and each
language keeps its own progress. Switch your **system** keyboard layout too
(Windows: Win + Space); the app shows a hint when the layout does not match.
Polish uses the standard "Polish (Programmers)" layout: ą, ę, ł... with AltGr.

## Where your progress is kept

- **Local server with a database** (`DATABASE_URL` set, see CONTRIBUTING.md): in
  PostgreSQL, for the guest and every account. Nothing is lost when the
  server stops.
- **Local server without a database** (`go run .` alone): in the server's
  memory. Stopping the server forgets everything (accounts too), so save a
  file first (settings, **export**) and import it back after the restart.
- **Website (GitHub Pages)**: in this browser (IndexedDB), saved after every
  round and when you switch to another tab. Closing the tab in the middle of a
  round can lose the part of that round you typed. Another browser, a private
  window or clearing the site data starts from zero; **export** and
  **import** move the progress there. Two open tabs each keep their own
  copy, and the one saved last wins.
