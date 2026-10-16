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
`python3 -m pip install -e .` optionally installs `akari-solve` and `akari-download`.
Use `python3 -m akari_solver --help` for all CLI options. Reproducible tests use
the saved puzzle geometry in `data/`.

## Download, then solve

Downloading and solving are separate commands. Only the downloader accesses
Daily Akari; the solver requires `--json` or `--puzzlink` and stays offline.

```sh
# 1. Download only the original puzzle JSON (today is the default).
python3 -B -m akari_solver.download --output results/puzzles/today.json

# 2. Solve that saved puzzle, without another network request.
python3 -B -m akari_solver --json results/puzzles/today.json \
  --output results/today-proof.json
```

The downloader accepts **one** selector, or none for today:

```sh
python3 -B -m akari_solver.download --today --output results/puzzles/today.json
python3 -B -m akari_solver.download --date 2026-10-16 --output results/puzzles/2026-10-16.json
python3 -B -m akari_solver.download --number 649 --output results/puzzles/649.json
```

`--today`, `--date`, and `--number` are mutually exclusive. The number is the
visible daily sequence number, not the site's internal `puzzleId`. Dates use
`YYYY-MM-DD`; the archive starts at number 1 on 2025-01-06. Date selection maps
to the archive number and verifies both returned fields before saving.
Unavailable, future or non-playable archive puzzles fail without substituting
today's puzzle. The site controls archive availability.

`--tz-offset MINUTES` sets UTC minus local time; the default `-480` is UTC+8.
Downloads use a 20-second request timeout and no automatic retries. Exit code
`1` means a download/network/response failure; `2` means invalid CLI arguments.
A failed fetch or invalid response leaves an existing destination untouched.
A successful download writes the original puzzle JSON, retaining site metadata.

Implementation: [`akari_solver/download.py`](akari_solver/download.py).
Python callers can import `fetch_today`, `fetch_date`, or `fetch_number` from
that module. `from akari_solver import fetch_today` remains a compatibility API.
After `pip install -e .`, equivalent commands are `akari-download` and
`akari-solve`. Their `--output` arguments save **puzzle JSON** and **proof JSON**,
respectively. The old combined solver `--today` option has been removed; use the
two commands above. `--puzzlink` is parsed locally and does not fetch a URL.

To view a proof without running your own service, open the hosted replay page,
choose **Import files**, select the proof as **Solver output**, leave **Original
board** empty, and click **Open replay**. Import stays in the browser.
`tools/prepare_data.py` generates demos from saved inputs; it does not download
new puzzles or install a scheduled refresh job.

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

Temporary downloads, logs, screenshots and test artifacts belong under `output/`,
which is Git-ignored. Python tests use `output/tests/`; browser tests write to
`output/playwright-results/` and `output/screenshots/`. Keep durable puzzle/proof
files in their explicit output destinations, separate from temporary artifacts.
