# Architecture

## Overview

```
 Browser (web/)                         Go server
 ┌───────────────────────┐   JSON    ┌─────────────────────────────────────────┐
 │ ES modules: app.js,   │ ───────▶  │ api        HTTP handlers, /api/v1/*      │
 │  typing.js (keydown,  │ ◀───────  │   │                                      │
 │  timing), keyboard... │           │   ├──▶ engine   model + word generator   │
 └───────────────────────┘           │   └──▶ storage  Store interface          │
                                     │              ├─ MemoryStore (default)    │
                                     │              └─ PostgresStore (DB URL)   │
                                     │ config  all numbers   layout  key data   │
                                     └─────────────────────────────────────────┘
```

**Dependency rule:** `api` uses `engine`, `freeplay` and `storage`. `storage` imports
`engine` only for the `KeyStat` type. `engine` imports nothing from the project.
The engine therefore never knows about HTTP or the database and can be tested on
its own.

## Packages and files

| Path | Responsibility |
|---|---|
| `setup.go` | Loads the embedded data files, creates the store, generator and API server (`newApp`). Shared by both entry points. |
| `main.go` | Entry point for the normal server: calls `newApp` and starts HTTP. |
| `main_wasm.go` | Entry point for the GitHub Pages build (see below). |
| `pages/wasm-shim.js` | Pages only: routes `/api/v1/` requests from the frontend to the Go code in the browser, and keeps the progress in IndexedDB (the `/export` JSON per language, loaded back with `/import`). |
| `.github/workflows/pages.yml` | On every push to `main`: test, build WebAssembly, publish to Pages. |
| `.github/workflows/tests.yml` | On every pull request: gofmt, vet, tests, WebAssembly build. |
| `build_server.go`, `build_wasm.go` | What differs between the normal server and GitHub Pages (picked by build tags): `accountsOn` (accounts only on the server) and `openStore` (PostgreSQL when `DATABASE_URL` is set, else memory; always memory on Pages). |
| `internal/config` | Every tunable number in one place. |
| `internal/auth` | Password hashing (PBKDF2-SHA256), random login tokens, the rules for account names and passwords. Knows nothing about HTTP or storage. |
| `internal/engine/model.go` | Per-letter statistics, EMA update, difficulty, mastery, softmax weight. |
| `internal/engine/generator.go` | Unlock order, first lesson size, unlocking rule, word selection. |
| `internal/engine/consistency.go` | Consistency of a round's speed (a measurement shown to the user; the model does not use it). |
| `internal/freeplay` | The modes outside learning. Climb, the second mode: the level thermostat (`NextLevel`) and the words at a level, with its capitals and punctuation (`Picker.Portion`); the typist's weak letter pairs from Climb's raw keys (`weak.go`, `WeakPairs`). Freetype, the third: words drawn evenly from the n most common (`Picker.Freetype`). Imports nothing from the project; never touches the letter model. (The package keeps the second mode's first name, free practice.) |
| `internal/storage/store.go` | The `Store` interface. |
| `internal/storage/memory.go` | In-memory `Store` (lost on restart). |
| `internal/storage/postgres.go` | PostgreSQL `Store` through the standard `database/sql`; the pgx driver is only registered. Applies `migrations/*.sql` at start. Not in the WebAssembly build. |
| `internal/storage/migrations/` | The database tables, one numbered SQL file per change (`001_init.sql` ... `005_letter_held.sql` (a letter's mastery is remembered), `006_round_level.sql` (Climb's level per round), `007_freetype_modes.sql` (a history per Freetype list)). |
| `internal/storage/store_test.go` | The tests every `Store` must pass; run on memory always and on PostgreSQL when `TT_TEST_DATABASE_URL` is set (`postgres_test.go`). |
| `internal/api/handlers.go` | The `Server`, the route list (`Register`), `?lang=`, JSON helpers, locking around read-modify-write. |
| `internal/api/learning.go` | Learning routes: `/portion`, `/results`, `/stats`, `/activity`, `/progress`. |
| `internal/api/data.go` | `/reset`, `/export`, `/import` (learning, Climb and Freetype data together). |
| `internal/api/validate.go` | Request checks, so nothing impossible or foreign reaches the statistics. |
| `internal/api/freeplay.go` | The `/api/v1/freeplay/*` routes: Climb's portions (with the thermostat), results and stats. |
| `internal/api/freetype.go` | The `/api/v1/freetype/*` routes: Freetype's portions, results and stats per word list. |
| `internal/api/auth.go` | The `/api/v1/auth/*` routes (sign up, log in, log out, who am I) and `userOf`: which user a request belongs to. |
| `internal/layout` | Parses and validates the keyboard layout JSON; `RestingKeys` (the home row keys under the fingers, first in the learning order). |
| `internal/language` | Parses `languages.json`; `Allows(word)` checks a word against the alphabet. |
| `data/languages.json` | The languages: id, name, label, layout, alphabet, OS layout name. |
| `data/layouts/*.json` | Keys, rows, finger per key, AltGr letters, finger colors. |
| `data/langs/<id>/words.txt` | Word list per language, most frequent first (learning; Climb and Freetype too in a language without `free.txt`). |
| `data/langs/<id>/free.txt` | The long list of Climb and Freetype (English only for now: 25 000 words, `tools/wordlists/free.py`). |
| `internal/sim` | Simulation for the evaluation chapter: a made-up typist and three word-choice strategies (docs/ALGORITHM.md, section 11.1). Not used by the app. |
| `tools/sim/` | `go run ./tools/sim`: runs the simulation on the real word lists and prints the table. |
| `tools/wordlists/` | Python script + block lists that build the word lists (not part of the app). |
| `web/` | Static frontend: `index.html`, `style.css` and the JavaScript modules (see "Frontend modules" below). The interface language always follows the practice language. |
| `webmodules_test.go` | Checks the import rule of the frontend modules. |

The `web/` and `data/` folders are embedded into the binary (`//go:embed`), so
the program runs the same from any folder.

## Frontend modules

The frontend is plain JavaScript split into native ES modules (`import` /
`export`). Browsers load them directly: no npm, no bundler, no build step.
`index.html` loads only `app.js`; each module loads the modules it needs.

| Layer | File | Responsibility |
|---|---|---|
| bottom | `state.js` | Shared state `S`, page elements `el`, `store` (localStorage that may be blocked), small helpers. |
| bottom | `i18n.js` | Every interface text in all four languages, `t()`, `applyI18n()`, `setUiLang()`. |
| bottom | `fx.js` | Visual rewards: confetti, bumps, the message queue on the top line of the text block (outside typing), the start screen. They never affect what is measured. |
| bottom | `feel.js` | `FEEL`: every knob of how a keypress feels (caret glide, the kick and trail of the caret on a right key, the dip of the lit key, red tint of a wrong key, caret flinch, shake and breath, hands over the keyboard, mistake marks), also given to the CSS as `--feel-*` (`applyFeel()` at load). Tuning the feel = changing a number here. |
| bottom | `api.js` | `getJSON` / `postJSON` for `/api/v1/`, with `?lang=` added. |
| middle | `tools.js` | Tooltips, and the data buttons of the settings window: export / import, reset (with its confirm window). |
| middle | `keyboard.js` | On-screen keyboard and hands from the layout data, the next key and finger, the on / off button (remembered separately for learning and for Climb and Freetype), the automatic size that fits the window. |
| middle | `stats.js` | The stats screen, Climb's and Freetype's (learning has none: its progress is the letters row): the switch of the mode and Freetype's list on top, the personal bests, all time with the activity calendar from `/activity`, tiles with the level, trends and the personal goal, the WPM chart with the 10-round average; and `refreshStats()` (the letters of learning, `S.lastStats`). |
| middle | `share.js` | The "image" button of the stats screen: a PNG card drawn on a canvas from what the screen shows. |
| middle | `typing.js` | The text stream (portions added while you type), the caret, `handleChar()` / `backspace()`, the streak (Freetype only), live WPM / accuracy, the "typing now" header mode, sending results. |
| middle | `letters.js` | The letters bar above the text: learning's progress (each open letter with a bar of how close it is to mastered and a tooltip of what it still needs, `letterProgress`, `letterNeeds`), its status line (Climb: the level and what it brings; Climb and Freetype keep the row empty, at its height, so every mode has the same layout), locked keys dimmed and mastered letters fading from their keys on the keyboard. |
| middle | `intro.js` | The intro, "touch typing basics" (what it is, home row, space, eyes up); opens by itself on the first visit only; ← → / A D to go back and on. |
| middle | `languages.js` | The language switch and `loadLanguage()`. |
| middle | `profile.js` | The account in the top right corner ("log in" for a guest where accounts work): the account (log in / sign up / log out; the page reloads after each), and a picture kept only in the browser. |
| middle | `result.js` | The result screen in the text window: `showResult(r)` shows the full result of Climb (with the level and its move) and Freetype (with its word list); `showLearnResult(r)` learning's short one (a card: the keys opened and mastered, speed and accuracy against the recent average, a bar per letter into the next letter's key; tooltips explain each part) and resolves when the user goes on; `compareStats()` works out what a learning round changed. The words of the round with their own speed come from `typedWords()` in `typing.js`, the characters and the time from `roundFacts()`. |
| middle | `modes.js` | The three modes (learn / climb / freetype), the navigation tabs that show them (`renderNav`: learn · climb · freetype · stats), `refreshFreeplay()` (`S.climb`: Climb's history and level; `S.freetype`: the chosen list's history and the lists offered), `setFreetypeList()`, the mode and the list remembered per language. |
| middle | `ambient.js` | The quiet background: things falling slowly in the empty fields left and right, and the screen saver after a minute with no key and no mouse. Decoration only. What falls is a setting (`S.settings.bg`, `tt.bg`): keycaps with the open letters (default), the letters alone, short words of the text, or nothing. They keep moving while you type: one `element.animate` per keycap with plain numbers (no CSS variables in keyframes) on a bare wrapper, the look on the element inside. Measured 2026-10-20 (headless Chromium, 170 wpm, keyboard and hands on): about 1 ms more main-thread work per key than holding them still (16.5-17.9 vs 15.9-16.5 ms), the typed letter shows just as fast (median 32 ms); the old version (look and CSS variables on the moving element) cost about 2.5 ms. |
| middle | `settings.js` | The settings window (Esc or the gear), what holds for the whole app: live numbers, the streak (Freetype only, off by default, `tt.streak.free`), the background (`onBgChange`, carried out by `input.js`), caret, theme, keyboard on / off (carried out by `input.js`), the speed goal, export / import / reset (wired by `tools.js`); drawn from one list of rows (`ROWS`) with search and arrow keys; kept in `localStorage` (`S.settings`). Also the round lengths and each mode's own (`lengthFor`, `setLength`, `tt.length.<mode>`). |
| middle | `modebar.js` | The round bar above the text: the current mode's round length (Learn short / normal; Climb and Freetype words or time) and Freetype's word list; a click starts a new round (`onBarPick`, handled in `input.js`). |
| top | `input.js` | Keydown and phone input (with the one-space sentinel that makes Backspace work on phone keyboards), the navigation (learn · climb · stats), keyboard on / off (settings and Alt+K), window resize: sends each action to the module that handles it. |
| top | `app.js` | Entry point: `init()`. |

