# Typing Trainer — prototype

An adaptive touch-typing trainer (engineering thesis prototype).
Go backend (standard library only) + plain HTML/CSS/JS frontend.
The server watches which keys you miss or type slowly and puts them into the
next exercise more often.

## Run it on Windows (from zero)

1. **Install Go** (once). Go to <https://go.dev/dl/>, download the
   Windows installer (`go1.24.x.windows-amd64.msi` or newer, at least 1.22),
   run it and click Next until it finishes.
2. **Check it works.** Open a *new* PowerShell window
   (Start → type `powershell` → Enter) and run:
   ```
   go version
   ```
   You should see something like `go version go1.24.7 windows/amd64`.
3. **Go to the project folder** (where this README is), for example:
   ```
   cd C:\Users\YOUR_NAME\Downloads\typing-trainer
   ```
4. **Start the server:**
   ```
   go run .
   ```
   The first run takes a few seconds. Then you see
   `Typing trainer running. Open http://localhost:3000 in your browser`.
   Windows may ask about the firewall — "Allow" is fine (or Cancel; localhost works anyway).
5. **Open** <http://localhost:3000> in your browser and start typing.
   Always open the page through this address. Double-clicking `web/index.html`
   opens it without the server, and then it has no words and no statistics.
   If the port is taken by another program, change `Addr` in
   `internal/config/config.go`.
6. **Stop** the server with `Ctrl + C` in PowerShell. All statistics are
   in memory, so they are reset when the server stops (PostgreSQL comes later).

Run the unit tests:
```
go test ./...
```

Optional: build one `.exe` you can double-click: `go build -o typing-trainer.exe .`

## Online version (GitHub Pages)

<https://69inoi69.github.io/typing-trainer/> — no installation, share the link
with anyone.

GitHub Pages can only host static files, so the whole Go app (engine, store,
API) is compiled to WebAssembly and runs inside the browser. It is the same Go
code as the server version, not a copy. Every push to `main` runs the tests and
republishes the site automatically (`.github/workflows/pages.yml`); progress is
visible in the **Actions** tab. Statistics live only in the open tab and reset
on reload.

## How to use

- On the first visit a three-step intro explains the home position. At the end,
  choose "I'm new to this" (start with 7 letters) or "I can already touch type"
  (all letters open). You can reopen it with "how it works".
- Type the grey text. Wrong key = the letter turns red and you must press the
  right one before moving on.
- The row of letters at the top shows your progress: open letters, the letter in
  **focus** (yellow, your weakest right now), mastered letters (green dot), and
  locked letters (outlined). Master every open letter and the next one opens.
- The keyboard shows the next key in its finger color; keys you do not need yet
  are dimmed. `Esc` or "new exercise" gives a new text without saving.
- The **EN · PL · UK · RU** switch changes the language you practise **and the
  language of the interface** (remembered in your browser; the first time it
  follows your browser's language).
- "keyboard" slider: size of the on-screen keyboard (0 = hidden). Remembered in
  your browser. "heatmap" tints keys red by how hard they are for you.
- The **type / stats** switch at the top opens the statistics screen: totals,
  speed of every exercise, and every letter from weakest to strongest.

## Documentation

- [`docs/ALGORITHM.md`](docs/ALGORITHM.md): the adaptive model, every formula
  and parameter, why it is built this way, known simplifications, ideas for
  evaluation. Start here for the thesis.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): packages, data flow, API,
  how to add PostgreSQL, layouts and languages.
- [`docs/LITERATURE.md`](docs/LITERATURE.md): reading list with sources.

## Project structure

```
typing-trainer/
├── setup.go                      loads data files, wires the packages together
├── main.go                       entry point: normal web server (go run .)
├── main_wasm.go                  entry point: WebAssembly build for GitHub Pages
├── pages/wasm-shim.js            Pages only: sends /api/v1 calls to the Go code in the browser
├── .github/workflows/pages.yml   builds and publishes the Pages version
├── data/
│   ├── languages.json            the four languages: name, layout, alphabet
│   ├── langs/<id>/words.txt      2000 most frequent words per language
│   └── layouts/*.json            keyboard layouts + finger mapping (data, not code)
├── tools/wordlists/              script + block lists that build the word lists
├── docs/                         algorithm, architecture, reading list
├── internal/
│   ├── config/config.go          ALL tunable numbers
│   ├── engine/model.go           the math: EMA, difficulty, mastery, softmax
│   ├── engine/generator.go       unlocking letters, choosing words
│   ├── engine/*_test.go          unit tests
│   ├── storage/store.go          Store interface
│   ├── storage/memory.go         in-memory implementation
│   ├── layout/layout.go          loads and validates layout JSON
│   ├── language/language.go      loads languages.json, checks words against the alphabet
│   └── api/handlers.go           HTTP JSON API under /api/v1/
└── web/                          index.html, style.css, app.js, i18n.js (interface texts)
```

## The algorithm in short

```
per letter (EMA, a = max(0.1, 1/n)):   ErrEMA, TimeEMA
raw        = 0.6 * clamp(ErrEMA / 0.25) + 0.4 * clamp((TimeEMA - 400) / 600)
difficulty = (n * raw + 5 * 0.7) / (n + 5)
P(letter)  ~ exp(difficulty / 0.25)            -> focus letter
P(word)    ~ exp(mean difficulty of its letters / 0.25)   among words with that letter
mastered   = n >= 20, ErrEMA <= 5 %, TimeEMA <= 400 ms (30 WPM)
all open letters mastered -> next letter opens
```

Full explanation: [`docs/ALGORITHM.md`](docs/ALGORITHM.md).

## Languages and word lists

English, Polish, Ukrainian and Russian, chosen with the switch at the top. Each
language keeps its own progress. Switch your **system** keyboard layout too
(Windows: Win + Space); the app shows a hint when the layout does not match.
Polish uses the standard "Polish (Programmers)" layout: ą, ę, ł... with AltGr.

The word lists are the 2000 most frequent words of each language from
[FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave,
counted in the OpenSubtitles 2018 corpus. **License of the word data:
CC BY-SA 4.0** (attribution and share-alike). Filtering steps:
`docs/ALGORITHM.md`, section 12. To rebuild them (Python 3 needed):

```
git clone --depth 1 https://github.com/hermitdave/FrequencyWords
python tools/wordlists/build.py FrequencyWords/content/2018
```

A new language = an entry in `data/languages.json`, a layout in
`data/layouts/` and a word list in `data/langs/<id>/`. No code changes.

## Adding PostgreSQL later

Write `internal/storage/postgres.go` with a type that has the same seven
methods as `Store`, then change one line in `setup.go`. A schema sketch is in
`docs/ARCHITECTURE.md`.
