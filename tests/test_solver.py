import itertools
import json
import random
import unittest
from pathlib import Path

from akari_solver import (
    AkariHumanSolver, Center, Contradiction, SearchLimit, parse_puzzlink, illuminated, render,
)
from akari_solver.exact_verifier import ExactVerifier, UnsoundMarkError

ROOT = Path(__file__).resolve().parents[1]


def read_marks(mapping):
    return {tuple(int(v) - 1 for v in key.strip("()").split(",")): mark
            for key, mark in mapping.items()}


def brute_solutions(grid):
    """Test-only exhaustive oracle independent of BOTH solver implementations."""
    cells = [(r, c) for r, row in enumerate(grid)
             for c, value in enumerate(row) if value == -1]
    whites = set(cells)
    for bits in itertools.product((False, True), repeat=len(cells)):
        lamps = {cell for cell, bit in zip(cells, bits) if bit}
        lit = set(lamps)
        valid = True
        for r, c in lamps:
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                rr, cc = r + dr, c + dc
                while (rr, cc) in whites:
                    if (rr, cc) in lamps:
                        valid = False
                    lit.add((rr, cc))
                    rr, cc = rr + dr, cc + dc
        if not valid or lit != whites:
            continue
        for r, row in enumerate(grid):
            for c, value in enumerate(row):
                if value >= 0 and sum(x in lamps for x in
                        ((r-1, c), (r+1, c), (r, c-1), (r, c+1))) != value:
                    valid = False
        if valid:
            yield {cell: "Lamp" if cell in lamps else "Mark" for cell in cells}