**Import rule:** imports only go down. `state.js` and `i18n.js` import
nothing, `fx.js` only `i18n.js`, `api.js` only `state.js`. Middle modules import
the bottom layer and each other in one direction only. Nothing imports the top
layer (`app.js` loads `input.js`). There are no import cycles, so every module
can be read and explained starting from the modules it uses.
`webmodules_test.go` checks this on every `go test ./...`.

A module can change a field of an object it imports, but it cannot assign to an
imported variable. That is why the state that several modules share lives in
one object, `S` (`S.pos`, `S.lang`, ...), while state used by only one module
stays a plain variable inside it.

`file-check.js` is a small plain script, not a module: browsers do not load
ES modules from a `file://` address, so when `index.html` is opened by
double-click it is the only script that runs and it says how to open the page.
Its one sentence is the only interface text outside `i18n.js`.

### Screen layout

Three fixed places, the same in every view (`index.html`, `style.css`):

- **header**: the logo, the language switch and the account (`profile.js`);
- **navigation** (`nav.rail`, wired in `input.js`): the three screens
  learn, climb, freetype and stats (Climb's and Freetype's), then the
  settings. A column at the left edge of a wide
  window (`--side` keeps the text and keyboard clear of it), a bar at the
  bottom below 1000 px;
- **languages**: a column at the right edge of a wide window, in the header
  of a narrow one (the same element, moved by CSS). Hidden while only one
  language is offered (`"hidden": true` in `data/languages.json`).

