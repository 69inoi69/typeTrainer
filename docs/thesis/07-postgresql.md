# 7. PostgreSQL: profiles, round history, statistics

Thesis item 7. The server with PostgreSQL is the main version; GitHub
Pages keeps progress in the browser and is a demo (AGENTS.md).

- Storage interface: `internal/storage/store.go` (`storage.Store`); two
  implementations, `MemoryStore` and `PostgresStore`, pass the same tests
  (`internal/storage/store_test.go`, against a real PostgreSQL in CI).
- Schema and migrations: [03-architecture-database-use-cases.md](03-architecture-database-use-cases.md).
- Accounts: `internal/auth` (passwords and login tokens stored only as
  hashes), routes `/api/v1/auth/*`.

To fill: what is stored per user and language (profiles, rounds with their
raw keys, letter statistics), how the statistics screen reads them.