class SolverTests(unittest.TestCase):
    def old_step2(self):
        data = json.loads((ROOT / "data/old-step2-start.json").read_text())
        return AkariHumanSolver(parse_puzzlink(data["puzzlink"])), read_marks(data["marks"])

    def test_single_center_cannot_use_another_number_or_coverage(self):
        solver, base = self.old_step2()
        domains = dict(solver.centers(base))
        center = Center("number", (1, 4))
        self.assertEqual(len(domains[center]), 2)
        step = solver.evaluate(base, [(center, domains[center])])
        self.assertEqual(step.cost, 2)
        self.assertEqual(step.branches, 2)
        # Both alternatives directly light (1,6). Neither lamp is determined.
        self.assertEqual(step.new_marks, {(0, 5): "Mark"})
        self.assertNotIn((1, 5), step.new_marks)
        self.assertNotIn((0, 7), step.new_marks)

    def test_two_number_centers_cost_four_then_separate_coverage(self):
        solver, base = self.old_step2()
        domains = dict(solver.centers(base))
        cs = [Center("number", (1, 4)), Center("number", (1, 6))]
        step = solver.evaluate(base, [(c, domains[c]) for c in cs])
        self.assertEqual(step.candidate_counts, (2, 2))
        self.assertEqual(step.cost, 4)
        self.assertEqual(step.new_marks[(1, 5)], "Lamp")
        self.assertNotIn((0, 7), step.new_marks)  # NO automatic (1,8) lamp
        actions = solver.actions_for(base, step.new_marks)
        solver.verifier.verify_batch(base, actions)
        after = {**base, **actions}
        domains = dict(solver.centers(after))
        coverage = Center("mark", (0, 4))
        followup = solver.evaluate(after, [(coverage, domains[coverage])])
        self.assertEqual(followup.cost, 1)
        self.assertEqual(followup.new_marks[(0, 7)], "Lamp")
        solver.verifier.verify_batch(after, solver.actions_for(after, followup.new_marks))

    def test_candidates_have_exactly_the_allowed_scope(self):
        solver, base = self.old_step2()
        for center, candidates in solver.centers(base):
            for candidate in candidates:
                if center.kind == "number":
                    self.assertTrue(set(candidate) <= set(solver.clue_neighbors(*center.cell)))
                else:
                    self.assertEqual(len(candidate), 1)
                    self.assertEqual(set(candidate.values()), {"Lamp"})
                    self.assertTrue(set(candidate) <= set(solver.visibility[center.cell]))
                    if center.kind == "mark":
                        self.assertNotIn(center.cell, candidate)

    def test_unselected_number_is_not_used_to_filter_domain_or_branch(self):
        # Coverage for the middle cell must retain the left lamp even though
        # the UNSELECTED zero clue would forbid it.
        solver = AkariHumanSolver([[0, -1, -1, -1]])
        c = Center("empty", (0, 2))
        candidates = dict(solver.centers({}))[c]
        self.assertIn({(0, 1): "Lamp"}, candidates)
        self.assertEqual(len(candidates), 3)
        self.assertIsNone(solver.evaluate({}, [(c, candidates)]))
        self.assertFalse(hasattr(solver, "closure"))

    def test_singleton_number_does_not_complete_other_center(self):
        solver = AkariHumanSolver([[0, -1], [-1, -1]])
        c = Center("number", (0, 0))
        step = solver.evaluate({}, [(c, dict(solver.centers({}))[c])])
        self.assertEqual(step.cost, 1)
        self.assertEqual(step.new_marks, {(0, 1): "Mark", (1, 0): "Mark"})
        history = solver.solve()
        self.assertEqual(solver.status, "solved")
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["type"], "brain")
        self.assertEqual(history[0]["cost"], 1)
        self.assertNotIn("components", history[0])
        self.assertEqual(read_marks(history[0]["new_marks"]), step.new_marks)
        self.assertEqual(read_marks(history[1]["new_marks"]), {(1, 1): "Lamp"})
        self.assertTrue(all(c["before"] == history[1]["before"] for c in history[1]["components"]))
        # Do not delete earlier marks just because the later lamp lights them.
        self.assertEqual(solver.marks, {(0, 1): "Mark", (1, 0): "Mark", (1, 1): "Lamp"})

    def test_coverage_alternatives_overlap_and_do_not_exclude_each_other(self):
        solver = AkariHumanSolver([[-1, -1], [-1, -1]])
        center = Center("empty", (0, 0))
        candidates = dict(solver.centers({}))[center]
        self.assertIn({(0, 1): "Lamp"}, candidates)
        on, off = solver._direct_effect({(0, 1): "Lamp"})
        self.assertNotIn((1, 0), solver._decode(on, off))
        for solution in brute_solutions(solver.grid):
            self.assertTrue(any(all(solution[k] == v for k, v in a.items()) for a in candidates))

    def test_joint_centers_can_prove_mark_beyond_their_neighbors(self):
        fixture = json.loads((ROOT / "data/joint-x-regression.json").read_text())
        solver = AkariHumanSolver(fixture["grid"])
        base = {(r, c): v for r, c, v in fixture["marks"]}
        domains = dict(solver.centers(base))
        selected = [(Center(kind, tuple(cell)), domains[Center(kind, tuple(cell))])
                    for kind, cell in fixture["centers"]]
        for entry in selected:
            self.assertIsNone(solver.evaluate(base, [entry]))
        step = solver.evaluate(base, selected)
        self.assertEqual(step.cost, 4)
        self.assertEqual(step.new_marks, {(4, 6): "Mark", (9, 7): "Mark"})
        self.assertEqual(set(step.new_marks.values()), {"Mark"})
        self.assertEqual(len(step.proof), len({json.dumps(p["assumptions"], sort_keys=True) for p in step.proof}))
        solver.verifier.verify_batch(base, step.new_marks)

    def test_ambiguous_board_never_guessed_and_no_vacuous_proof(self):
        solver = AkariHumanSolver([[-1, -1]])
        history = solver.solve()
        self.assertEqual(solver.status, "stuck")
        self.assertEqual(solver.marks, {})
        json.dumps(history)
        with self.assertRaises(UnsoundMarkError):
            solver.verifier.verify_batch({}, {(0, 0): "Lamp", (0, 1): "Mark"})
        with self.assertRaises(Contradiction):
            solver.evaluate({}, [(Center("number", (0, 0)),
                                  [{(0, 0): "Lamp", (0, 1): "Lamp"}])])

    def test_light_and_explicit_actions_remain_separate(self):
        solver = AkariHumanSolver([[-1, -1, -1]])
        solver.marks = {(0, 0): "Lamp"}
        self.assertEqual(solver.solve(), [])
        self.assertEqual(solver.status, "solved")
        self.assertEqual(solver.facts()[(0, 1)], "Mark")
        self.assertEqual(render(solver.grid, solver.marks), "Lamp Lit Lit")
        before = {(0, 1): "Mark"}
        after = {**before, **solver.actions_for(before, {(0, 0): "Lamp", (0, 2): "Mark"})}
        self.assertEqual(render(solver.grid, after), "Lamp Lit Lit")
        self.assertEqual(render([[-1, -2, -1, 0, -1]], {(0, 0): "Lamp"}), "Lamp Wall Empty Clue:Satisfied Empty")

    def test_branch_effects_distinguish_lit_from_no_lamp_constraints(self):
        solver = AkariHumanSolver([[-1, -1, -1]])
        before = {(0, 1): "Mark"}
        selected = [(Center("empty", (0, 0)),
                     [{(0, 0): "Lamp", (0, 2): "Mark"}])]
        step = solver.evaluate(before, selected)
        self.assertEqual(step.proof[0]["direct_effects"],
                         {"(1,1)": "Lamp", "(1,3)": "Lit"})
        self.assertEqual(step.proof[0]["constraint_effects"],
                         {"(1,1)": "Lamp", "(1,3)": "Mark"})
        self.assertEqual(solver.actions_for(before, step.new_marks), {(0, 0): "Lamp"})
        self.assertEqual(solver.state({**before, (0, 0): "Lamp"}),
                         {(0, 0): "Lamp", (0, 1): "Lit", (0, 2): "Lit"})
        self.assertEqual(before, {(0, 1): "Mark"})

    def test_pool_combinations_ignore_order_and_leave_other_cells_undecided(self):
        solver = AkariHumanSolver([[-1, -1], [-1, -1]])
        domains = dict(solver.centers({}))
        center = Center("empty", (0, 0))
        pool, candidates = solver.pool_candidates([(center, domains[center])])
        candidates = list(candidates)
        self.assertEqual(len(pool), 3)
        self.assertEqual(candidates, domains[center])
        self.assertTrue(all(len(a) == 1 and list(a.values()) == ["Lamp"] for a in candidates))
        # A+B and B+A collapse before physical evaluation, not just in the UI.
        choices = [{(0, 1): "Lamp"}, {(1, 0): "Lamp"}]
        selected = [(center, choices), (Center("empty", (1, 1)), list(reversed(choices)))]
        _, combinations = solver.pool_candidates(selected)
        combinations = list(combinations)
        self.assertEqual(len(combinations), 3)  # cost 2*2, but AB == BA
        self.assertEqual(sum(len(a) == 2 for a in combinations), 1)
        _, reversed_combinations = solver.pool_candidates(list(reversed(selected)))
        self.assertEqual({tuple(sorted(a.items())) for a in combinations},
                         {tuple(sorted(a.items())) for a in reversed_combinations})
        selected = [(center, [{(0, 1): "Lamp"}, {(0, 1): "Mark"}]),
                    (Center("empty", (1, 1)), [{(0, 1): "Lamp"}, {(0, 1): "Mark"}])]
        _, shared = solver.pool_candidates(selected)
        self.assertEqual(len(list(shared)), 2)

    def test_brain_search_returns_actions_not_covered_mark_constraints(self):
        for model in ('product', 'overlap-experimental'):
            solver = AkariHumanSolver([[-1, -1, -1]], cost_model=model)
            selected = [(Center('empty', (0, 0)), [{(0, 0): 'Lamp'}])]
            step = solver.evaluate({}, selected)
            self.assertEqual(step.new_marks, {(0, 0): 'Lamp'})
            self.assertEqual(step.proof[0]['constraint_effects']['(1,2)'], 'Mark')
            self.assertEqual(step.proof[0]['direct_effects']['(1,2)'], 'Lit')
            # Explicit local Mark assumptions covered by a common Lamp are also
            # discarded before the search returns its BrainStep.
            selected[0][1][0][(0, 1)] = 'Mark'
            self.assertEqual(solver.evaluate({}, selected).new_marks, {(0, 0): 'Lamp'})

    def test_resource_limits_are_not_no_solution_claims(self):
        solver = AkariHumanSolver([[-1, -1]], max_combinations=1)
        self.assertEqual(solver.solve()[-1]["type"], "search_limit")
        solver = AkariHumanSolver([[-1, -1]], max_branches=1)
        with self.assertRaises(SearchLimit):
            solver.find_brain_step({})

    def test_pending_fast_group_survives_termination(self):
        for cap, expected in ((1, "search_limit"), (100, "stuck")):
            # Isolated single lamp, then an independent ambiguous two-cell run.
            solver = AkariHumanSolver([[-1, -2, -1, -1]], max_combinations=cap)
            history = solver.solve()
            self.assertEqual(solver.status, expected)
            self.assertEqual(history[0]["type"], "brain")
            self.assertEqual(history[0]["component_count"], 1)
            self.assertEqual(history[0]["new_marks"], {"(1,1)": "Lamp"})
            self.assertEqual(history[1]["type"], expected)
            json.dumps(history)

    def test_heap_matches_exhaustive_subset_search(self):
        solver = AkariHumanSolver([[-1, 1, -1], [-1, -1, -1]])
        entries = solver.centers({})
        keys = []
        for size in range(1, len(entries)+1):
            for selected in itertools.combinations(entries, size):
                step = solver.evaluate({}, list(selected))
                if step:
                    keys.append((step.cost, len(step.centers)))
        found = solver.find_brain_step({})
        self.assertEqual((found.cost, len(found.centers)), min(keys))

    def test_random_small_board_domain_coverage_and_soundness(self):
        rng = random.Random(20261015)
        grids = [[[-1] * 3 for _ in range(2)]]
        for _ in range(35):
            grids.append([[rng.choice([-1, -1, -1, -2, 0, 1]) for _ in range(3)] for _ in range(2)])
        for grid in grids:
            solutions = list(brute_solutions(grid))
            solver = AkariHumanSolver(grid)
            self.assertEqual(solver.verifier.solution({}) is not None, bool(solutions))
            if not solutions:
                with self.assertRaises(Contradiction):
                    solver.solve()
                continue
            entries = solver.centers({})
            for _, candidates in entries:
                for s in solutions:
                    self.assertTrue(any(all(s[k] == v for k, v in a.items()) for a in candidates))
            for size in (1, 2):
                for selected in itertools.combinations(entries, size):
                    step = solver.evaluate({}, list(selected))
                    if step:
                        for s in solutions:
                            self.assertTrue(all(s[k] == v for k, v in step.new_marks.items()))

    def test_daily_every_step_sound_minimal_and_has_no_unpaid_propagation(self):
        data = json.loads((ROOT / "data/daily-2026-10-15.json").read_text())
        solver = AkariHumanSolver(parse_puzzlink(data["puzzlink"]))
        history = solver.solve()
        self.assertEqual(solver.status, "solved")
        self.assertEqual(len(history), 26)
        self.assertEqual([e["step"] for e in history], list(range(1, 27)))
        self.assertEqual(len(solver.facts()), 72)
        self.assertEqual(sum(v == "Lamp" for v in solver.marks.values()), 17)
        replay = {}
        for event in history:
            self.assertEqual(read_marks(event["before"]), replay)
            base = solver.facts(replay)
            entries = solver.centers(base)
            self.assertEqual(event["type"] == "fast_mark", event["component_count"] > 1)
            parts = event["components"] if event["type"] == "fast_mark" else [event]
            if event["type"] == "fast_mark":
                expected = [c.label() for c, a in entries if len(a) == 1
                            and solver.evaluate(base, [(c, a)]) is not None]
                self.assertEqual(event["centers"], expected)
            union = {}
            contributed = {}
            for part in parts:
                self.assertEqual(part["before"], event["before"])
                self.assertEqual(part["facts_before"], event["facts_before"])
                chosen = [x for label in part["centers"] for x in entries if x[0].label() == label]
                recomputed = solver.evaluate(base, chosen)
                self.assertEqual(read_marks(part["conclusions"]), recomputed.new_marks)
                self.assertEqual(len(part["branch_proof"]), part["candidate_count"])
                self.assertLessEqual(part["candidate_count"], part["cost"])
                solver.verifier.verify_batch(replay, recomputed.new_marks)
                for cell, v in recomputed.new_marks.items():
                    if cell in union:
                        self.assertEqual(union[cell], v)
                    union[cell] = v
                self.assertFalse(contributed.keys() & part["new_marks"].keys())
                contributed.update(part["new_marks"])
            actions = read_marks(event["new_marks"])
            self.assertTrue(actions)
            self.assertEqual(actions, solver.actions_for(replay, union))
            self.assertEqual(contributed, event["new_marks"])
            solver.verifier.verify_batch(replay, actions)
            if event["type"] == "brain":
                expected_key = (event["cost"], len(event["centers"]))
                for size in (1, 2):
                    for selected in itertools.combinations(entries, size):
                        cost = 1
                        for _, a in selected:
                            cost *= len(a)
                        if (cost, size) < expected_key:
                            self.assertIsNone(solver.evaluate(base, list(selected)))
            replay.update(actions)
            self.assertEqual(read_marks(event["after"]), replay)
            self.assertEqual(event["board_after"], render(solver.grid, replay))
        self.assertEqual(replay, solver.marks)
        json.dumps(history)

    def test_same_state_duplicates_and_incomplete_scan(self):
        # Both numbers independently prove the same lamp from the original state.
        solver = AkariHumanSolver([[1, -1, 1]])
        event = solver.solve()[0]
        self.assertEqual(event["type"], "fast_mark")
        self.assertEqual(event["component_count"], 3)  # includes empty-cell coverage
        self.assertEqual(event["new_marks"], {"(1,2)": "Lamp"})
        self.assertEqual(event["components"][1]["new_marks"], {})
        self.assertEqual(event["components"][1]["duplicate_marks"], {"(1,2)": "Lamp"})
        self.assertTrue(all(c["before"] == {} for c in event["components"]))
        solver = AkariHumanSolver([[1, -1, 1]], max_combinations=1)
        self.assertEqual(solver.solve()[0]["type"], "search_limit")
        self.assertEqual(solver.marks, {})  # no partial commit of a frozen batch

    def test_batch_lamps_suppress_redundant_new_mark(self):
        solver = AkariHumanSolver([[0, -1, -1], [-2, -2, 1]])
        event = solver.solve()[0]
        self.assertEqual(event["new_marks"], {"(1,3)": "Lamp"})
        self.assertEqual(event["components"][0]["redundant_marks"], {"(1,2)": "Mark"})
        self.assertEqual(event["board_after"], "Clue:Satisfied Lit Lamp\nWall Wall Clue:Satisfied[original=1]")

    def test_remaining_clue_display_does_not_change_constraint(self):
        grid = [[-1, -1, -1], [-1, 2, -1], [-1, -1, -1]]
        self.assertIn("Clue:1[original=2]", render(grid, {(0, 1): "Lamp"}))
        self.assertIn("Clue:Satisfied[original=2]", render(grid, {(0, 1): "Lamp", (1, 0): "Lamp"}))
        self.assertIn("Clue:-1[original=2]", render(grid, {(0, 1): "Lamp", (1, 0): "Lamp", (2, 1): "Lamp"}))
        self.assertEqual(grid[1][1], 2)

    def test_parser_validation(self):
        for url in ("akari/0/1/g", "akari/1/1/?", "akari/1/1/zz"):
            with self.assertRaises(ValueError):
                parse_puzzlink(url)


if __name__ == "__main__":
    unittest.main()