On the typing screen the text block holds, top to bottom, one line with the
live numbers and the status line (focus, next letter), with the
warnings and messages shown on top of it, and then the text; the
letters bar sits above it, the hands and the keyboard (on a panel as wide as
the text) below.

Colours are CSS variables on `:root`; the light theme redefines them under
`:root[data-theme="light"]` (set by `settings.js`, and by a one-line script
in `<head>` so a light page never flashes dark).

## Request lifecycle: from a keypress to the next words

The text is a stream of short portions (`Generator.Portion`, see
`docs/ALGORITHM.md`, section 7), not one exercise built in advance. A round
is `RoundPortions` portions (30 words).

1. Start of a round (`loadExercise()` in `typing.js`) → `POST /api/v1/portion {start: true}`
   returns the portion to type plus `AheadPortions` waiting after it, and
   `round` (portions per round).
2. `keydown` (`input.js`) → `handleChar()` in `typing.js` compares the key with the expected
   character and moves on either way (wrong = red). Each typed position keeps
   one sample `{char, errors, ms}`; `backspace()` changes only the screen, never
   the samples. Rules: `docs/ALGORITHM.md`, section 3.
3. The space after the last word of a portion → `POST /api/v1/portion` with the
   portion's samples, the words of the stream so far (`recent`) and the words
   typed with a mistake (`retry`). The handler (under a mutex) reads the stats
   from the `Store`, calls `engine.Apply`, saves them, asks
   `Generator.NextUnlocked` whether a letter opens, and answers with ONE new
   portion built from the updated statistics. The browser adds it at the end of
   the text. Once the round has all its portions the browser sends
   `last: true` and gets none. Backspace can go back one word, also into a
   portion that was sent; those new presses are only shown, not sent again.

   **Rendering: one word at a time.** Portions arrive whole, but the browser
   shows only the words up to `SHOWN_AHEAD = 12` (two portions) after the
   current one; every finished word reveals exactly one more, with a short
   fade (`typing.js` `reveal()`, CSS `.later` / `.new`). A hidden word is
   `visibility: hidden`, so it already has its place in the line: nothing
   visible moves when it appears. Two portions are always waiting, so the
   next word to show is always already there.
