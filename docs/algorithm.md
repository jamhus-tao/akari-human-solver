# Solver architecture and inference rules

## Modules

`akari_solver/solver.py` owns local domains, pooled enumeration, the shared heap
search and batch commits. `board.py` derives illumination and display state;
`puzzle.py` parses geometry offline. `download.py` independently fetches today
or an archive puzzle and saves its original JSON; `cli.py` handles offline solve
input/output. Source selectors are exclusive and solve never implicitly fetches. `protocol.py` serializes proofs. `exact_verifier.py` is an
independent safety checker. `cost_models.py` contains interchangeable scorers.

The public package exposes `AkariHumanSolver`, `Center`, `BrainStep`,
`Contradiction`, `SearchLimit`, `parse_puzzlink`, `diff`, `illuminated`, and `render`.
CLI usage and setup are in the [root README](../README.md).

## Frozen local domains

Every step starts from one committed before-state:

- A Number center enumerates adjacent unknown Lamp/Mark allocations satisfying
  that Number after subtracting already adjacent Lamps.
- An unlit Mark center considers individually visible Lamp positions, excluding
  itself. An unlit Blank center also permits a Lamp at itself.
- Existing Lamps, Marks and illumination restrict positions. Unselected Number
  or coverage constraints cannot filter domains or propagate additional moves.
- Coverage alternatives are an OR cover, not an exactly-one rule. A chosen Lamp
  leaves unmentioned positions undecided.

## Pooled combinations and actions

Merge one hypothesis per selected center into an unordered partial assignment.
Deduplicate after every merge, so A+B and B+A enter physical evaluation once.
Discard conflicting assignments to the same position. Do not complete missing
positions with guessed Lamp/Mark values.

Apply only direct Lamp rays to each combination and reject physical conflicts.
Intersect Boolean Lamp/no-lamp constraints across survivors. Keep ray exclusions
for intersection: multiple different Lamps can prove a shared forbidden position.
Then derive actionable results, removing new Marks illuminated by proved Lamps
before returning `BrainStep.new_marks`. A result must contain at least one action.

A cost-one result from one center is a Brain step. Two or more independent
singleton cost-one results form a Fast mark batch, all using the same before-state.
Deduplicate shared actions and remove Marks illuminated by any proved Lamp in
the whole batch. Verify, then commit once. Historical actions remain in the log;
preview overlays must not erase committed symbols before the After phase.

## Costs and search

`product` multiplies raw local domain sizes. `overlap-experimental` starts with
those same per-center counts, then traverses distinct shared candidate positions
in row/column order. The owner with the smallest current contribution keeps it;
other owners decrement once. Ties use center coordinate and kind. Multiply
`max(1, residual)` across centers and add `center_count - 1`.

The mode selects a callable once during initialization. Both modes share one heap
ordered by `(cost, center count, stable IDs)`, return its first productive set,
and expand only nonproductive sets. Child scores are recomputed. Cost-one
singleton proofs are collected together before commit. There is no separate
experimental enumeration, resource policy or commit path.

Product cost is monotone under expansion. Experimental cost can decrease; heap
first-hit selection therefore does not prove its global minimum. Diagnostics
use `selected_key` and `optimality_proven: false`, not an unsupported optimality
claim. Cost and actual unique combination count are separate quantities.

`--max-combinations` bounds examined center sets; `--max-branches` bounds numeric
cost and pooled candidate work/count. Exhaustion produces `search_limit`, not
`stuck`, and never commits a partial Fast batch. An unfinished run exits with 2.
Neither mode minimizes total solution length or total cost across future steps.

## Independent verification and reports

The verifier encodes full Akari rules independently as CNF/DPLL. It checks initial
feasibility and verifies that the opposite of each proposed action is impossible.
It can reject a batch but cannot generate human moves or prune local branches.

The [v8 protocol](protocol.md) stores one action map and selected centers per step.
Local domains, costs and evidence are reconstructed. Optional expression strings
come from the producer and are displayed literally; they do not authorize actions
or determine numeric cost. `--cost-output` writes detailed scoring/search
information separately. All generated reports are excluded from Git.
