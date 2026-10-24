# 3. Architecture, database schema, use cases

Thesis item 3. The architecture itself is described in
[docs/ARCHITECTURE.md](../ARCHITECTURE.md); this file collects what the
chapter needs on top of it. To bring up to date after the cleanup phase.

## Architecture

- Layers and packages: ARCHITECTURE.md (`internal/engine` pure logic,
  `internal/api` HTTP, `internal/storage` behind `storage.Store`, `web/`
  ES modules in three import layers).
- Two ways to run the same code: a server (`main.go`) and WebAssembly on
  GitHub Pages (`main_wasm.go`), shared setup in `setup.go`.

## Database schema

Tables (`internal/storage/migrations/001_init.sql`): `users`, `logins`,
`progress`, `key_stats`, `sessions`. Later changes, one numbered file each:

| Migration | What it adds |
|---|---|
| 002 | round length per session |
| 003 | study group (adaptive / random) |
| 004 | device of a round |
| 005 | held letters |
| 006 | Climb level of a round |
| 007 | Freetype modes |
| 008 | Climb's ten levels |
| 009 | Freetype text kinds |
| 010 | Learn laps |

To fill: an entity-relationship diagram from 001-010.

## Use cases

To fill. Candidates: a beginner's first Learn round; a letter opens; a
round is saved and the next words are chosen; Climb level up / down;
Freetype with own text; sign up and keep progress; export and import.
