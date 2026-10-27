# How comments are written here

Comments in this repository are written for **a newcomer who knows a little
programming but not this project**: a new contributor, a reviewer, or
the author a year from now. A comment should let that person understand a
part of the code without reading everything around it, and change it safely.

The rules come from the official Go guide to doc comments, the Google
JavaScript style guide, and Ellen Spertus' "Best practices for writing code
comments" (Stack Overflow blog), adapted to this project. Links are at the
end.

For now the code carries only orientation comments: one line at the top of
a file saying what it is, and section dividers (`// ---------- name
----------`). The other comments are written again file by file, by these
rules.

## The ten rules

1. **Explain why, not what.** The code already says what it does. A comment
   adds what the code cannot say: the reason, the trade-off, the thing that
   was tried and did not work.

   ```go
   // Bad:  i++ // add one to i
   // Good: a held key repeats every ~30 ms: those are not finger movements,
   //       so a repeat is ignored (otherwise "ll" would look super fast).
   ```

2. **Every file starts with what it is for and how it connects.** One short
   paragraph at the top: what this file is responsible for, who calls it,
   and what it calls. In Go, the package comment (`// Package engine ...`)
   says it once per package; each other file gets one line or two if its
   part is not obvious from the name. In JavaScript, each module states its
   job and its layer (see the import rule in `docs/ARCHITECTURE.md`).

3. **Every exported name has a doc comment** that starts with the name and is
   a full sentence (Go convention, read by `go doc`): `// Portion builds ...`.
   Say what it returns in the "nothing yet" and zero cases if that is not
   obvious.

4. **Numbers get a unit and a reason.** `120 // ms: shorter feels like a
   flicker`. Every tunable number lives in `internal/config/config.go` (or
   `web/feel.js` for the feel of the interface), and its comment says what
   happens when it goes up or down.

5. **Mark the extension points.** Where someone will likely add something,
   say how, in one line that starts with "To add":

   ```go
   // To add a route: a handler method here, one line in routes(), and a
   // row in the API table of docs/ARCHITECTURE.md.
   ```

   Only where it really helps: an extension point, not every function.

6. **Explain the surprising, not the ordinary.** Unusual code (a workaround,
   a browser quirk, an order that matters, a lock) always gets a comment.
   Ordinary code (a loop over a slice, a getter) does not.

7. **Point to the source of an idea.** A formula, an algorithm, a borrowed
   trick: name where it comes from (a section of `docs/ALGORITHM.md`, a
   paper in `docs/thesis/01-existing-systems-and-literature.md`, a link).

8. **Keep comments true.** A wrong comment is worse than none. When the code
   changes, its comments change in the same commit. If a comment is hard to
   write, the code is probably too complicated: simplify the code first.

9. **Plain English, short sentences.** No jargon without an explanation,
   no abbreviations a newcomer would not know. Full sentences for doc
   comments; short fragments are fine at the end of a line.

10. **Nothing that belongs in git.** No author names, dates, "changed by",
    or commented-out code. Unfinished work is marked `TODO:` with what is
    missing and why it is not done yet.

## What goes where

| What | Where |
|---|---|
| What the whole program does, how to run it | `README.md`, `CONTRIBUTING.md` |
| How the parts fit together, the API | `docs/ARCHITECTURE.md` |
| The algorithm and its formulas | `docs/ALGORITHM.md` |
| Rules for interface text | `docs/UI-TEXT.md` |
| Product, layout and interface principles | `docs/GUIDELINES.md` |
| What a package or module is for | its package comment / the top of the file |
| Why a piece of code is the way it is | a comment next to it |
| What changed and when | the commit message, not the code |

## Common extension points

Where something new is likely to be added:

- a new **API route**: `internal/api/handlers.go` (routes)
- a new **Store method**: `internal/storage/store.go` (both stores and a test)
- a new **table or column**: `internal/storage/migrations/` (a new numbered file)
- a new **tunable number**: `internal/config/config.go`
- a new **language or layout**: `data/` (see "Adding a layout or language" in
  `docs/ARCHITECTURE.md`)
- a new **interface text**: `web/i18n.js` (English for now, `docs/UI-TEXT.md`)
- a new **setting**: `web/settings.js`
- a new **navigation item**: `web/index.html` (`nav.rail`) and `web/input.js`
- a new **theme**: `web/base.css` (one `:root[data-theme]` block)
- a new **frontend module**: its layer in `docs/ARCHITECTURE.md` ("Frontend
  modules") and `webmodules_test.go`

## Sources

- [Go Doc Comments](https://go.dev/doc/comment): the official guide to Go doc comments.
- [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html): the sections on comments and JSDoc.
- [Best practices for writing code comments](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/) by Ellen Spertus.
