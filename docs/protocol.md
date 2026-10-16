# Akari proof and replay protocol

The canonical solver output is **strict-local proof schema 8**. Its JSON Schema
is [`schemas/proof-v8.schema.json`](../schemas/proof-v8.schema.json). `validateReplay()` in `web/src/validation.mjs` is the public
validation entry point; `web/src/model.mjs` `normalizeReport()` is a lower-level legacy/action
adapter and is not a v8 importer.

## 1. Canonical proof v8

```json
{
  "schema_version": 8,
  "puzzle": {"grid": [[0, -1], [-1, -1]]},
  "steps": [
    {
      "actions": {"(1,2)": "Mark", "(2,1)": "Mark"},
      "proofs": [["(1,1)"]]
    },
    {
      "actions": {"(2,2)": "Lamp"},
      "proofs": [["(1,2)"], ["(2,1)"], ["(2,2)"]]
    }
  ]
}
```

Only `schema_version`, `puzzle`, and `steps` are required. The only optional
report fields are `initial_marks`, `stop`, and `cost_model`. The latter is
`product` (default when omitted) or `overlap-experimental` for the opt-in experiment. Unknown fields are errors, including
old fields that happen to agree with the canonical values.

### Puzzle

`puzzle` contains **exactly one** of `grid` and `puzzlink`. Grid values are `-1`
(white), `-2` (Wall), and `0..4` (Number), in a nonempty rectangle of at most 2500
cells. A provided external original board must match exactly; it is not another
source of authority. A bitmap cannot supply geometry.

Optional text metadata: `title`, `author`, `dateKey`, `source`, `license`,
`socialUrl`. Optional integer metadata: `dailyNumber`, `puzzleId`, `difficulty`.
Null or unused API fields are omitted by the producer.

### Initial state and steps

`initial_marks` is an optional nonempty coordinate-to-action map for replaying
from an existing position. Omit it when starting blank. Coordinates are strings
like `(1,5)`, with positive one-based row and column, no spaces or leading zeros.
Only `Lamp` and `Mark` are actions. Marks may target white cells only.

`steps` is an ordered array (at most 10000); array position is the step number.
Each step has:

- **`actions`**: one nonempty map of actual new Lamp/Mark actions. Retraction,
  replacement, and repetition of an existing action are forbidden.
- **`proofs`**: one or more arrays of selected-center coordinates. A component
  has 1–100 distinct centers; a step has at most 2500 distinct components.
- **`note`**: optional nonempty explanatory text.
- **`cost_expression`**: optional nonempty plain text, at most 10000 characters,
  displayed beside Enumeration centers. For a Fast batch it describes the batch;
  for a Brain step it describes the one proof.
- **`proof_cost_expressions`**: optional array of nonempty strings for Fast batches,
  aligned one-to-one with `proofs`. Used when inspecting an independent component.
  Omit this field for a single proof to avoid duplicating its expression.

Expressions are producer-owned annotations, never parsed, evaluated or used to
validate numeric cost. Missing expressions stay hidden: the frontend must not
synthesize a fallback from candidate counts, even for legacy reports. Text is
rendered literally, never as HTML. A missing component expression does not fall
back to the batch expression.


A single component is a Brain step regardless of cost. Two or more components
are a Fast mark; each selects exactly one center with exactly one local candidate.
All components use the SAME before-state. Different centers proving the same
Lamp are legitimate independent evidence; the action is stored only once.
Duplicate center sets are rejected. A cost-one multi-center union is redundant
and rejected: represent independent singleton proofs instead.

### Proof reconstruction and verification

Center kinds are inferred from the original geometry and frozen pre-step state:
Number, unlit Mark, or unlit Blank. Walls and lit white cells are not active
centers. Candidate domains are reconstructed using strict local rules:

1. Number centers enumerate only adjacent unknown white-cell Lamp/Mark allocations
   satisfying the original number minus existing adjacent Lamps.
2. Coverage centers enumerate single visible Lamp positions; Mark excludes itself,
   Blank includes itself. Already forbidden or lit positions are excluded.
3. Form a shared pool from the union of selectable positions. Combine one local
   hypothesis from each selected center as an unordered set of assignments.
   Reject inconsistent assignments to the same position. Canonicalize by
   coordinate and deduplicate after every merge, before further enumeration or
   physical evaluation: A+B and B+A represent one combination. Unmentioned
   positions remain undecided; never add Lamp/Mark assignments to complete the pool.
