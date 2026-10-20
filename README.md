<p align="center">
  <img src="web/favicon.svg" width="64" alt="typeTrainer logo">
</p>

<h1 align="center">typeTrainer</h1>

<p align="center">
  A touch-typing trainer with three modes: it teaches a beginner letter by letter,<br>
  pushes a typist who can already type just past their comfort zone,<br>
  or simply lets you type. Real words only.<br><br>
  <a href="https://69inoi69.github.io/typeTrainer/"><b>Try it in your browser</b></a>
</p>

---

**Work in progress.** The practical part of an engineering thesis at the
Lublin University of Technology (2027).

## What it does

- **Learn**, for beginners. Letters open one by one, the home row first
  (`a s l d e f r` in English). Every keypress is timed and every mistake
  is noted; the text is built a few words at a time around the letters you
  miss or type slowly. A letter is mastered at few mistakes and 30 words
  per minute, and stays mastered unless it gets clearly worse. The row of
  letters shows how close each one is and what it still needs; after a
  round a short result says what you achieved and what comes next. Plain
  statistics, no machine learning.
- **Climb**, for those who can type. One level, 1 to 100, follows you like
  a thermostat: up after lines typed cleanly, down when mistakes pile up.
  Higher levels bring rarer words, then capitals, then punctuation.
- **Freetype**, just typing. Words drawn evenly from the 200, 1k, 5k, 10k
  or 25k most common words, as you pick; nothing adapts.
- **The round bar** above the text: Learn has short (15 words) or normal
  (30) rounds; Climb and Freetype rounds of 10 to 50 words or 15 to 90
  seconds. Each mode remembers its own.
- **Statistics** for Climb and Freetype (Learn's progress is its row of
  letters): the best of every round length (and word list), the speed of
  every round, Climb's level, an activity calendar. Saved as a picture with
  one click. Climb and Freetype never change your Learn progress.
- **Settings:** live speed, the streak in Freetype, the background, caret style, dark or light theme,
  on-screen keyboard and hands, a personal speed goal, and your data
  (export, import, reset).
- **A computer keyboard is needed for typing.** On a phone or tablet the
  site shows only your stats and account.
- **English only for now.** Polish, Ukrainian and Russian data is in the
  repository and comes back later.
- **Accounts** work only when you run the server yourself (see below). The
  website has no accounts and keeps your progress in this browser; Export in
  Settings moves it to another browser or computer.

## Run it locally

Needs [Go](https://go.dev/dl/) 1.25 or newer. In the project folder:

```
go run .
```

Then open <http://localhost:3000>. Tests: `go test ./...`

Without a database, progress is lost when the server stops. To keep it, use
PostgreSQL:
`DATABASE_URL=postgres://user:password@localhost:5432/typetrainer go run .`
Step by step on Windows: [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

Built with the Go standard library plus the PostgreSQL driver, and plain
HTML, CSS and JavaScript with no build step. The website runs the same Go
code compiled to WebAssembly.

## Documentation

- [docs/USER-GUIDE.md](docs/USER-GUIDE.md): running it on Windows, every screen, button and shortcut
- [docs/ALGORITHM.md](docs/ALGORITHM.md): how the trainer picks letters and words, every formula and number
- [docs/ALGORITHM-AUDIT.md](docs/ALGORITHM-AUDIT.md): an audit of the algorithm: what is measured, what is assumed, known weak points
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code is organised, the API
- [docs/LITERATURE.md](docs/LITERATURE.md): research the algorithm builds on
- [docs/GUIDELINES.md](docs/GUIDELINES.md): principles for product, layout and interface work
- [docs/UI-TEXT.md](docs/UI-TEXT.md): rules for every text in the interface
- [docs/COMMENTING.md](docs/COMMENTING.md): rules for comments in the code
- [docs/DEVELOPMENT-LOG.md](docs/DEVELOPMENT-LOG.md): how the project got here, change by change

## Credits

- Word frequencies: [FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  by Hermit Dave (OpenSubtitles 2018), **CC BY-SA 4.0**.
- Freetype's long English list is also checked against the en_US
  [Hunspell dictionary from SCOWL](http://wordlist.aspell.net/) (via
  [wooorm/dictionaries](https://github.com/wooorm/dictionaries)) and
  [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
  (**CC BY 4.0**) to leave out names and offensive words.

How the lists were made: [docs/ALGORITHM.md](docs/ALGORITHM.md), sections 12
and 14.
