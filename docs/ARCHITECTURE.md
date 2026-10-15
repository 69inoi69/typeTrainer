# Architecture

## Overview

```
 Browser (web/)                         Go server
 ┌───────────────────────┐   JSON    ┌─────────────────────────────────────────┐
 │ ES modules: app.js,   │ ───────▶  │ api        HTTP handlers, /api/v1/*      │
 │  typing.js (keydown,  │ ◀───────  │   │                                      │
 │  timing), keyboard... │           │   ├──▶ engine   model + word generator   │
 └───────────────────────┘           │   └──▶ storage  Store interface          │
                                     │              └─ MemoryStore (now)        │
                                     │              └─ PostgresStore (later)    │
                                     │ config  all numbers   layout  key data   │
                                     └─────────────────────────────────────────┘
```

**Dependency rule:** `api` uses `engine` and `storage`. `storage` imports
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
| `internal/config` | Every tunable number in one place. |
| `internal/engine/model.go` | Per-letter statistics, EMA update, difficulty, mastery, softmax weight. |
| `internal/engine/generator.go` | Unlock order, first lesson size, unlocking rule, word selection. |
| `internal/storage/store.go` | The `Store` interface. |
| `internal/storage/memory.go` | In-memory `Store` (lost on restart). |
| `internal/api/handlers.go` | JSON API, input validation, locking around read-modify-write. |
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
| bottom | `api.js` | `getJSON` / `postJSON` for `/api/v1/`, with `?lang=` added. |
| middle | `tools.js` | Tooltips of the icon buttons, reset, export / import of the statistics. |
| middle | `keyboard.js` | On-screen keyboard and hands from the layout data, the next key and finger, the size switch, fitting into the window. |
| middle | `stats.js` | The stats screen (tiles, WPM chart, heatmap keyboard, letter cards) and `refreshStats()`. |
| middle | `typing.js` | The exercise text, the caret, `handleChar()` / `backspace()`, the streak, live WPM / accuracy, the "typing now" header mode, the letters bar, sending results. |
| middle | `intro.js` | The first-visit intro and "open all letters". |
| middle | `languages.js` | The language switch and `loadLanguage()`. |
| middle | `profile.js` | The profile placeholder in the header: name and picture, kept only in the browser. |
| middle | `result.js` | The result screen in the text window: `showResult(r)` shows what changed and resolves when the user goes on. |
| middle | `tour.js` | The "how this site works" tour: a ring around each part of the page and a short card. |
| top | `input.js` | Keydown and phone input, the Type / Stats switch, the keyboard size switch, window resize: sends each action to the module that handles it. |
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

## Request lifecycle: from a keypress to the next exercise

1. `keydown` (`input.js`) → `handleChar()` in `typing.js` compares the key with the expected
   character and moves on either way (wrong = red). Each typed position keeps
   one sample `{char, errors, ms}`; `backspace()` changes only the screen, never
   the samples. Rules: `docs/ALGORITHM.md`, section 3.
2. Last character typed → `POST /api/v1/results` with all samples, WPM and accuracy.
3. The handler (under a mutex) reads the stats from the `Store`, calls
   `engine.Apply`, saves them, asks `Generator.NextUnlocked` whether a letter
   opens, saves the unlock count, stores a session summary.
4. The browser calls `GET /api/v1/stats` (letter chips, heatmap, history) and
   `GET /api/v1/exercise`, which runs `Generator.Next` on the new statistics.

## API

All responses are JSON. Every route except `/languages` takes `?lang=<id>`
(`en`, `pl`, `uk`, `ru`; default `en`). An unknown id is a 400 error.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/v1/languages` | | `[{id, name, label, layout, alphabet, systemLayout}]` |
| GET | `/api/v1/layout` | | layout JSON |
| GET | `/api/v1/exercise` | | `{text, focus, unlocked: [..], locked: [..]}` |
| POST | `/api/v1/results` | `{samples: [{char, errors, ms}], wpm, accuracy}` | `{unlocked, newLetter}` |
| POST | `/api/v1/progress` | `{unlockAll: true\|false}` | `{unlocked}` |
| POST | `/api/v1/reset` | | `{ok: true}`; deletes all data of the language (reset button, until there are user accounts) |
| GET | `/api/v1/export` | | `{unlocked, keys: {char: {count, mistakes, errEma, timeEma, timedCount}}, sessions: [all, OLDEST first]}`; everything stored for the language |
| POST | `/api/v1/import` | the same JSON as `/export` | `{unlocked, sessions}`; REPLACES the language's data, or changes nothing if the data is invalid |
| GET | `/api/v1/stats` | | `{keys: [{char, count, errorRate, avgMs, difficulty, mastered, unlocked}], sessions: [last 50, newest first], sessionCount, targetWpm}` |

Validation on `/results`: 1–5000 samples, each with exactly one character that
is a letter of the language or a space, `errors >= 0`, `ms >= 0`; WPM 0–400;
accuracy 0–100. Body limit 1 MB.

Validation on `/import`: `unlocked` between 0 and the number of letters; every key is
one letter of the language or a space; per letter `0 <= mistakes <= count`,
`0 <= timedCount <= count`, `0 <= errEma <= 1`, `timeEma >= 0`; per session WPM
0–400, accuracy 0–100, `chars >= 0`. Limits (`MaxImportBytes`,
`MaxImportSessions`) are in `internal/config/config.go`. The browser joins the
languages into one file `{app, version, exportedAt, languages: {id: <export>}}`
(see `web/tools.js`, "export / import"). Import and export use only the existing
`Store` methods, so the future PostgreSQL store needs nothing extra.

Every `Store` method takes the language id, so each language has its own
statistics, unlocked letters and history. Each language also has its own
`Generator` (own unlock order and first lesson), built in `setup.go`.

## Concurrency

The random generator is not safe for parallel use, so `Next` runs under
`genMu`. "Read stats → update → save" must not interleave between two
requests, so it runs under `writeMu`. A PostgreSQL store would use a
transaction (`SELECT ... FOR UPDATE`) instead.

## Adding PostgreSQL later

Create `internal/storage/postgres.go` with a type that has the eight `Store`
methods and change one line in `setup.go`. A possible schema, once accounts exist:

```sql
CREATE TABLE users     (id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL,
                        unlocked INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE key_stats (user_id BIGINT REFERENCES users(id), char TEXT,
                        count INT, mistakes INT, err_ema DOUBLE PRECISION,
                        time_ema DOUBLE PRECISION, timed_count INT,
                        PRIMARY KEY (user_id, char));
CREATE TABLE sessions  (id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id),
                        wpm REAL, accuracy REAL, chars INT, finished_at TIMESTAMPTZ DEFAULT now());
```

With accounts, every `Store` method gets a `userID` parameter.

## Two ways to run: server and GitHub Pages

The same code runs in two places. Go build tags pick the entry point:

| | Normal server | GitHub Pages |
|---|---|---|
| Entry point | `main.go` (`//go:build !(js && wasm)`) | `main_wasm.go` (`//go:build js && wasm`) |
| Build | `go run .` | `GOOS=js GOARCH=wasm go build -o app.wasm .` |
| Where Go runs | on your computer | in the visitor's browser (WebAssembly) |
| How the frontend reaches the API | HTTP to `localhost` | `pages/wasm-shim.js` replaces `fetch` for `/api/v1/` and calls `goApi(method, path, body)` |
| Statistics | until the server stops | until the tab is closed or reloaded |

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
