<p align="center">
  <img src="web/favicon.svg" width="64" alt="typetrainer logo">
</p>

<h1 align="center">typetrainer</h1>

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
- **Learning and free practice.** Learning is the main mode: the algorithm
  decides what you practise. Free practice (words from the whole list, its own
  history, nothing shared with learning) opens when every letter is open, or
  after a one-time typing test. It is kept simple for now.
- English, Polish, Ukrainian and Russian, each with its own progress.
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
- [docs/DEVELOPMENT-LOG.pdf](docs/DEVELOPMENT-LOG.pdf): how the project was built and why

## Credits

Word lists: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by
Hermit Dave (OpenSubtitles 2018), **CC BY-SA 4.0**. How they were filtered:
[docs/ALGORITHM.md](docs/ALGORITHM.md), section 12.
