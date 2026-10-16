# Replay viewer

Run `python3 -B tools/prepare_data.py`, then
`python3 -B tools/serve.py --port 8765` from the project root. Open
`http://127.0.0.1:8765/web/`. Only `web/`, `data/`, and `results/` are served;
source code, dependency directories and downloaded references are blocked.

The catalog is `web/replays.json`. It offers standard and experimental 649
solutions plus small action-record examples. Catalog solution paths resolve
relative to the catalog. `?replay=ID` selects a saved replay. Reports are generated
locally and excluded from Git.

## Controls and states

- Timeline, arrows, scrubber and autoplay navigate steps; `00` is the initial
  state and the closing page shows `Done`. Padding follows total step digits.
- **Before** shows committed state. **Explore** previews a pooled candidate.
  **Common facts** adds proven actions over the unchanged committed layer.
  **After** applies the actual actions and their illumination.
- Candidates are unordered partial hypotheses, with four per page. Compatible
  candidates appear first. Unmentioned pool positions remain undecided.
- `Show each` enters independent Fast mark exploration; `Show batch` returns to
  the complete batch. The candidate panel appears only in Explore.
- Existing Marks remain visible under preview overlays. Explore Lamp/Mark use
  green; hypothetical Lit uses blue. Center and Conflict badges are above them.
- Enumeration centers shows only protocol-provided cost expressions. Missing
  expressions stay hidden. Numeric cost is validated independently.
- Original board opens puzz.link in a new tab. Local reference images open
  separately. There is no embedded original-site runtime or image recognition.

## Imports and validation

Imports are processed in a browser Worker; files are not uploaded to the server.
Supported formats: v8 proofs, legacy v7/v6 proofs, generic action v2 recordings,
and final-layout v2 answers. See [protocol](protocol.md) for exact fields.

Imported geometry must match any separately supplied puzzle. Invalid or unverified
input stops at a diagnostic frame; it cannot replace verified earlier actions.
Validation checks feasibility and forced actions, not minimum cost or uniqueness.
`Export actions` downloads accepted actions as generic v2; it is not a proof export.

## Development

Modules live in `web/src/`, UI markup/styles in `web/`, and tests in `web/tests/`.
Run `npm --prefix web ci`, then `npm --prefix web test` and
`npm --prefix web run test:browser`. Chrome is required by the browser config.
Tests generate ignored `output/screenshots/` and `output/playwright-results/`
directories at the project root.

Before deploying runtime changes, run `python3 tools/version_assets.py`; this
stamps the complete module graph, including the Worker, with one release ID.
Upload the complete runtime together to avoid mixing cached versions.
