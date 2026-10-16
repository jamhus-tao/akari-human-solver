import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

from akari_solver import cli, download, fetch_today
from akari_solver.solver import AkariHumanSolver


class DownloadTests(unittest.TestCase):
    def puzzle(self):
        return {'puzzlink': 'akari/1/1/g', 'dateKey': '2026-10-16',
                'dailyNumber': 649, 'author': 'Example', 'extra': {'retained': True}}

    def test_fetch_preserves_original_json_and_sends_timezone(self):
        puzzle = self.puzzle()
        with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(puzzle).encode())) as request:
            self.assertEqual(download.fetch_today(0), puzzle)
        args, kwargs = request.call_args
        self.assertEqual(args[0].full_url, 'https://dailyakari.com/dailypuzzle')
        self.assertEqual(args[0].get_header('X-tz-offset'), '0')
        self.assertEqual(kwargs['timeout'], 20)
        with patch.object(download, 'fetch_today', return_value=puzzle) as fetch:
            self.assertEqual(fetch_today(), puzzle)
            fetch.assert_called_once_with(-480)

    def test_download_then_solve_saved_file_without_network(self):
        output = Path(__file__).resolve().parents[1] / "output" / "tests"
        output.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=output) as tmp:
            target = Path(tmp) / 'input' / 'puzzle.json'
            with patch('sys.argv', ['akari-download', '--today', '--output', str(target)]), \
                 patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(self.puzzle()).encode())), \
                 patch.object(AkariHumanSolver, 'solve', side_effect=AssertionError('Download must not solve')), \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(download.main(), 0)
            self.assertEqual(json.loads(target.read_text()), self.puzzle())
            for model in ('product', 'overlap-experimental'):
                report = Path(tmp) / f'{model}.json'
                with patch('sys.argv', ['akari-solve', '--json', str(target), '--cost-model', model,
                                        '--output', str(report)]), \
                     patch('urllib.request.urlopen', side_effect=AssertionError('Solve must stay offline')), \
                     contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(cli.main(), 0)
                self.assertEqual(json.loads(report.read_text())['steps'][0]['actions'], {'(1,1)': 'Lamp'})

    def test_solve_requires_one_explicit_source_and_never_fetches(self):
        for args in ([], ['--today'], ['--json', '{}', '--puzzlink', 'akari/1/1/g']):
            with patch('sys.argv', ['akari-solve', *args]), \
                 patch('urllib.request.urlopen', side_effect=AssertionError('No implicit download')), \
                 contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    cli.main()
                self.assertEqual(error.exception.code, 2)
        with patch('sys.argv', ['akari-solve', '--puzzlink', 'akari/1/1/g']), \
             patch('urllib.request.urlopen', side_effect=AssertionError('URL must be parsed offline')), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(), 0)

    def test_failed_download_does_not_replace_existing_input(self):
        output = Path(__file__).resolve().parents[1] / "output" / "tests"
        output.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=output) as tmp:
            target = Path(tmp) / 'puzzle.json'
            target.write_text('preserve existing file')
            for response in [URLError('offline'), b'not json', b'{}', b'{"puzzlink":"invalid"}']:
                options = {'side_effect': response} if isinstance(response, Exception) else {
                    'return_value': io.BytesIO(response)}
                with patch('sys.argv', ['akari-download', '--output', str(target)]), \
                     patch('urllib.request.urlopen', **options), contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as error:
                        download.main()
                    self.assertEqual(error.exception.code, 1)
                self.assertEqual(target.read_text(), 'preserve existing file')

    def test_download_cli_validates_required_output_and_timezone(self):
        for args in ([], ['--output', 'unused.json', '--tz-offset', '900']):
            with patch('sys.argv', ['akari-download', *args]), \
                 patch('urllib.request.urlopen', side_effect=AssertionError('Invalid CLI must not fetch')), \
                 contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    download.main()
                self.assertEqual(error.exception.code, 2)

    def test_archive_number_and_date_use_same_verified_endpoint(self):
        puzzle = self.puzzle()
        with patch('urllib.request.urlopen', side_effect=lambda *a, **k: io.BytesIO(json.dumps(puzzle).encode())) as request:
            self.assertEqual(download.fetch_number(649), puzzle)
            self.assertEqual(download.fetch_date('2026-10-16'), puzzle)
        for call in request.call_args_list:
            self.assertEqual(call.args[0].full_url, 'https://dailyakari.com/archivepuzzle?number=649')
            self.assertEqual(call.args[0].get_header('X-tz-offset'), '-480')
        first = {**puzzle, 'dateKey': '2025-01-06', 'dailyNumber': 1}
        with patch.object(download, '_request_puzzle', return_value=first):
            self.assertEqual(download.fetch_date('2025-01-06'), first)
        for wrong in [{**puzzle, 'dailyNumber': 650}, {**puzzle, 'dateKey': '2026-10-17'}]:
            with patch.object(download, '_request_puzzle', return_value=wrong):
                with self.assertRaisesRegex(ValueError, 'different puzzle'):
                    download.fetch_number(649)

    def test_archive_selection_is_exclusive_and_invalid_input_never_fetches(self):
        selectors = [
            ['--today', '--number', '649'], ['--today', '--date', '2026-10-16'],
            ['--date', '2026-10-16', '--number', '649'],
            ['--date', '2026-02-30'], ['--date', '2026-1-1'], ['--date', '2025-01-05'],
            ['--number', '0'], ['--number', '-1'], ['--number', '1.5'],
        ]
        for args in selectors:
            with patch('sys.argv', ['akari-download', '--output', 'unused.json', *args]), \
                 patch('urllib.request.urlopen', side_effect=AssertionError('Must not fetch')), \
                 contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    download.main()
                self.assertEqual(error.exception.code, 2)

    def test_archive_cli_routes_selector_and_preserves_file_on_wrong_response(self):
        output = Path(__file__).resolve().parents[1] / 'output' / 'tests'
        output.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=output) as tmp:
            target = Path(tmp) / 'archive.json'
            for selector in (['--number', '649'], ['--date', '2026-10-16']):
                with patch('sys.argv', ['akari-download', '--output', str(target), '--tz-offset', '0', *selector]), \
                     patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(self.puzzle()).encode())) as request, \
                     contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(download.main(), 0)
                self.assertEqual(request.call_args.args[0].get_header('X-tz-offset'), '0')
                self.assertEqual(json.loads(target.read_text()), self.puzzle())
            with patch('sys.argv', ['akari-download', '--output', str(target), '--number', '1']), \
                 patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(self.puzzle()).encode())), \
                 contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    download.main()
                self.assertEqual(error.exception.code, 1)
            self.assertEqual(json.loads(target.read_text()), self.puzzle())
