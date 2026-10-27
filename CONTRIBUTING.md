# Contributing

Thanks for looking. typeTrainer is small on purpose: Go's standard library
on the server, plain HTML, CSS and JavaScript in the browser, no npm and no
build step. (Node appears only in `tools/browser`, for the checks below.) If you can read Go and JavaScript, you can change any part of it.

## Run it

You need [Go](https://go.dev/dl/) 1.25 or newer.

```
go run .
```

Open <http://localhost:3000>. Always use this address: opening
`web/index.html` from disk gives a page with no words and no stats. If the
port is taken, change `Addr` in `internal/config/config.go`.

The web files are built into the program, so restart the server after you
change them. `go build .` makes one file you can run on its own.

Without a database, progress lives in the server's memory and is gone when
it stops. Export it first (Settings, Data) if you want to keep it.

### With PostgreSQL

```
DATABASE_URL=postgres://user:password@localhost:5432/typetrainer go run .
```

The tables are created on the first start, and the log says
`storage: PostgreSQL`. If the password has characters like `@`, `:` or `/`,
write them as `%40`, `%3A`, `%2F`.

On Windows, step by step:

1. Install PostgreSQL from <https://www.postgresql.org/download/windows/>.
   Keep port 5432 and remember the password of the user `postgres`.
2. Start menu, *SQL Shell (psql)*: press Enter until it asks for the
   password, type it, then `CREATE DATABASE typetrainer;`
3. In PowerShell, in the project folder:

   ```
   $env:DATABASE_URL = "postgres://postgres:YOUR_PASSWORD@localhost:5432/typetrainer"
   go run .
   ```

   The variable lives only in this PowerShell window.

## Test it

```
gofmt -w .
go vet ./...
go test ./...
```

Every pull request runs these and the WebAssembly build. The storage tests
also run against a real PostgreSQL when `TT_TEST_DATABASE_URL` points to an
empty database (its tables are emptied on every run).

### Browser checks

`tools/browser` types real rounds in a real browser (Playwright): a round
in each mode finishes, the caret stays one line tall, the result and stats
screens open. They start `go run .` themselves; stop your own server first,
or they test whatever it is serving. You need [Node](https://nodejs.org/) 20
or newer.

```
cd tools/browser
npm ci
npx playwright install chromium
npx playwright test
```

Every pull request runs them too. A failed run on GitHub keeps a trace and a
screenshot under the job's artifacts.

`node perf.mjs` in the same folder measures typing latency: style recalc
per key, key to caret start and slow frames. It needs a running server.
Run it before and after a change to the typing screen, on the same machine,
and put both results in the pull request. `node perf.mjs --bare` measures the
screen without the falling background and the keyboard.

The website on GitHub Pages is the same Go code compiled to WebAssembly
(`main_wasm.go`). Every merge to `main` rebuilds it.

## Before you open a pull request

- One change per pull request, small enough to review in one sitting.
- Every number you might want to tune goes into `internal/config/config.go`,
  not into the logic.
- Every text a user sees lives in `web/i18n.js` and follows
  [docs/TEXT-RULES.md](docs/TEXT-RULES.md): short, plain, and only where it helps.
- The code that runs on every keypress stays light (the rules are in
  `docs/CODE-RULES.md`, "Architecture rules"); measure it with `perf.mjs` before
  and after.
- If you change how Learn picks letters or words, update
  [docs/HOW-THE-MODES-WORK.md](docs/HOW-THE-MODES-WORK.md) and the tests in the same pull
  request, and show the result of `go run ./tools/sim`.
- Comments: [docs/CODE-RULES.md](docs/CODE-RULES.md). For now the code
  keeps only a one-line header per file and section dividers.

The bigger picture: [docs/PRODUCT.md](docs/PRODUCT.md) for what the
product is, [docs/CODE-RULES.md](docs/CODE-RULES.md) and
[docs/HOW-THE-CODE-WORKS.md](docs/HOW-THE-CODE-WORKS.md) for the code,
[docs/DESIGN-RULES.md](docs/DESIGN-RULES.md) for the interface.

## License

By contributing you agree that your work is released under the
[GPL-3.0](LICENSE), like the rest of the project.
