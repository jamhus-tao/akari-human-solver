# Project working conventions

- Put task-created temporary files, investigation downloads, logs and screenshots
  under the project-root `output/` directory. Do not write task artifacts to `/tmp`.
- Keep generated solutions, histories, experimental diagnostics and fixture JSON
  out of Git. See `.gitignore`; generate missing demo/test data with
  `python3 -B tools/prepare_data.py`.
- Downloading and solving are separate commands. The solve path must stay offline.
- Ordinary and experimental scoring use the same search and commit implementation;
  select only the cost function when changing modes.
- Run focused checks for the change. For Python/protocol changes use
  `python3 -B -m unittest discover -s tests -q` and `npm --prefix web test`.
  Browser changes use `npm --prefix web run test:browser`.
- After browser runtime changes, run `python3 -B tools/version_assets.py` before
  deploying the complete versioned module graph.