4. Apply direct Lamp rays and reject physical conflicts. No unselected number or
   coverage rule filters candidates; no recursive propagation is allowed.
5. Intersect Boolean Lamp/no-lamp constraints over surviving branches. Physical
   branch effects distinguish `Lit` from explicit `Mark`: illumination forbids a
   Lamp but does not create a Mark action. Reject a component with no
   survivors or no productive action. Coverage alternatives are an OR cover,
   not an exactly-one constraint.
6. Union component conclusions. Determine illumination from existing Lamps plus
   all proved new Lamps. Remove newly proposed Marks covered by that illumination.
7. The remaining map must equal **`actions` exactly**. Neither a subset nor extra
   globally forced actions are accepted. There is no second action definition.
8. Independently check state feasibility and opposite-action UNSAT. Exact solving
   validates; it never generates proof moves or prunes the local candidates.

Brain cost is the product of the original center domain sizes. Unique combination
count is at most Brain cost; it can be smaller after merging equivalent hypotheses
and discarding contradictory assignments. No. 649 step 3 has cost 2 and 2
single-Lamp hypotheses; step 5 has cost 8 and 2 combinations; step 23 has cost 24
and 24 combinations (7 physically compatible).

Candidate identity is its partial coordinate-to-Lamp/Mark assignment, independent
of center order or selection order. There are no center tuple indexes, compressed
prefixes or multiplicities in v8 enumeration. A missing position means undecided,
not Mark. A single coverage hypothesis may therefore cover solutions with other
Lamps; those possibilities are not expanded into extra candidates. This corrects
the earlier v8 implementation that unnecessarily completed the entire pool.
Candidate ordering is not a protocol requirement. The viewer sorts compatible
candidates first, retaining all conflicts for inspection; this does not affect
proof intersection, cost or exported actions.

Fast component costs are each 1; total cost is their sum, including duplicate-result proofs.
Optimality and puzzle uniqueness are not claims of the wire format or validator.

### Experimental cost model

`overlap-experimental` changes scoring, not pooled inference or exact action
validation. Initialize each center contribution to its local candidate count.
For each distinct shared candidate position (ascending row/column), retain the
owner with the smallest current contribution, breaking ties by center coordinate
and kind; decrement all other owners once. Compute
`product(max(1, residual_i)) + center_count - 1`. Shared positions include all
Lamp/Mark keys in local alternatives, counted once per center. Processing order
and ties are fixed so Python and browser reconstruct identical numeric costs.
Candidate count need not be bounded by experimental cost. Fast marks still require
independent singleton cost-one proofs; multi-center discounted results remain
Brain steps. Expressions do not determine which cost model applies.

Both script modes use one search implementation, selecting only the cost
function at initialization. The shared heap is ordered by cost, center count and
stable IDs. It returns the first productive popped set; only nonproductive sets
are expanded, with child costs recomputed. Singleton cost-one batching remains.
It does not certify global minimum cost when adding centers reduces the score.
Search diagnostics explicitly record `heap_first_productive`, `selected_key`, and
`optimality_proven: false`. This search policy does not change proof validity.

### Completion and termination

No `stop` means the final board must be solved. An empty `steps` array is allowed
only when the initial state is solved or a stop is supplied. An unfinished report
has a single optional object:

```json
"stop": {"kind": "partial", "reason": "One-step regression example."}
```

`kind` is `stuck`, `search_limit`, or `partial`. `reason` is nonempty text.
There is no `complete`, `status`, or terminal step. Completion is recomputed from
lighting, lamp conflicts and Number counts. A stop explains why a producer ended;
it is not a proof of no solution or of no cheaper inference.

### Fields deliberately absent

Do not serialize `conclusions`, `new_marks`, `proposed_marks`, `duplicate_marks`,
`redundant_marks`, `before`, `after`, `facts_before`, `facts_after`, `candidates`,
`branch_proof`, `candidate_pool`, `candidate_count`, `cost`, component/step counts, statistics, verifier counters,
final lamp coordinates, diagrams, display states, or `inference_model`/`grouping`.
The version already fixes the inference model. All these other values can be
reconstructed and would create competing representations if stored.

The solver's in-memory diagnostic trace and the viewer's derived view model are
not wire schemas. They may cache intersections, costs, snapshots and evidence for
interaction. These caches never override `actions` or get exported as v8 fields.

### Display contract