4. The last letter of the last word of the round (no space needed after it;
   right or wrong), or Esc, or 10 s without a key →
   `POST /api/v1/results` with the samples not sent yet, every keypress of
   the round (`keys`), WPM, accuracy, the number of typed characters and the
   keypresses per second; the handler learns from the samples the same way
   (never from `keys`, so nothing is counted twice), computes the consistency
   (`engine.Consistency`) and stores the round: its numbers plus its raw
   keys (see "Raw round records" below). Then the next round starts (step 1).
5. After each portion and each round the browser calls `GET /api/v1/stats`
   (letter chips, heatmap, history).

## API

All responses are JSON. Every route except `/languages` and `/auth/*` takes `?lang=<id>`
(`en`, `pl`, `uk`, `ru`; default `en`). An unknown id is a 400 error.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/v1/languages` | | `[{id, name, label, layout, alphabet, systemLayout}]` |
| POST | `/api/v1/auth/register` | `{name, password}` | `{name}` and a login cookie; 400 if a rule is broken, 409 if the name is taken, 429 after too many attempts (Retry-After), 404 where accounts are off |
| POST | `/api/v1/auth/login` | `{name, password}` | `{name}` and a login cookie; 401 for a wrong name or password (one answer for both), 429 after too many attempts |
| POST | `/api/v1/auth/logout` | | `{ok: true}`; ends this login and deletes the cookie |
| GET | `/api/v1/auth/me` | | `{accounts, name}`; `name` is null for a guest, `accounts` false where they cannot work (GitHub Pages) |
| GET | `/api/v1/layout` | | layout JSON |
| POST | `/api/v1/portion` | `{samples: [{char, errors, ms}], recent: [words], retry: [words], start: bool, last: bool}` | `{portions: [{words, focus, weakest, unlocked, locked}], newLetter, round}`; one portion, `AheadPortions + 1` with `start`, none with `last` |
| POST | `/api/v1/results` | `{samples: [{char, errors, ms}], keys: [the same shape, the whole round], chars, wpm, accuracy, perSecond: [keypresses in each full second], length}` | `{unlocked, newLetter, consistency}` (`consistency` 0–100, `null` for a round under `ConsistencyMinSeconds`); the round is over: one history entry |
| POST | `/api/v1/progress` | `{unlockAll: true\|false}` | `{unlocked}`; for development only, the interface no longer calls it |
| POST | `/api/v1/group` | `{group: "random"\|""}` | `{group}`; the study group of the language (hidden: only the study link `?group=random` / `?group=adaptive` calls it, `web/app.js`). `/stats` returns `group`, every learning round stores it |
| POST | `/api/v1/reset` | | `{ok: true}`; deletes all data of the language (reset button, until there are user accounts) |
| GET | `/api/v1/export` | | `{unlocked, keys: {char: {count, mistakes, errEma, timeEma, timedCount, held}}, sessions: [all, OLDEST first, each with its raw keys], freeplay: {sessions (each with its level)}, freetype: {"1000": {sessions}, ...}}`; everything stored for the language (`freeplay` and `freetype` are missing in older files) |
| POST | `/api/v1/import` | the same JSON as `/export` | `{unlocked, sessions}`; REPLACES the language's data, or changes nothing if the data is invalid |
| GET | `/api/v1/stats?length=` | | `{keys: [{char, count, errorRate, avgMs, difficulty, mastered, unlocked}], sessions: [last 50 of that length, newest first, without raw keys], sessionCount (of that length), lengths: [every length in the history], bests: {length: the fastest round of it}, targetWpm, masteryMin, masteryErr (the mastery rule: at least masteryMin presses, under masteryErr % mistakes, for the texts)}`; no `length` = every length |
| GET | `/api/v1/activity?tz=` | | `{days: [{date, rounds, seconds, chars}]}`: every day with a finished round, every mode together, oldest first; `tz` = the browser's minutes from UTC (east positive), so days end at the user's midnight. `seconds` = right letters / 5 / WPM (`storage.RoundSeconds`). The stats screen builds the total time typing, the days in a row and the activity calendar from it |
| POST | `/api/v1/freeplay/portion` | `{recent: [words as typed], start: bool, level, accuracy, wpm, pace, last, words}` | `{portions: [{words}], round, level}`; Climb: a new round starts at the user's level (the last round's, else `LevelStart`); later calls move the level by how the portion just typed went (`freeplay.NextLevel`: its accuracy and speed, the pace of the round) and build the next words at it. Every portion is sent: `last` = the round has all its words (only the level moves, no words come back); `words` = the size of a shorter, final portion (under `PartialMin` it does not move the level) |
| POST | `/api/v1/freeplay/results` | `{chars, wpm, accuracy, perSecond, keys, length, level}` | `{consistency, weak: [{pair, cost, count}]}`; one entry in Climb's history with the level it ended at; its keys may be capitals and `,` `.` |
| GET | `/api/v1/freeplay/stats?length=` | | `{level, sessions: [last 50 of that length, newest first, without raw keys, each with its level], sessionCount, lengths, bests (as in `/stats`), capsFrom, punctFrom}` |
| POST | `/api/v1/freetype/portion` | `{recent: [words], start: bool, list}` | `{portions: [{words}], round}`; Freetype: words drawn evenly from the `list` most common ones (`freeplay.Picker.Freetype`); a list not offered is a 400 |
| POST | `/api/v1/freetype/results` | `{chars, wpm, accuracy, perSecond, keys, length, list}` | `{consistency}`; one entry in the history of that list (`storage.FreetypeMode`) |
| GET | `/api/v1/freetype/stats?list=&length=` | | `{lists (offered: those of `FreetypeLists` the language's long list has words for), list (no `list` = the first), sessions, sessionCount, lengths, bests}` of that list, as in `/freeplay/stats` without the level |

Validation on `/portion` and `/results`: at most 5000 samples (zero is fine:
nothing new to learn), each with exactly one character that is a letter of the
language or a space, `errors >= 0`, `ms >= 0`; `keys` follows the same rules. `/results` also needs
`chars >= 1` (something was typed; 0 means "the number of samples"), WPM 0–400,
accuracy 0–100, and `perSecond` with at most 5000 entries, each between 0 and 5000. `recent` and `retry` hold at most 5000 words; a word that
is not in the list or has a locked letter is simply ignored. Body limit 1 MB.

**Round length** (`length` on `/results`, `/freeplay/results` and
`/freetype/results`, and
`?length=` on the stats routes): `words-N` or `time-N`, the length chosen in
the round bar of its mode (`web/modebar.js`, `web/settings.js`). Missing = `words-30`, the only length
before the settings existed (`storage.DefaultLength`); every stored round
has one. N is at most `MaxRoundWords` words or `MaxRoundSeconds` seconds
(`config.go`); anything else is a 400. The stats routes show one length at
a time, so a record or an average never mixes a 10-word round with a
60-second one. The letter model does not care about the length: it learns
from every keypress.

Validation on `/import`: `unlocked` between 0 and the number of letters; every key is
one letter of the language or a space; per letter `0 <= mistakes <= count`,
`0 <= timedCount <= count`, `0 <= errEma <= 1`, `timeEma >= 0`; per session WPM
0–400, accuracy 0–100, `chars >= 0`, consistency 0–100 or missing (older files have none). Limits (`MaxImportBytes`,
`MaxImportSessions`) are in `internal/config/config.go`. The browser joins the
languages into one file `{app, version, exportedAt, languages: {id: <export>}}`
(see `web/tools.js`, "export / import"). Import and export use only the existing
`Store` methods, so the PostgreSQL store needs nothing extra.

### Raw round records

Each history entry (`storage.Session`) keeps the round's numbers (WPM,
accuracy, characters, consistency, letters open after it) and its raw
record `keys`: every typed position of the round in order, with its
mistakes and its time, exactly as the browser measured it (a skipped letter
has no entry). Climb and Freetype rounds keep their keys too; they are never
learned from. The letter model can be rebuilt from the keys by running
`engine.Apply` over them round by round, so other parameter values can be
tried on real data (ALGORITHM.md, section 11). A round with its keys is
5-7 KB of JSON; `MaxImportBytes` allows about 10 000 rounds in one import.
History from before this has no keys (the field is missing). `device`
says what the round was typed on (`keyboard` or `touch`; missing in older
history); it is recorded only, the model does not use it (ALGORITHM.md,
section 9). `/stats` and
`/freeplay/stats` and `/freetype/stats` drop the keys (`Session.Summary`), `/export` has them.

Every `Store` method takes the user id and the language id, so each user
has their own statistics, unlocked letters and history in each language.
`userOf` (`internal/api/auth.go`) decides the user of every request: the
owner of a valid login cookie, or else this browser's guest (see "Guests"
below).

