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
| `pages/wasm-shim.js` | Pages only: routes `/api/v1/` requests from the frontend to the Go code in the browser. |
| `.github/workflows/pages.yml` | On every push to `main`: test, build WebAssembly, publish to Pages. |
| `.github/workflows/tests.yml` | On every pull request: gofmt, vet, tests, WebAssembly build. |
| `build_server.go`, `build_wasm.go` | What differs between the normal server and GitHub Pages (picked by build tags): `accountsOn` (accounts only on the server) and `openStore` (PostgreSQL when `DATABASE_URL` is set, else memory; always memory on Pages). |
| `internal/config` | Every tunable number in one place. |
| `internal/auth` | Password hashing (PBKDF2-SHA256), random login tokens, the rules for account names and passwords. Knows nothing about HTTP or storage. |
| `internal/engine/model.go` | Per-letter statistics, EMA update, difficulty, mastery, softmax weight. |
| `internal/engine/generator.go` | Unlock order, first lesson size, unlocking rule, word selection. |
| `internal/engine/consistency.go` | Consistency of a round's speed (a measurement shown to the user; the model does not use it). |
| `internal/freeplay` | Free practice and the typing test: evenly drawn words from the whole list (`Picker.Portion`), the pass rule of the test (`Passed`). Imports nothing from the project; never touches the letter model. |
| `internal/storage/store.go` | The `Store` interface. |
| `internal/storage/memory.go` | In-memory `Store` (lost on restart). |
| `internal/storage/postgres.go` | PostgreSQL `Store` through the standard `database/sql`; the pgx driver is only registered. Applies `migrations/*.sql` at start. Not in the WebAssembly build. |
| `internal/storage/migrations/` | The database tables, one numbered SQL file per change (`001_init.sql`, `002_session_length.sql`). |
| `internal/storage/store_test.go` | The tests every `Store` must pass; run on memory always and on PostgreSQL when `TT_TEST_DATABASE_URL` is set (`postgres_test.go`). |
| `internal/api/handlers.go` | The `Server`, the route list (`Register`), `?lang=`, JSON helpers, locking around read-modify-write. |
| `internal/api/learning.go` | Learning routes: `/portion`, `/results`, `/stats`, `/progress`. |
| `internal/api/data.go` | `/reset`, `/export`, `/import` (learning and free practice data together). |
| `internal/api/validate.go` | Request checks, so nothing impossible or foreign reaches the statistics. |
| `internal/api/freeplay.go` | The `/api/v1/freeplay/*` routes. |
| `internal/api/auth.go` | The `/api/v1/auth/*` routes (sign up, log in, log out, who am I) and `userOf`: which user a request belongs to. |
| `internal/layout` | Parses and validates the keyboard layout JSON. |
| `internal/language` | Parses `languages.json`; `Allows(word)` checks a word against the alphabet. |
| `data/languages.json` | The languages: id, name, label, layout, alphabet, OS layout name. |
| `data/layouts/*.json` | Keys, rows, finger per key, AltGr letters, finger colors. |
| `data/langs/<id>/words.txt` | Word list per language, most frequent first. |
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
| bottom | `i18n.js` | Every interface text in all four languages, `t()`, `tPick()` (a random text from a pool), `applyI18n()`, `setUiLang()`. |
| bottom | `fx.js` | Visual rewards: confetti, bumps, the message queue in the status line (outside typing), the start screen. They never affect what is measured. |
| bottom | `feel.js` | `FEEL`: every knob of how a keypress feels (letter settle, key dip, red tint of a wrong key, caret flinch, mistake marks), also given to the CSS as `--feel-*`. Tuning the feel = changing a number here. |
| bottom | `api.js` | `getJSON` / `postJSON` for `/api/v1/`, with `?lang=` added. |
| middle | `tools.js` | Tooltips of the icon buttons, reset, export / import of the statistics. |
| middle | `keyboard.js` | On-screen keyboard and hands from the layout data, the next key and finger, the on / off button (remembered separately for learning and free practice), the automatic size that fits the window. |
| middle | `stats.js` | The stats screen (tiles, WPM chart, heatmap keyboard, letter cards) and `refreshStats()`. |
| middle | `typing.js` | The text stream (portions added while you type), the caret, `handleChar()` / `backspace()`, the streak, live WPM / accuracy, the "typing now" header mode, sending results. |
| middle | `letters.js` | The letters bar above the text, its status line, locked keys dimmed on the keyboard. |
| middle | `intro.js` | The first-visit intro (home row, space, eyes up). |
| middle | `languages.js` | The language switch and `loadLanguage()`. |
| middle | `profile.js` | The profile in the header: the account (log in / sign up / log out; the page reloads after each), and a picture kept only in the browser. |
| middle | `result.js` | The result screen in the text window: `showResult(r)` shows what changed and resolves when the user goes on; `compareStats()` works out what a learning round changed. |
| middle | `modes.js` | The modes (learning / free practice / typing test), the switch in the header, `refreshFreeplay()` (`S.free`), the mode remembered per language. |
| middle | `settings.js` | The settings panel (gear in the bottom bar): round length, live numbers, caret; kept in `localStorage` (`S.settings`). |
| middle | `tour.js` | The "how this site works" tour: a ring around each part of the page and a short card. |
| top | `input.js` | Keydown and phone input, the Type / Stats switch, the mode switch, the keyboard on / off button, window resize: sends each action to the module that handles it. |
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
| GET | `/api/v1/export` | | `{unlocked, keys: {char: {count, mistakes, errEma, timeEma, timedCount}}, sessions: [all, OLDEST first, each with its raw keys], freeplay: {testPassed, sessions}}`; everything stored for the language (`freeplay` is missing in older files) |
| POST | `/api/v1/import` | the same JSON as `/export` | `{unlocked, sessions}`; REPLACES the language's data, or changes nothing if the data is invalid |
| GET | `/api/v1/stats?length=` | | `{keys: [{char, count, errorRate, avgMs, difficulty, mastered, unlocked}], sessions: [last 50 of that length, newest first, without raw keys], sessionCount (of that length), lengths: [every length in the history], targetWpm}`; no `length` = every length |
| POST | `/api/v1/freeplay/portion` | `{recent: [words], start: bool}` | `{portions: [{words}], round}`; words drawn evenly from the whole list; works while free practice is locked (the test uses it) |
| POST | `/api/v1/freeplay/results` | `{chars, wpm, accuracy, perSecond, keys, length}` | `{consistency}`; one entry in the free practice history; 403 while locked |
| POST | `/api/v1/freeplay/test` | `{chars, wpm, accuracy}` | `{passed, unlocked}`; a pass opens free practice for good; stored in no history |
| GET | `/api/v1/freeplay/stats?length=` | | `{unlocked, testPassed, sessions: [last 50 of that length, newest first, without raw keys], sessionCount, lengths, testWpm, testAccuracy}` |