Common facts and Marks to commit both use `actions`. A selected component shows
only actions it supports, filtered by the full batch's canonical actions. Branch
exploration may show hypotheses and computed direct effects; these are not
committed actions. Common facts preserves the committed symbols from Before; proved Lamps do not
remove underlying Marks until After actually commits the actions. All phases use
one physical-state rule: Lamp takes precedence, then Lit, then an unlit Mark.
Explore applies this rule to the hypothetical position while leaving background
lighting committed. Its new Lit cells use empty rounded dashed frames, with no
Mark effect labels. The committed layer is independently drawn from the before
state: a committed Mark remains underneath hypothetical light until an actual
commit. The explored layer is above committed symbols; candidate Marks covered
by hypothetical light do not create an extra blue X. Center and Conflict badges
are above all these layers and share geometry and the top-left label position.
Number text, including negative remaining counts, is below committed symbols.
These are rendering layers, not additional facts or actions in the protocol.
A center label describes its pre-step premise, not its hypothetical cell state.
Internal `constraint_effects` encode Boolean exclusions for proof intersection;
`direct_effects` encode physical branch effects. Legacy v6's `direct_effects`
are validated as Boolean constraints at its input boundary. Neither is an action
source or an additional wire field in v8. The initial 00
page and final End page do not add steps to the file.

## 2. Validation failures and budgets

All imports/catalog loads are checked in a browser Worker, locally. No file is
uploaded. Invalid JSON, version, root fields or geometry fail the load. A bad
step preserves the previously validated prefix and creates one diagnostic page
for that step. Subsequent steps are excluded, even if a later correction might
repair the state. Export excludes rejected steps. Invalid and unverified banners
are created only for failures; a successful replay has no validation banner.

Default limits are 8 million work units, about 8 seconds, and 100000 combinations
per component. Budget exhaustion is **unverified**, not invalid. A 15-second hard
Worker timeout fails the load. A partial proof is never accepted as complete.

## 3. Existing input formats

Legacy v7 remains input-only with its original center-product semantics. The
viewer may flatten and deduplicate those old partial assignments for display,
but it must not revalidate a v7 proof using v8 pool semantics. Saved v7 fixtures
cover both daily puzzles. New outputs use v8 with the same compact wire shape;
the version specifies the different reconstruction algorithm, so no redundant
candidate pool or second action map is stored.

Legacy strict-local v6 (and the v5 naming adapter) remains **input-only** compatible.
Its supplied candidate/evidence/snapshot fields are checked before playback;
missing legacy enumeration data yields action-only display plus necessity checks.
Old closure/sequential v4 reports remain unsupported. New solver outputs must use
v8. `tests/fixtures/legacy-v6-daily.json` exists only to test backward compatibility.

Generic action recordings retain `format: "akari-replay", version: 2`, `puzzle`,
optional `initial_marks`, and `steps: [{"marks": {"(1,1)": "Lamp"}}]`.
`null` removes a mark; replacements, guesses with a legal continuation, and
annotation-only frames are allowed. These are not strict deductions. Legacy
optional snapshots are checked if present; new action exports omit them.

Final-only answers retain `format: "akari-solution", version: 2`, `puzzle`, and
`lamps: [[1,1],[2,2]]`. They show one action frame and require a complete legal
layout. They do not fabricate a proof sequence. Generic v2 may carry an existing
`proof: {"format":"strict-local-v6","event":...}` for legacy integration;
new strict integrations should emit v8 directly instead of duplicating actions
inside an attached proof.

**Export actions** outputs generic v2 with a single grid, actual action changes,
optional notes and one computed completion flag. It omits proof evidence,
snapshots, duplicate geometry, empty initial state and generated boilerplate notes.
It is an action export, not a proof export. Preserve the original v8 file to share
reconstructible strict evidence.

## 4. Static replay catalog

`web/replays.json` has `version:1`, `defaultReplay`, and `replays` entries:

```json
{"id":"daily-649-proof", "title":"Strict proof", "solution":"../results/daily-2026-10-16.json"}
```

`id` is unique (1–80 letters/digits/underscores/hyphens), `title` and `solution`
are required. `puzzleTitle`, `puzzle` (external original), and `reference` (bitmap)
are optional. Paths are same-origin HTTP(S), relative to the catalog URL. Daily
entries omit `puzzle` because v8 already embeds geometry. The `?replay=ID` query
selects an entry; unknown IDs fall back to the default. Importing a local file does
not modify the catalog. Reference images do not perform OCR or execute code.