## Accounts

Standard library only. A user signs up or logs in with a name and a
password; the answer sets a login cookie, and from then on every request of
that browser works with that user's data.

- **Names**: 3..20 characters of `a-z`, `0-9`, `_`, `-`, stored in lower
  case (`auth.NormalizeName`, `auth.ValidName`). Latin only, so look-alike
  letters from other alphabets cannot make two accounts that look the same.
- **Passwords**: 8..128 characters (NIST SP 800-63B). Only a hash is stored:
  `pbkdf2-sha256$<iterations>$<salt>$<key>` (`auth.HashPassword`), 600 000
  rounds of PBKDF2-SHA256 (OWASP, 2023) with a random 16-byte salt. One check
  takes about 0.3 s: nothing for a login, very slow for guessing millions of
  passwords from a stolen database. The comparison is constant-time.
- **Login cookie** `tt_login`: a random 256-bit token (`auth.NewToken`).
  The store keeps only its SHA-256 (`AddLogin`, `LoginUser`), so the stored
  data cannot be used to log in. The cookie is `HttpOnly` (page scripts
  cannot read it), `SameSite=Lax` (other sites cannot send requests with it),
  `Secure` over HTTPS, and lasts 30 days (`Auth.LoginDays`). Logging out
  deletes that login on the server.
