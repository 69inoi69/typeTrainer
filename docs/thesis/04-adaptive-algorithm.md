# 4. The adaptive algorithm

Thesis item 4: the mathematical model of the adaptive algorithm (letter
difficulty index and weighted random choice). The model as it works now is
described in [docs/ALGORITHM.md](../ALGORITHM.md); the code is
`internal/engine/model.go` and `generator.go`. Changes to the formulas go
through the owner and the simulation (AGENTS.md).

## Where each part is

| Part | ALGORITHM.md |
|---|---|
| What is measured per key | section 3 |
| Per-letter statistics (EMA) | section 4 |
| Difficulty index, shrinkage towards a prior, worked example | section 5 |
| Unlocking letters, laps, the forecast | section 6 |
| Choosing the words (softmax with temperature) | section 7 |
| Parameters and their reasons | section 8 |
| Known simplifications | section 9 |
| Simulation | section 10 |

## Audit

[ALGORITHM-AUDIT.md](ALGORITHM-AUDIT.md): an outside review of the model as
it was on 2026-10-16 (what is measured, what is assumed, weak points). Its
numbers predate later changes (held letters, the unmastered bonus, the
home-row order); recounting them is issue #153.