Validation on `/portion` and `/results`: at most 5000 samples (zero is fine:
nothing new to learn), each with exactly one character that is a letter of the
language or a space, `errors >= 0`, `ms >= 0`; `keys` follows the same rules. `/results` also needs
`chars >= 1` (something was typed; 0 means "the number of samples"), WPM 0–400,
accuracy 0–100, and `perSecond` with at most 5000 entries, each between 0 and 5000. `recent` and `retry` hold at most 5000 words; a word that
is not in the list or has a locked letter is simply ignored. Body limit 1 MB.

**Round length** (`length` on `/results` and `/freeplay/results`, and
`?length=` on the stats routes): `words-N` or `time-N`, the length chosen in
the settings (`web/settings.js`). Missing = `words-30`, the only length
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
has no entry). Free practice rounds keep their keys too; they are never
learned from. The letter model can be rebuilt from the keys by running
`engine.Apply` over them round by round, so other parameter values can be
tried on real data (ALGORITHM.md, section 11). A round with its keys is
5-7 KB of JSON; `MaxImportBytes` allows about 10 000 rounds in one import.
History from before this has no keys (the field is missing). `/stats` and
`/freeplay/stats` drop the keys (`Session.Summary`), `/export` has them.

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

The app has two modes and a test (`web/modes.js`, `internal/freeplay`).
Learning is the main mode and the subject of the thesis. Free practice is
kept minimal for now and is meant to grow later into a Monkeytype-like mode;
the typing test is provisional. The two modes share no data: free practice
has its own storage methods, routes and history.

- **Learning** is the adaptive trainer described in docs/ALGORITHM.md: the
  `/portion` and `/results` routes, the letter model, unlocking.
- **Free practice** draws words evenly from the whole word list (a word used
  in the last `RecentWords` words is rarer, the last one never comes twice in
  a row). It has its own history (`AddFreeplaySession`) and its own stats
  screen (tiles and the WPM chart). Nothing it sends reaches the letter
  model: `/freeplay/results` drops any samples.
- The **typing test** is one free practice round (30 words). Only a full round
  counts; the server checks `wpm >= TestWPM` and `accuracy >= TestAccuracy`
  (`freeplay.Passed`) and keeps one flag per language (`SetTestPassed`).
  A failed test changes nothing and can be taken again.

Free practice opens when every letter is unlocked in learning, or once the
test is passed (`freeplayOpen` in `internal/api/freeplay.go`). The chosen mode
is interface state: it lives in the browser (`localStorage`, `tt.mode.<lang>`),
not on the server. Reset clears the flag and the free practice history;
export / import carry both.

## Concurrency

The random generators are not safe for parallel use, so `Portion` (learning and free practice) runs under
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
  (token hashes), `progress` (unlocked letters, typing test, study group),
  `key_stats`
  (the letter model) and `sessions` (the history of both modes, `mode`
  column; the raw keys as `JSONB`). Every data table is keyed by user and
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
| Statistics | until the server stops | until the tab is closed or reloaded |
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