- **Wrong name or wrong password** get the same 401 answer, and an unknown
  name is still checked against a dummy hash, so neither the answer nor its
  time tells which names exist.
- **A new account starts empty.** The guest's progress stays with the guest;
  to move it, export it as a guest and import it after logging in.
- **Guests**: every browser without a login is its own guest. `WithGuest`
  (`internal/api/auth.go`) wraps the whole site: a request without the
  cookie `tt_guest` gets a new random token in it (same kind as a login
  token, `HttpOnly`, `SameSite=Lax`, a year: `Auth.GuestDays`). The page
  itself (`index.html`) is the first request, so the cookie is there before
  the scripts' API calls. The guest's user id is `g` + the SHA-256 of the
  token (`storage.GuestPrefix`), so the database never holds the cookie that
  opens a guest's data. A browser that refuses cookies falls back to the one
  shared `storage.LocalUser` ("local"). Clearing cookies starts a new guest:
  the old guest's data stays in the store, unreachable (not cleaned up yet).
- **Limit on attempts** (`auth.Limiter`): per IP address, at most
  `Auth.Attempts` (10) failed logins plus sign-ups in `Auth.AttemptWindow`
  (15) minutes; then `429 Too Many Requests` with `Retry-After`, even for the
  right password, until the window ends. Every sign-up counts (each costs a
  slow hash); a successful login clears the count. The counts live in memory,
  so a restart forgets them, and several server processes would each count
  on their own. No background goroutine: old windows are dropped while
  counting.
