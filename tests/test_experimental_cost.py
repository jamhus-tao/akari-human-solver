import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from akari_solver import AkariHumanSolver, BrainStep, Center, SearchLimit
from akari_solver.protocol import make_report

ROOT = Path(__file__).resolve().parents[1]


class ExperimentalCostTests(unittest.TestCase):
    def solver(self, grid=None, **kwargs):
        return AkariHumanSolver(grid or [[-1, -1], [-1, -1]],
                                cost_model='overlap-experimental', **kwargs)

    def test_shared_points_balance_and_center_order_does_not_change_cost(self):
        choices = [{(0, 1): 'Lamp'}, {(1, 0): 'Lamp'}]
        selected = [(Center('empty', (0, 0)), choices),
                    (Center('empty', (1, 1)), choices)]
        details = self.solver().cost_details(selected)
        self.assertEqual(details['remaining_contributions'], [1, 1])
        self.assertEqual(details['cost'], 2)  # 1*1 + 2 - 1
        self.assertEqual(details['raw_product'], 4)
        self.assertEqual(details['shared_points'][0]['retained_by'], 'empty@(1,1)')
        self.assertEqual(details['shared_points'][1]['retained_by'], 'empty@(2,2)')
        reversed_details = self.solver().cost_details(selected[::-1])
        self.assertEqual(reversed_details['cost'], details['cost'])
        self.assertEqual(reversed_details['shared_points'], details['shared_points'])
        self.assertEqual(AkariHumanSolver(self.solver().grid).cost_details(selected)['cost'], 4)

    def test_zero_and_negative_remaining_use_identity_once_per_point(self):
        assignment = {(0, 1): 'Mark', (1, 0): 'Mark', (1, 1): 'Mark'}
        selected = [(Center('number', (0, 0)), [assignment]),
                    (Center('number', (1, 1)), [assignment])]
        details = self.solver().cost_details(selected)
        self.assertEqual(sum(details['remaining_contributions']), -1)
        self.assertEqual(details['factors'], [1, 1])
        self.assertEqual(details['cost'], 2)
        self.assertEqual(len(details['shared_points']), 3)
        # A position repeated in alternatives is still only one shared point.
        choices = [{(0, 1): 'Lamp'}, {(0, 1): 'Mark'}]
        d = self.solver().cost_details([(selected[0][0], choices), (selected[1][0], choices)])
        self.assertEqual(len(d['shared_points']), 1)
        self.assertEqual(d['cost'], 3)

    def test_search_stops_at_first_productive_pop_even_if_descendant_is_cheaper(self):
        solver = self.solver(max_combinations=1)
        entries = [(Center('empty', (0, i)), [{(0, 0): 'Lamp'}]*5) for i in range(3)]
        def details(selected):
            return {'cost': 3 if len(selected) == 3 else 5}
        def evaluate(base, selected, capture=False):
            return BrainStep(tuple(c for c, _ in selected), (5,)*len(selected),
                             details(selected)['cost'], {(0, 0): 'Lamp'}, 1, [], ((0, 0),))
        with patch.object(solver, 'centers', return_value=entries), patch.object(solver, 'cost_function', side_effect=details), patch.object(solver, '_evaluate', side_effect=evaluate) as calls:
            found = solver.find_mark_batch({})[0]
        self.assertEqual(found.cost, 5)
        self.assertEqual(found.centers, (entries[0][0],))
        self.assertEqual(calls.call_count, 2)  # evaluation plus proof capture
        self.assertEqual(solver.last_search['selected_key'], [5, 1])
        self.assertFalse(solver.last_search['optimality_proven'])
        self.assertNotIn('optimal_key', solver.last_search)

    def test_heap_recomputes_child_score_and_respects_search_limit(self):
        solver = self.solver()
        entries = [(Center('empty', (0, i)), [{(0, 0): 'Lamp'}]*5) for i in range(3)]
        visited = []
        def details(selected):
            ids = tuple(c.cell[1] for c, _ in selected)
            return {'cost': 2 if ids == (0, 1) else 5 if len(ids) == 1 else 9}
        def evaluate(base, selected, capture=False):
            ids = tuple(c.cell[1] for c, _ in selected)
            if not capture:
                visited.append(ids)
            if ids != (0, 1):
                return None
            return BrainStep(tuple(c for c, _ in selected), (5,)*len(selected),
                             2, {(0, 0): 'Lamp'}, 1, [], ((0, 0),))
        with patch.object(solver, 'centers', return_value=entries), patch.object(solver, 'cost_function', side_effect=details), patch.object(solver, '_evaluate', side_effect=evaluate):
            found = solver.find_mark_batch({})[0]
        self.assertEqual(found.cost, 2)
        self.assertEqual(visited, [(0,), (0, 1)])
        limited = self.solver(max_combinations=1)
        with patch.object(limited, 'centers', return_value=entries), patch.object(limited, 'cost_function', side_effect=details), patch.object(limited, '_evaluate', side_effect=evaluate):
            with self.assertRaises(SearchLimit):
                limited.find_mark_batch({})
        self.assertEqual(limited.marks, {})

    def test_mode_only_selects_cost_callable_for_search_evaluation_and_commit(self):
        from akari_solver.cost_models import product_cost, overlap_cost
        # Inject identical scoring into differently named modes. If any other
        # control flow depends on the mode, traces or resource behavior diverge.
        for score in (product_cost, overlap_cost):
            traces = []
            for model in ('product', 'overlap-experimental'):
                solver = AkariHumanSolver([[-1, 1, -1], [-1, -1, -1]], cost_model=model)
                solver.cost_function = score
                trace = solver.solve()
                for event in trace:
                    event.pop('cost_model', None)
                    event.get('search', {}).pop('cost_model', None)
                traces.append((trace, solver.marks, solver.status))
            self.assertEqual(traces[0], traces[1])
        for model in ('product', 'overlap-experimental'):
            solver = AkariHumanSolver([[0, -1], [-1, -1]], max_branches=1, cost_model=model)
            entries = solver.centers({})
            with patch.object(solver, 'cost_function', return_value={'cost': 2}):
                with self.assertRaises(SearchLimit):
                    solver.evaluate({}, [entries[0]])

    def test_cli_and_protocol_expressions_are_opt_in_and_record_model(self):
        output = Path(__file__).resolve().parents[1] / "output" / "tests"
        output.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=output) as tmp:
            cost_path = str(Path(tmp) / 'cost.json')
            run = subprocess.run([sys.executable, '-B', str(ROOT/'akari_human_solver.py'),
                '--puzzlink', 'akari/2/2/0i', '--cost-model', 'overlap-experimental',
                '--cost-output', cost_path, '--json-output'], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            report = json.loads(run.stdout)
            self.assertEqual(report['cost_model'], 'overlap-experimental')
            self.assertEqual(report['steps'][0]['cost_expression'], '1 + 1 - 1 = 1')
            self.assertEqual(len(report['steps'][1]['proof_cost_expressions']), 3)
            cost = json.loads(Path(cost_path).read_text())
            self.assertEqual(cost['cost_model'], 'overlap-experimental')
            self.assertEqual(cost['steps'][1]['proofs'][0]['center_penalty'], 0)
            default = AkariHumanSolver([[0, -1], [-1, -1]])
            normal = make_report({'grid': default.grid}, default.solve())
            self.assertNotIn('cost_model', normal)
            self.assertEqual(normal['steps'][0]['cost_expression'], '1 = 1')
        with self.assertRaises(ValueError):
            AkariHumanSolver([[-1]], cost_model='unknown')
