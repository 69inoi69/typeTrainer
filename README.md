<p align="center">
  <img src="web/favicon.svg" width="72" alt="">
</p>

<h1 align="center">typeTrainer</h1>

<p align="center">
  Looks like Monkeytype. Teaches like keybr. Real words only.<br><br>
  <a href="https://69inoi69.github.io/typeTrainer/"><b>Start typing</b></a>
  ·
  <a href="docs/USER-GUIDE.md">Guide</a>
  ·
  <a href="docs/ALGORITHM.md">How it works</a>
</p>

<p align="center">
  <a href="https://github.com/69inoi69/typeTrainer/actions/workflows/pages.yml"><img src="https://github.com/69inoi69/typeTrainer/actions/workflows/pages.yml/badge.svg" alt="Deploy"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="License: GPL-3.0"></a>
</p>

## About

typeTrainer times every key you press, notices which letters slow you down
or trip you up, and picks the next words around them. Every word is a real
word you could meet in a book.

A computer keyboard is needed to practise. On a phone the site shows your
stats only.

typeTrainer started as an engineering thesis at the Lublin University of
Technology; the thesis notes live in [docs/thesis](docs/thesis/).

The project is changing fast right now, so this page stays short. To see
what it does today, [open the site](https://69inoi69.github.io/typeTrainer/).

## Run it yourself

You need [Go](https://go.dev/dl/) 1.25 or newer.

```
go run .
```

Then open <http://localhost:3000>. Accounts and a PostgreSQL database are
optional; [CONTRIBUTING.md](CONTRIBUTING.md) has the details.

## Contributing

Bug reports, ideas and pull requests are welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md): how to run the tests and the few rules
the code follows. How the parts fit together is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Credits

- Word frequencies: [FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  by Hermit Dave (OpenSubtitles 2018), **CC BY-SA 4.0**.
- Sentences: [Tatoeba](https://tatoeba.org), **CC BY 2.0 FR**.
- The long English list is checked against the en_US
  [Hunspell dictionary from SCOWL](http://wordlist.aspell.net/) (via
  [wooorm/dictionaries](https://github.com/wooorm/dictionaries)) and
  [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
  (**CC BY 4.0**) to leave out names and offensive words.
- Fonts: [Geist Mono](https://github.com/vercel/geist-font) and
  [Sora](https://github.com/sora-xor/sora-font), **SIL OFL 1.1**.
- The look owes a lot to [Monkeytype](https://github.com/monkeytypegame/monkeytype),
  the teaching to [keybr](https://github.com/aradzie/keybr.com).

How the word lists were made: [docs/ALGORITHM.md](docs/ALGORITHM.md).

## License

[GPL-3.0](LICENSE).
