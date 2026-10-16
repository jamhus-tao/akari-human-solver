#!/usr/bin/env python3
"""Generate ignored demo reports and regression inputs from puzzle geometry.

Existing reports/fixtures are preserved unless --force is passed. No downloaded
answers or embedded daily solutions are used by this generator.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from akari_solver import AkariHumanSolver, parse_puzzlink
from akari_solver.protocol import make_report


def write(path, value, force=False):
    path = ROOT / path
    if path.exists() and not force:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def prepare(force=False, experimental=True):
    for day in ('2026-10-15', '2026-10-16'):
        puzzle = json.loads((ROOT / f'data/daily-{day}.json').read_text())
        solver = AkariHumanSolver(parse_puzzlink(puzzle['puzzlink']))
        history = solver.solve()
        if solver.status != 'solved':
            raise RuntimeError(f'Could not generate {day}: {solver.status}')
        report = make_report(puzzle, history)
        write(f'results/daily-{day}.json', report, force)
        legacy = json.loads(json.dumps(report))
        legacy['schema_version'] = 7
        for step in legacy['steps']:
            step.pop('cost_expression', None)
            step.pop('proof_cost_expressions', None)
        write(f'tests/fixtures/v7-daily-{day}.json', legacy, force)
        if day == '2026-10-15':
            write('data/old-step2-start.json', {'puzzlink': puzzle['puzzlink'],
                  'marks': history[0]['after']}, force)
            # Locate the joint two-number deduction by its selected constraints,
            # not an embedded answer or a fragile sequence index.
            labels = {'number@(6,8)', 'number@(9,7)'}
            joint = next(event for event in history if set(event['centers']) == labels)
            base = {tuple(int(x)-1 for x in cell.strip('()').split(',')): value
                    for cell, value in joint['before'].items()}
            write('data/joint-x-regression.json', {'grid': solver.grid,
                  'marks': [[r, c, v] for (r, c), v in sorted(base.items())],
                  'centers': [[label.split('@')[0], [int(x)-1 for x in label.split('@')[1].strip('()').split(',')]]
                              for label in joint['centers']]}, force)
        elif experimental:
            target = ROOT / 'results/experiments/daily-649-overlap.json'
            if force or not target.exists():
                subprocess.run([sys.executable, '-B', '-m', 'akari_solver', '--json',
                    f'data/daily-{day}.json', '--cost-model', 'overlap-experimental',
                    '--output', str(target), '--cost-output',
                    str(target.with_name('daily-649-overlap-cost.json'))], cwd=ROOT,
                    check=True, stdout=subprocess.DEVNULL)

    fixture = ROOT / 'tests/fixtures/legacy-v6-daily.json'
    if force or not fixture.exists():
        subprocess.run(['node', 'tools/prepare_legacy_fixture.mjs'], cwd=ROOT, check=True)
    prepare_examples(force)


def prepare_examples(force):
    grid = [[-1] * 2 for _ in range(2)]
    main = [f'({i+1},{i+1})' for i in range(2)]
    other = [f'({i+1},{2-i})' for i in range(2)]
    write('web/examples/manual.json', {'format': 'akari-replay', 'version': 2,
          'title': 'Manual diagonal lights', 'puzzle': {'grid': grid, 'author': 'Manual example'},
          'complete': True, 'steps': [{'marks': {cell: 'Lamp'}} for cell in main]}, force)
    write('web/examples/alternative.json', {'format': 'akari-replay', 'version': 2,
          'title': 'The other diagonal, with a correction', 'complete': True,
          'steps': [{'marks': {main[0]: 'Lamp'}}, {'marks': {main[0]: None}},
                    {'marks': {cell: 'Lamp' for cell in other}}]}, force)
    write('web/examples/final.json', {'format': 'akari-solution', 'version': 2,
          'title': 'Final coordinates only', 'puzzle': {'grid': grid},
          'lamps': [[i+1, i+1] for i in range(2)], 'complete': True}, force)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--force', action='store_true', help='regenerate existing generated files')
    parser.add_argument('--skip-experimental', action='store_true', help='skip the slower experimental replay')
    args = parser.parse_args()
    (ROOT / 'results/experiments').mkdir(parents=True, exist_ok=True)
    prepare(args.force, not args.skip_experimental)
    print('Local replay and regression data prepared (Git-ignored).')
