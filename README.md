<p align="center">
  <img src="web/favicon.svg" width="64" alt="typeTrainer logo">
</p>

<h1 align="center">typeTrainer</h1>

<p align="center">
  An adaptive touch-typing trainer that finds your weakest letters<br>
  and keeps building the text from real words around them while you type.<br><br>
  <a href="https://69inoi69.github.io/typeTrainer/"><b>Try it in your browser</b></a>
</p>

---

**Work in progress.** The practical part of an engineering thesis at the
Lublin University of Technology (2027).

## What it does

- **Real words only.** No made-up letter combinations.
- **Adapts while you type.** Every keypress is timed and every mistake is
  noted. The text is built a few words at a time, so letters you miss or
  type slowly come up more often a line or two later. Plain statistics, no
  machine learning.
- **Letters open one by one**, the home row first. A new letter opens when
  every open letter is typed with few mistakes at 30 words per minute; you
  always see how close each letter is and what it still needs.
- **Three modes.** *Learn* is for beginners: the trainer picks the words and
  opens the letters. *Climb* is for those who can type: the text gets harder
  as you get better (rarer words, then capitals, then punctuation), at a
  level that follows you. *Freetype* is just typing: words from the 200 to
  25 000 most common ones, as you pick. Neither changes your Learn progress.
- **Statistics** (Climb and Freetype): every round, your level, your best per round
  length (and word list) and an activity calendar. You can save them as a picture.
- **Round bar** above the text: Learn short or normal rounds, Climb and
  Freetype words or time (and Freetype's word list).
- **Settings:** live
  speed, keyboard (on a computer), caret style, dark or light theme.
- **Works on a phone.**
- **English only for now.** Polish, Ukrainian and Russian data is in the
  repository and comes back later.
- **Accounts** work only when you run the server yourself (see below). The
  website has no accounts and forgets your progress when you close the tab;
  to keep it, use Export in Settings and Import it next time.

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

## Credits

Word lists: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by
Hermit Dave (OpenSubtitles 2018), **CC BY-SA 4.0**. How they were filtered:
[docs/ALGORITHM.md](docs/ALGORITHM.md), section 12.
