# 5. The Go server

Thesis item 5: the Go server with real-time processing. Code layout and
routes: [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Test coverage per package

`go test -cover ./...` on 2026-10-25 (internal/api has no tests of its
own; it is exercised by the whole-app tests in the repository root, counted
with `go test -cover -coverpkg=./internal/api .`):

| Package | Coverage |
|---|---|
| internal/engine | 95.7% |
| internal/freeplay | 98.2% |
| internal/sim | 96.5% |
| internal/history | 94.2% |
| internal/auth | 93.3% |
| internal/language | 100% |
| internal/layout | 80.0% |
| internal/api (through the root tests) | 78.3% |
| internal/storage, memory only | 50.1% |
| internal/storage, with PostgreSQL (`TT_TEST_DATABASE_URL`) | 89.8% |

Without a database the PostgreSQL tests skip, so the memory-only number is
low; in CI they run against a real PostgreSQL, so both stores pass the
same tests there.

To fill: the real-time part (a portion of words sent and answered while the
user types: `POST /api/v1/portion`), request limits, the timing of an
answer.