- **Behind a proxy**: on a real server a reverse proxy (nginx, Caddy) ends
  HTTPS and passes requests to this server over plain HTTP. Start it with
  the environment variable `BEHIND_PROXY=1` there (`config.BehindProxy`):
  cookies are then `Secure` when the proxy's `X-Forwarded-Proto` is `https`,
  and the limit counts the last address in `X-Forwarded-For` (the one the
  proxy added; earlier ones come from the client). Without the variable both
  headers are ignored, because without a proxy anyone could write them.
- All numbers are in `internal/config/config.go` (`Auth`).

On GitHub Pages accounts are off (`build_wasm.go`): requests never leave
the page there, so there are no cookies, and the only guest is `local`. Each language also has its own
`Generator` (own unlock order and first lesson), built in `setup.go`.

## Modes

Three modes, all open to everyone (`web/modes.js`; owner, 2026-10-19). They
share no data: Climb and Freetype have their own routes and histories
(the `AddFreeplaySession` family of the store, with a mode: `ModeClimb`, or
`FreetypeMode(n)` for each Freetype list).

- **Learn**, for beginners, is the adaptive trainer described in
  docs/ALGORITHM.md: the `/portion` and `/results` routes, the letter model,
  unlocking from the home row. It has no stats screen: its progress is the
  letters row (a bar per letter, tooltips with what each still needs, the
  mastered letters fading from the keyboard) and a short result (what the
  round achieved, what comes next).
- **Climb**, for people who can already type (`internal/freeplay`,
  docs/ALGORITHM.md section 13): one level, 1 to 100, follows the typist
  like a thermostat; each portion request carries how the last portion went,
  and the answer is the next words at the new level (rarer words, then
  capitals, then punctuation). Its history (`AddFreeplaySession`) keeps the
  level of every round; the next round starts from the last one. The stats
  screen is Climb's and Freetype's. Nothing it sends reaches the letter
  model: `/freeplay/results` drops any samples.
- **Freetype**, for just typing (`internal/freeplay`, docs/ALGORITHM.md
  section 14): words drawn evenly from the n most common of the long list
  (`free.txt`), n picked in the row above the text (200 to 25 000;
  remembered per language in `tt.list.<lang>`). Nothing adapts; every list
  has its own history and bests. `/freetype/results` drops any samples too.

