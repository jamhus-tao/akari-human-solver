#!/usr/bin/env python3
"""Serve only replay assets + input fixtures over loopback (not the whole repo)."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse

ROOT = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        decoded = unquote(urlsplit(path).path)
        target = (ROOT / decoded.lstrip('/')).resolve()
        allowed = any(target.is_relative_to(ROOT / name) for name in ('web', 'data', 'results'))
        if not allowed or any(part in ('node_modules', 'reference', '.git') for part in target.parts):
            return str(ROOT / '__not_served__')
        if target.is_dir():
            return str(target / 'index.html')
        return str(target)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        super().end_headers()
    def do_GET(self):
        if self.path == '/':
            self.send_response(302); self.send_header('Location', '/web/'); self.end_headers(); return
        super().do_GET()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    print(f'Akari replay: http://127.0.0.1:{args.port}/web/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
