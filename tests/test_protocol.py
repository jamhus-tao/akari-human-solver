import json
from pathlib import Path
import subprocess
import sys
import unittest

from akari_solver import AkariHumanSolver, parse_puzzlink, diff
from akari_solver.protocol import make_report

ROOT = Path(__file__).resolve().parents[1]


class ProtocolTests(unittest.TestCase):
    def test_daily_files_are_canonical_and_match_current_solver(self):
        for day in ('2026-10-15', '2026-10-16'):
            puzzle = json.loads((ROOT / f'data/daily-{day}.json').read_text())
            solver = AkariHumanSolver(parse_puzzlink(puzzle['puzzlink']))
            history = solver.solve()
            report = make_report(puzzle, history)
            self.assertEqual(report, json.loads((ROOT / f'results/daily-{day}.json').read_text()))
            self.assertEqual(set(report), {'schema_version', 'puzzle', 'steps'})
            state = {}
            for step in report['steps']:
                self.assertEqual(set(step), {'actions', 'proofs', 'cost_expression'} | ({'proof_cost_expressions'} if len(step['proofs']) > 1 else set()))
                self.assertFalse(state.keys() & step['actions'].keys())
                state.update(step['actions'])
            self.assertEqual(state, diff({}, solver.marks))

    def test_cli_emits_v8_and_preserves_unsolved_exit_status(self):
        run = subprocess.run([sys.executable, '-B', str(ROOT / 'akari_human_solver.py'),
                              '--puzzlink', 'akari/2/1/h', '--json-output'],
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, 2)
        report = json.loads(run.stdout)
        self.assertEqual(report['schema_version'], 8)
        self.assertEqual(report['steps'], [])
        self.assertEqual(report['stop']['kind'], 'stuck')
        self.assertNotIn('status', report)
        self.assertNotIn('complete', report)

    def test_resume_records_initial_state_once(self):
        solver = AkariHumanSolver([[-1, -1]])
        initial = {(0, 0): 'Lamp'}
        solver.marks = initial.copy()
        report = make_report({'grid': solver.grid}, solver.solve(), diff({}, initial))
        self.assertEqual(report['initial_marks'], {'(1,1)': 'Lamp'})
        self.assertEqual(report['steps'], [])
        self.assertNotIn('stop', report)
