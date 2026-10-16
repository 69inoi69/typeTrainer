<p align="center">
  <img src="web/favicon.svg" width="64" alt="typeTrainer logo">
</p>

<h1 align="center">typeTrainer</h1>

<p align="center">
  An adaptive touch-typing trainer that finds your weakest letters<br>
  and keeps building the text from real words around them while you type.<br><br>
  <a href="https://69inoi69.github.io/typetrainer/"><b>Try it in your browser</b></a>
</p>

---

**Work in progress.** The practical part of an engineering thesis at the
Lublin University of Technology (2027).

## Idea

- **Real words only**, no generated letter combinations.
- **It adapts to you while you type.** Every keypress is measured; the text
  is built a few words at a time, so letters you miss or type slowly show up
  more often a line or two later, and mistyped words come back. Plain
  statistics, no machine learning, so every step can be explained.
- **Letters open gradually**, most frequent first, once the open ones are
  accurate and fast enough.
- **Two modes: Learn and Freetype.** *Learn* is the learning mode and the
  main one: the algorithm decides what you practise. *Freetype* (words from
  the whole list, its own history, nothing shared with learning) opens when
  every letter is open, or after a one-time typing test. It is kept simple
  for now.
- **You see what to practise.** Above the text, a row of letters marks the
  one in focus, the mastered ones and the next to open. The keyboard and the
  hands show the finger for the next key. The statistics screen shows every
  round, a keyboard coloured by difficulty and every letter from weakest to
  strongest, all on one screen.
- **Take your numbers with you:** the statistics screen copies a short text
  summary or saves a picture card with your speed and letters.
- **Settings change how much and how it looks, never what:** round length
  (10, 30 or 60 words, or 30 or 60 seconds), live numbers on or off, caret
  style, a dark and a light theme, keyboard on or off. Help and settings
  open as panels in the same style as everything else.
- **Two short first-visit guides:** the basics of touch typing, and how
  this site works.
- English for now. Polish, Ukrainian and Russian are ready in the data
  (word lists, layouts) and come back once the English version is polished.
- Works on a phone too, with the navigation in a bar at the bottom.
- **Accounts** (with the local server): sign up, log in, and your progress is
  kept under your account, in PostgreSQL if `DATABASE_URL` is set, otherwise
  in the server's memory.

## Run it locally

Needs [Go](https://go.dev/dl/) 1.25 or newer. In the project folder:

```
go run .
```

Then open <http://localhost:3000>. Tests: `go test ./...`

Progress lives in memory until the server stops. To keep it, point the
server at PostgreSQL:
`DATABASE_URL=postgres://user:password@localhost:5432/typetrainer go run .`
(Windows steps: [docs/USER-GUIDE.md](docs/USER-GUIDE.md)).

Go standard library plus one module (the PostgreSQL driver), plain
HTML/CSS/JavaScript, no build step. The
website runs the same Go code compiled to WebAssembly.

## Documentation

- [docs/ALGORITHM.md](docs/ALGORITHM.md): the adaptive model, every formula and parameter
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): packages, data flow, API
- [docs/USER-GUIDE.md](docs/USER-GUIDE.md): running it on Windows, every screen, button and shortcut
- [docs/LITERATURE.md](docs/LITERATURE.md): research the model builds on
- [docs/VOICE.md](docs/VOICE.md): how the app talks to users
- [docs/COMMENTING.md](docs/COMMENTING.md): how comments in the code are written
- [docs/DEVELOPMENT-LOG.pdf](docs/DEVELOPMENT-LOG.pdf): how the project was built and why

## Credits

Word lists: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by
Hermit Dave (OpenSubtitles 2018), **CC BY-SA 4.0**. How they were filtered:
[docs/ALGORITHM.md](docs/ALGORITHM.md), section 12.