There used to be a third thing, a typing test that opened free practice
early; it is gone (owner, 2026-10-19), and its column `progress.test_passed`
stays in the database unread (old migrations are never changed). The chosen
mode is interface state: it lives in the browser (`localStorage`,
`tt.mode.<lang>`), not on the server. Reset clears Climb's and Freetype's
histories (and so Climb's level); export / import carry them.

## Concurrency

The random generators are not safe for parallel use, so `Portion` (learning and Climb) and `Freetype` run under
`genMu`. "Read stats → update → save" must not interleave between two
requests, so it runs under `writeMu`. That is enough while one server
process serves everyone, with either store. Several server processes on one
database would need a transaction around it instead (`SELECT ... FOR UPDATE`).

## PostgreSQL

`go run .` uses the memory store. With the environment variable
`DATABASE_URL` set (for example
`postgres://user:password@localhost:5432/typetrainer`), `openStore` in
`build_server.go` opens `storage.PostgresStore` instead, and the log says
`storage: PostgreSQL`. The address is not in the code, so no password ends up
in git. How to install PostgreSQL on Windows: USER-GUIDE.md.

- **One third-party module.** The code uses only the standard `database/sql`
  package; `github.com/jackc/pgx/v5/stdlib` is imported only to register the
  driver that speaks PostgreSQL's protocol (the standard library has none).
  Another driver would be a one-line change. pgx needs Go 1.25, so `go.mod`
  says 1.25 (1.24 is no longer supported by the Go team either). The
  WebAssembly build does not include it (`postgres.go` has a build tag).
- **Tables** (`internal/storage/migrations/001_init.sql`): `users`, `logins`
  (token hashes), `progress` (unlocked letters, study group; the typing
  test's flag, no longer used),
  `key_stats`
  (the letter model) and `sessions` (the history of every mode, `mode`
  column: `learning`, `freeplay` for Climb, `freetype-<n>` for each
  Freetype list; the raw keys as `JSONB`). Every data table is keyed by user and
  language. `user_id` is text and not a foreign key, because guests
  (`g...`, `local`) have data but no row in `users`; an account's id is
  `u` + `users.id`.
- **Migrations**: at start `migrate` applies every file in `migrations/`
  that the table `schema_migrations` has not recorded yet, in number order,
  each in a transaction. A new version of the app updates an old database by
  itself; a change to the tables is a new file (`002_...sql`), never an edit
  of an old one.
- **Transactions**: `SaveKeyStats` (delete + insert the letters) and `Reset`
  (three tables) are all-or-nothing.
- **Tests**: the same tests run on both stores (`store_test.go`). The
  PostgreSQL run needs `TT_TEST_DATABASE_URL` (it empties the tables, so use a
  separate database); the pull request checks start a PostgreSQL 16 for it.
  The app tests (`setup_test.go`) always use memory.

## Two ways to run: server and GitHub Pages

The same code runs in two places. Go build tags pick the entry point:

| | Normal server | GitHub Pages |
|---|---|---|
| Entry point | `main.go` (`//go:build !(js && wasm)`) | `main_wasm.go` (`//go:build js && wasm`) |
| Build | `go run .` | `GOOS=js GOARCH=wasm go build -o app.wasm .` |
| Where Go runs | on your computer | in the visitor's browser (WebAssembly) |
| How the frontend reaches the API | HTTP to `localhost` | `pages/wasm-shim.js` replaces `fetch` for `/api/v1/` and calls `goApi(method, path, body)` |
| Statistics | until the server stops (in memory) or for good (PostgreSQL) | in the page's memory, copied to the browser's IndexedDB after every round and loaded back on the next visit (`pages/wasm-shim.js`) |
| Accounts | yes | no (no cookies inside the page; `/auth/me` says `accounts: false`) |

`main_wasm.go` does not listen on a port. It builds the same handler with
`newApp()` and gives JavaScript one function, `goApi`, which runs a request
through that handler (`httptest.NewRequest` / `NewRecorder` serve as an
in-memory request and response). Engine, store, validation and JSON are
therefore identical in both versions; only the transport differs.

The workflow builds the site by copying `web/`, adding `app.wasm`,
`wasm_exec.js` (the Go runtime for browsers, shipped with Go) and the shim,
and inserting two `<script>` tags before `app.js` in `index.html`. The
server version never loads them. Every file is linked with `?v=<commit>`
(`app.wasm` too, through the shim, and every `import "./x.js"` inside the
modules), because GitHub Pages lets browsers cache files for 10 minutes:
without it, a visitor right after a deploy could get the new page with an old
module or an old `app.wasm`.

## Adding a layout or language

- New layout: a new JSON file in `data/layouts/` (keys, finger per key, optional
  `alt` letter typed with AltGr, one key with `"modifier": true` for AltGr).
- New language: an entry in `data/languages.json` + a layout + a word list in
  `data/langs/<id>/words.txt` (most frequent first). The unlock order and the
  first lesson are computed from the list automatically; no code changes.
