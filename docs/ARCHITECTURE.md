# Architecture

## Overview

```
 Browser (web/)                         Go server
 ┌───────────────────────┐   JSON    ┌─────────────────────────────────────────┐
 │ app.js                │ ───────▶  │ api        HTTP handlers, /api/v1/*      │
 │  keydown, timing,     │ ◀───────  │   │                                      │
 │  keyboard, intro      │           │   ├──▶ engine   model + word generator   │
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
| `pages/wasm-shim.js` | Pages only: routes `/api/v1/` requests from `app.js` to the Go code in the browser. |
| `.github/workflows/pages.yml` | On every push to `main`: test, build WebAssembly, publish to Pages. |
| `internal/config` | Every tunable number in one place. |
| `internal/engine/model.go` | Per-letter statistics, EMA update, difficulty, mastery, softmax weight. |
| `internal/engine/generator.go` | Unlock order, first lesson size, unlocking rule, word selection. |
| `internal/storage/store.go` | The `Store` interface. |
| `internal/storage/memory.go` | In-memory `Store` (lost on restart). |
| `internal/api/handlers.go` | JSON API, input validation, locking around read-modify-write. |
| `internal/layout` | Parses and validates the keyboard layout JSON. |
| `data/layouts/qwerty-en.json` | Keys, rows, finger per key, finger colors. |
| `data/words-en.txt` | Word list, most frequent first. |
| `web/` | Static frontend: `index.html`, `style.css`, `app.js`. |

The `web/` and `data/` folders are embedded into the binary (`//go:embed`), so
the program runs the same from any folder.

## Request lifecycle: from a keypress to the next exercise

1. `keydown` → `handleChar()` in `app.js` compares the key with the expected
   character. Wrong: mark red, count the error, cursor stays. Right: push a sample
   `{char, errors, ms}` and move on.
2. Last character typed → `POST /api/v1/results` with all samples, WPM and accuracy.
3. The handler (under a mutex) reads the stats from the `Store`, calls
   `engine.Apply`, saves them, asks `Generator.NextUnlocked` whether a letter
   opens, saves the unlock count, stores a session summary.
4. The browser calls `GET /api/v1/stats` (letter chips, heatmap, history) and
   `GET /api/v1/exercise`, which runs `Generator.Next` on the new statistics.

## API

All responses are JSON.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/v1/layout` | | layout JSON |
| GET | `/api/v1/exercise` | | `{text, focus, unlocked: [..], locked: [..]}` |
| POST | `/api/v1/results` | `{samples: [{char, errors, ms}], wpm, accuracy}` | `{unlocked, newLetter}` |
| POST | `/api/v1/progress` | `{unlockAll: true\|false}` | `{unlocked}` |
| GET | `/api/v1/stats` | | `{keys: [{char, count, errorRate, avgMs, difficulty, mastered, unlocked}], sessions: [last 50, newest first], sessionCount, targetWpm}` |

Validation on `/results`: 1–5000 samples, each with exactly one character,
`errors >= 0`, `ms >= 0`; WPM 0–400; accuracy 0–100. Body limit 1 MB.

## Concurrency

The random generator is not safe for parallel use, so `Next` runs under
`genMu`. "Read stats → update → save" must not interleave between two
requests, so it runs under `writeMu`. A PostgreSQL store would use a
transaction (`SELECT ... FOR UPDATE`) instead.

## Adding PostgreSQL later

Create `internal/storage/postgres.go` with a type that has the seven `Store`
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
| How `app.js` reaches the API | HTTP to `localhost` | `pages/wasm-shim.js` replaces `fetch` for `/api/v1/` and calls `goApi(method, path, body)` |
| Statistics | until the server stops | until the tab is closed or reloaded |

`main_wasm.go` does not listen on a port. It builds the same handler with
`newApp()` and gives JavaScript one function, `goApi`, which runs a request
through that handler (`httptest.NewRequest` / `NewRecorder` serve as an
in-memory request and response). Engine, store, validation and JSON are
therefore identical in both versions; only the transport differs.

The workflow builds the site by copying `web/`, adding `app.wasm`,
`wasm_exec.js` (the Go runtime for browsers, shipped with Go) and the shim,
and inserting two `<script>` tags before `app.js` in `index.html`. The
server version never loads them.

## Adding a layout or language

- New layout: a new JSON file in `data/layouts/` (keys, finger per key).
- New language: a new word list, most frequent first. The unlock order is
  computed from it automatically.
