#!/usr/bin/env python3
"""Stamp the whole module graph, including Worker imports, with one content hash.

Run before deploying runtime changes; upload all web runtime files and index.html.
The same inputs always produce the same release, including after a second run.
"""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
paths = sorted([*(ROOT / 'web/src').glob('*.mjs'), ROOT / 'web/src/bootstrap.js',
                ROOT / 'web/index.html', ROOT / 'web/style.css'])
paths = [p for p in paths if p.name != 'playwright.config.mjs']
clean = {p: re.sub(r'\?v=[a-f0-9]+', '', p.read_text()) for p in paths}
release = hashlib.sha256(''.join(str(p.relative_to(ROOT)) + clean[p] for p in paths).encode()).hexdigest()[:16]
pattern = re.compile(r'''(["'])(\.?/?[\w./-]+\.(?:mjs|js|css))\1''')
for path, source in clean.items():
    path.write_text(pattern.sub(lambda m: f'{m[1]}{m[2]}?v={release}{m[1]}', source))
print(release)
