"""Strict local inference with a shared heap search for all cost functions."""
from __future__ import annotations

import heapq
import itertools
from dataclasses import dataclass

from .board import Cell, Action, diff, illuminated, render
from .cost_models import COST_FUNCTIONS
from .exact_verifier import ExactVerifier
from .terminology import cell_states, position_state

@dataclass(frozen=True)
class Center:
    kind: str  # empty, mark, number
    cell: Cell

    def label(self) -> str:
        r, c = self.cell
        return f"{self.kind}@({r + 1},{c + 1})"


@dataclass
class BrainStep:
    centers: tuple[Center, ...]
    candidate_counts: tuple[int, ...]
    cost: int
    new_marks: dict[Cell, Action]
    branches: int
    proof: list[dict]
    candidate_pool: tuple[Cell, ...]


class Contradiction(ValueError):
    """A direct Akari rule disproves a partial assignment."""


class SearchLimit(RuntimeError):
    """An explicit resource cap was reached, NOT proof of no next step."""


class AkariHumanSolver:
    """Strict local-center enumeration. NO branch propagation/closure.

    Only selected center domains and the direct rays of assumed lamps are
    combined. Reading an unselected number/coverage constraint is forbidden.
    """

    def __init__(self, grid: list[list[int]], max_combinations: int = 200_000,
                 max_branches: int = 200_000, cost_model: str = "product"):
        if not grid or not grid[0] or any(len(row) != len(grid[0]) for row in grid):
            raise ValueError("grid must be a nonempty rectangle")
        if any(v not in (-2, -1, 0, 1, 2, 3, 4) for row in grid for v in row):
            raise ValueError("invalid grid value")
        if max_combinations < 1 or max_branches < 1:
            raise ValueError("search limits must be positive")
        if cost_model not in COST_FUNCTIONS:
            raise ValueError("unknown cost model")
        self.cost_model = cost_model
        self.cost_function = COST_FUNCTIONS[cost_model]
        self.grid = [list(row) for row in grid]
        self.rows, self.cols = len(grid), len(grid[0])
        self.white = {(r, c) for r, row in enumerate(grid)
                      for c, value in enumerate(row) if value == -1}
        self.cells = sorted(self.white)
        self.bits = {cell: 1 << i for i, cell in enumerate(self.cells)}
        self.marks: dict[Cell, Action] = {}
        self.max_combinations = max_combinations
        self.max_branches = max_branches
        self.status = "not_started"
        self.verifier = ExactVerifier(grid)
        self.visibility = {}
        self.ray_masks = {}
        self.last_search = {}
        for cell in self.cells:
            r, c = cell
            seen = [cell]
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                rr, cc = r + dr, c + dc
                while (rr, cc) in self.white:
                    seen.append((rr, cc))
                    rr, cc = rr + dr, cc + dc
            self.visibility[cell] = tuple(sorted(seen))
            self.ray_masks[cell] = sum(self.bits[x] for x in seen if x != cell)

    def clue_neighbors(self, r, c):
        return sorted(x for x in ((r-1, c), (r+1, c), (r, c-1), (r, c+1))
                      if x in self.white)

    def facts(self, marks=None):
        """Boolean lamp constraints, NOT cell states: Mark here means no lamp.

        Illumination and explicit Marks both forbid lamps. Keep this projection
        for branch intersection; use position_state for physical states.
        """
        marks = self.marks if marks is None else marks
        result = dict(marks)
        for cell in illuminated(self.grid, marks):
            result.setdefault(cell, "Mark")
        return result

    def state(self, marks=None):
        marks = self.marks if marks is None else marks
        return position_state(marks, illuminated(self.grid, marks))

    def actions_for(self, before, conclusions):
        state = self.state({**before, **conclusions})
        return {cell: value for cell, value in state.items()
                if cell not in before and value in ("Lamp", "Mark")}

    def is_solved(self):
        """Final-board validation only; never used to filter brain branches."""
        if illuminated(self.grid, self.marks) != self.white:
            return False
        lamps = {cell for cell, v in self.marks.items() if v == "Lamp"}
        if any((set(self.visibility[cell]) - {cell}) & lamps for cell in lamps):
            return False
        for r, row in enumerate(self.grid):
            for c, value in enumerate(row):
                if value >= 0 and sum(x in lamps for x in self.clue_neighbors(r, c)) != value:
                    return False
        return True

    def centers(self, marks):
        """Freeze domains from the pre-step state, without lookahead.

        Number: exact adjacent Lamp/Mark allocations using ONLY that number.
        Coverage: OR of individually visible lamp positions, not exactly-one.
        No candidates are filtered by other centers or by a SAT oracle. Even
        physically conflicting number allocations retain their raw cost and
        are refuted during evaluation, not silently removed from the domain.
        """
        base = self.facts(marks)
        result = []
        for r, row in enumerate(self.grid):
            for c, need in enumerate(row):
                if need < 0:
                    continue
                neighbors = self.clue_neighbors(r, c)
                unknown = [x for x in neighbors if x not in base]
                remaining = need - sum(base.get(x) == "Lamp" for x in neighbors)
                if remaining < 0 or remaining > len(unknown):
                    raise Contradiction(f"number({r+1},{c+1}) has empty local domain")
                if not unknown:
                    continue
                choices = []
                for lamps in itertools.combinations(unknown, remaining):
                    lamps = set(lamps)
                    choices.append({x: "Lamp" if x in lamps else "Mark" for x in unknown})
                result.append((Center("number", (r, c)), choices))
        lit = illuminated(self.grid, marks)
        for cell in self.cells:
            if cell in lit:
                continue
            choices = [{lamp: "Lamp"} for lamp in self.visibility[cell] if lamp not in base]
            if not choices:
                raise Contradiction(f"coverage({cell[0]+1},{cell[1]+1}) has empty local domain")
            kind = "mark" if base.get(cell) == "Mark" else "empty"
            result.append((Center(kind, cell), choices))
        return result

    def _masks(self, marks):
        on = off = 0
        for cell, value in marks.items():
            if cell not in self.bits or value not in ("Lamp", "Mark"):
                raise ValueError("invalid Lamp/Mark assignment")
            if value == "Lamp":
                on |= self.bits[cell]
            else:
                off |= self.bits[cell]
        return on, off

    def _direct_effect(self, assignments):
        """ONLY Lamp/Mark assumptions plus direct exclusion along each lamp ray."""
        on, off = self._masks(assignments)
        for cell, value in assignments.items():
            if value == "Lamp":
                off |= self.ray_masks[cell]
        return on, off

    def _decode(self, on, off):
        return {cell: "Lamp" if on & self.bits[cell] else "Mark" for cell in self.cells
                if (on | off) & self.bits[cell]}

    def pool_candidates(self, selected):
        """Combine local hypotheses as unordered sets, deduplicating each stage.

        Missing positions stay undecided. A coverage choice contributes only its
        selected Lamp, never Marks or extra lamps at other pool positions.
        Equivalent center orders/assignments reach the same canonical set once.
        """
        pool = tuple(sorted({cell for _, choices in selected for a in choices for cell in a}))
        combinations = {(): {}}
        work = 0
        for _, choices in selected:
            next_combinations = {}
            for partial in combinations.values():
                for choice in choices:
                    work += 1
                    if work > self.max_branches * (len(selected) + 1):
                        raise SearchLimit("pooled combination search exceeds work cap")
                    if any(cell in partial and partial[cell] != value for cell, value in choice.items()):
                        continue
                    combined = {**partial, **choice}
                    signature = tuple(sorted(combined.items()))
                    next_combinations.setdefault(signature, dict(signature))
                    if len(next_combinations) > self.max_branches:
                        raise SearchLimit("unique pooled combinations exceed branch cap")
            combinations = next_combinations
        return pool, iter(combinations.values())

    def cost_details(self, selected):
        return self.cost_function(selected)

    def _evaluate(self, base, selected, capture=False):
        """Intersect each unique pooled assignment once; cost stays center-based."""
        counts = tuple(len(choices) for _, choices in selected)
        if not selected or any(n == 0 for n in counts):
            raise ValueError("select at least one nonempty center domain")
        cost = self.cost_details(selected)["cost"]
        if cost > self.max_branches:
            raise SearchLimit(f"next brain cost {cost} exceeds branch cap {self.max_branches}")
        base_on, base_off = self._direct_effect(base)
        if base_on & base_off:
            raise Contradiction("pre-step lamps/marks physically conflict")
        common = None
        survivors = 0
        proof = []
        pool, candidates = self.pool_candidates(selected)
        for assumed in candidates:
            a_on, a_off = self._direct_effect(assumed)
            on, off = base_on | a_on, base_off | a_off
            conflict = on & off
            record = {"assumptions": diff({}, assumed),
                      "status": "conflict" if conflict else "compatible"}
            if conflict:
                if capture:
                    record["conflict_cells"] = [[r+1, c+1] for (r, c), bit in self.bits.items()
                                                if conflict & bit]
                    proof.append(record)
                continue
            survivors += 1
            new_on, new_off = on & ~base_on, off & ~base_off
            common = (new_on, new_off) if common is None else (
                common[0] & new_on, common[1] & new_off)
            if capture:
                constraints = self._decode(new_on, new_off)
                state = self.state(self._decode(on, off))
                record.update(constraint_effects=diff({}, constraints),
                              direct_effects=diff({}, {cell: state[cell] for cell in constraints}))
                proof.append(record)
            elif common == (0, 0):
                return None
        if not survivors:
            raise Contradiction("every pooled assignment physically conflicts")
        if common == (0, 0):
            return None
        # Constraints support intersection; the search result contains only
        # actionable conclusions. Lamp rays must not escape as new Mark actions.
        actions = self.actions_for(base, self._decode(*common))
        if not actions:
            return None
        return BrainStep(tuple(c for c, _ in selected), counts, cost, actions, survivors, proof, pool)

    def evaluate(self, base, selected):
        return self._evaluate(self.facts(base), selected, capture=True)

    def find_brain_step(self, marks):
        steps = self.find_mark_batch(marks)
        return steps[0] if steps else None

    def find_mark_batch(self, marks):
        base = self.facts(marks)
        entries = self.centers(base)
        # One heap strategy for every scorer. The cost function is selected at init.
        heap = [(self.cost_details([entry])["cost"], 1, (i,))
                for i, entry in enumerate(entries)]
        heapq.heapify(heap)
        examined = 0
        fast = []

        def record(key=None):
            self.last_search = {"examined_center_sets": examined,
                                "cost_model": self.cost_model,
                                "strategy": "heap_first_productive",
                                "optimality_proven": False}
            if key is not None:
                self.last_search["selected_key"] = list(key)

        # Preserve independent singleton cost-one batching against the same state.
        while heap and heap[0][0] == 1:
            if examined >= self.max_combinations:
                record()
                raise SearchLimit("cost-one scan incomplete; no partial batch committed")
            _, _, ids = heapq.heappop(heap)
            examined += 1
            step = self._evaluate(base, [entries[ids[0]]], capture=True)
            if step:
                fast.append(step)
        if fast:
            record((1, 1))
            self.last_search.update(independent_results=len(fast), shared_base=True)
            return fast
        while heap:
            if examined >= self.max_combinations:
                record()
                raise SearchLimit(f"heap search reached center-set limit; next cost={heap[0][0]}")
            cost, size, ids = heapq.heappop(heap)
            examined += 1
            selected = [entries[i] for i in ids]
            step = self._evaluate(base, selected)
            if step:
                record((cost, size))
                return [self._evaluate(base, selected, capture=True)]
            # Extend only nonproductive sets. Child cost must be recomputed because
            # overlap discounts are not multiplicative and may lower the score.
            for j in range(ids[-1] + 1, len(entries)):
                child = ids + (j,)
                child_cost = self.cost_details([entries[i] for i in child])["cost"]
                heapq.heappush(heap, (child_cost, size + 1, child))
        record()
        return None

    def solve(self):
        history = []
        if self.verifier.solution(self.marks) is None:
            self.status = "contradiction"
            raise Contradiction("initial marked state has no complete solution")
        while not self.is_solved():
            before = dict(self.marks)
            base = self.facts(before)
            try:
                steps = self.find_mark_batch(base)
            except SearchLimit as error:
                self.status = "search_limit"
                history.append({"type": "search_limit", "reason": str(error)})
                return history
            if not steps:
                self.status = "stuck"
                history.append({"type": "stuck", "reason": "no productive center set in the strict model"})
                return history
            conclusions = {}
            components = []
            domains = dict(self.centers(base))
            for index, step in enumerate(steps, 1):
                for cell, value in step.new_marks.items():
                    if cell in conclusions and conclusions[cell] != value:
                        raise Contradiction("independent proofs disagree; batch not committed")
                    conclusions[cell] = value
                components.append({
                    "component": index, "cost": step.cost,
                    "centers": [c.label() for c in step.centers],
                    "candidate_pool": [f"({r+1},{c+1})" for r, c in step.candidate_pool],
                    "candidate_count": len(step.proof),
                    "candidate_counts": list(step.candidate_counts),
                    "compatible_combinations": step.branches, "branch_proof": step.proof,
                    "before": diff({}, before), "facts_before": diff({}, base),
                    "conclusions": diff({}, step.new_marks),
                    "proposed_marks": diff({}, self.actions_for(before, step.new_marks)),
                })
                components[-1]["cost_details"] = self.cost_details(
                    [(center, domains[center]) for center in step.centers])
            # Normalize ONCE across the whole batch: deduplicate shared Lamp/Mark and
            # omit new marks illuminated by any independently proved new lamp.
            actions = self.actions_for(before, conclusions)
            if not actions:
                raise AssertionError("a mark step must submit at least one Lamp/Mark action")
            attributed = set()
            for component in components:
                proposed = component["proposed_marks"]
                contributed, duplicate, redundant = {}, {}, {}
                for label, value in proposed.items():
                    cell = tuple(int(v)-1 for v in label.strip("()").split(","))
                    if cell not in actions:
                        redundant[label] = value
                    elif cell in attributed:
                        duplicate[label] = value
                    else:
                        contributed[label] = value
                        attributed.add(cell)
                component.update(new_marks=contributed, duplicate_marks=duplicate,
                                 redundant_marks=redundant)
            # All proof checks use the identical pre-batch state, even for
            # results later filtered out as duplicate/redundant actions.
            audit = self.verifier.verify_batch(before, conclusions)
            audit["checked_actions"] = len(actions)
            self.marks.update(actions)  # The only commit, after all results exist.
            fast = steps[0].cost == 1 and len(components) > 1
            event = {
                "type": "fast_mark" if fast else "brain", "step": len(history)+1,
                "cost": steps[0].cost, "total_cost": sum(t.cost for t in steps),
                "component_count": len(components),
                "conclusions": diff({}, conclusions), "new_marks": diff(before, self.marks),
                "before": diff({}, before), "after": diff({}, self.marks),
                "facts_before": diff({}, base), "facts_after": diff({}, self.facts()),
                "illuminated_after": [list((r+1, c+1)) for r, c in sorted(illuminated(self.grid, self.marks))],
                "board_after": render(self.grid, self.marks),
                "cell_states_after": cell_states(self.grid, self.marks, illuminated(self.grid, self.marks)),
                "search": dict(self.last_search), "verification": audit,
            }
            if fast:
                event.update(components=components, cost_semantics="independent_cost_one_results",
                             centers=[c for part in components for c in part["centers"]])
            else:
                for key in ("centers", "candidate_pool", "candidate_count", "candidate_counts", "compatible_combinations", "branch_proof"):
                    event[key] = components[0][key]
            event["cost_model"] = self.cost_model
            if not fast:
                event["cost_details"] = components[0]["cost_details"]
            history.append(event)
        self.status = "solved"
        return history
