# Akari Human Solver

A strict local Akari solver and browser replay viewer. The solver enumerates
hypotheses from selected centers; an independent verifier checks each committed
move. Ordinary and experimental costs share the same search implementation.

## Quick start

Requirements: Python 3.10+, Node.js 22+ and npm. Browser tests use Google Chrome.
The Python CLI has no third-party runtime dependencies.

```sh
# Solve a saved puzzle. Reports are local output and excluded from Git.
python3 -B -m akari_solver --json data/daily-2026-10-16.json \
  --output results/daily-2026-10-16.json

# Generate all demo reports and test fixtures, including the experimental replay.
python3 -B tools/prepare_data.py

# Start the local viewer at http://127.0.0.1:8765/web/
python3 -B tools/serve.py --port 8765
```

`python3 -B akari_human_solver.py ...` remains a compatible CLI entry point.
`python3 -m pip install -e .` optionally installs the `akari-solve` command.
Use `python3 -m akari_solver --help` for all CLI options. Reproducible tests use
the saved puzzle geometry in `data/`.

## Fetching puzzles

Fetching is implemented in [`akari_solver/puzzle.py`](akari_solver/puzzle.py),
through the public `fetch_today()` function. There is no separate crawler CLI.

```sh
# Fetch today's puzzle and solve it; --output saves a proof, not the raw puzzle.
python3 -B -m akari_solver --today --output results/today-proof.json
```

To fetch and save only the original puzzle JSON, without running the solver,
execute this from the project root:

```sh
python3 -B - <<'PY'
import json
from pathlib import Path
from akari_solver import fetch_today

puzzle = fetch_today()
output = Path("results/puzzles") / f"daily-{puzzle['dateKey']}.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(puzzle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(output)
PY
```

Use the printed path with `--json` to solve the saved puzzle later, for example
`python3 -B -m akari_solver --json results/puzzles/daily-2026-10-16.json`.
The filename uses the response's `dateKey`; confirm `dailyNumber` in the saved
JSON when identifying a puzzle. Files under `results/` stay excluded from Git.

Current behavior and limits:

- Sends one JSON request to `https://dailyakari.com/dailypuzzle`; it does not
  recognize screenshots or crawl the archive.
- Defaults to `fetch_today(tz_offset=-480)`, sending `X-Tz-Offset: -480` for
  UTC+8. The Python API accepts another offset; the CLI has no timezone option.
- Only the current daily puzzle is supported. There are no `--date`, `--number`
  or `--puzzle-id` selectors. `--json` reads local JSON (or inline JSON), not a URL.
- Uses a 20-second request timeout, with no automatic retries. Network, HTTP or
  invalid-JSON errors are reported; they do not trigger a fallback to a saved puzzle.
- Omitting all puzzle-source options also fetches today. Use `--json` or
  `--puzzlink` explicitly for offline/reproducible input, and choose one source.
- `tools/prepare_data.py` generates local demos from saved puzzle inputs; it does
  not fetch new puzzles or install a scheduled refresh job.

## Experimental cost

```sh
python3 -B -m akari_solver --json data/daily-2026-10-16.json \
  --cost-model overlap-experimental \
  --output results/experiments/daily-649-overlap.json \
  --cost-output results/experiments/daily-649-overlap-cost.json
```

The default is `--cost-model product`. The experiment discounts shared candidate
positions, then adds the number of centers minus one. Both use the same heap
search and return its first productive result. This does not certify global
minimum experimental cost. Exit code `2` means an unfinished search; inspect the
report's `stop` field. [Algorithm details](docs/algorithm.md).

## Tests

```sh
python3 -B tools/prepare_data.py
python3 -B -m unittest discover -s tests -q
npm --prefix web ci
npm --prefix web test
npm --prefix web run test:browser
```

Preparation creates missing files and preserves existing ones. Use `--force` to
regenerate everything, or `--skip-experimental` for faster Python/unit-test setup.
The full browser suite needs both 649 reports. Generated solutions and legacy
fixtures are intentionally not committed, including the small demo answer files.

## Layout

| Path | Responsibility |
| --- | --- |
| `akari_solver/` | Solver, cost functions, board state, puzzle input, verifier, protocol and CLI |
| `web/src/` | Browser modules and validation Worker |
| `web/assets/` | Required visual assets and provenance |
| `web/tests/`, `tests/` | Browser/JavaScript and Python tests |
| `data/` | Saved puzzle geometry; generated starting states stay ignored |
| `schemas/` | JSON protocol schemas |
| `tools/` | Local server, data generation and asset versioning |
| `docs/` | Algorithm, protocol, viewer, deployment and terminology |
| `results/` | Ignored local solutions and experimental diagnostics |

The public Python API is `from akari_solver import AkariHumanSolver, parse_puzzlink`.
`cost_models.py` selects the scoring function; it does not own search or commits.

## Further reading

- [Protocol and expression fields](docs/protocol.md)
- [Viewer controls and validation](docs/web.md)
- [Deployment and rollback](docs/deployment.md)
- [Terminology](docs/terminology.md)
- [Asset provenance](web/assets/STYLE-SOURCES.md)

Keep generated reports, credentials, caches and dependencies out of commits.
The example catalog points to local generated files; run preparation after a
fresh checkout before opening the viewer.
