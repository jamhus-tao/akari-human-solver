"""Download one puzzle input; never invoke solving or generate a proof."""
import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import re
import urllib.request

from .puzzle import parse_puzzlink

FIRST_PUZZLE_DATE = date(2025, 1, 6)


def parse_date(value: str) -> date:
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("Date must use YYYY-MM-DD")
    requested = date.fromisoformat(value)
    if requested < FIRST_PUZZLE_DATE:
        raise ValueError("The archive starts on 2025-01-06 (puzzle 1)")
    return requested


def positive_number(value: str) -> int:
    number = int(value)
    if number < 1:
        raise ValueError("Puzzle number must be positive")
    return number


def _request_puzzle(endpoint: str, tz_offset: int) -> dict:
    request = urllib.request.Request(
        f"https://dailyakari.com/{endpoint}",
        headers={"Accept": "application/json", "X-Tz-Offset": str(tz_offset),
                 "User-Agent": "akari-human-solver/1.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        puzzle = json.load(response)
    if not isinstance(puzzle, dict) or not isinstance(puzzle.get("puzzlink"), str):
        raise ValueError("Response must be a puzzle JSON object containing puzzlink")
    parse_puzzlink(puzzle["puzzlink"])
    return puzzle


def fetch_today(tz_offset: int = -480) -> dict:
    return _request_puzzle("dailypuzzle", tz_offset)


def fetch_number(number: int, tz_offset: int = -480) -> dict:
    if isinstance(number, bool) or not isinstance(number, int) or number < 1:
        raise ValueError("Puzzle number must be a positive integer")
    expected_date = (FIRST_PUZZLE_DATE + timedelta(days=number - 1)).isoformat()
    puzzle = _request_puzzle(f"archivepuzzle?number={number}", tz_offset)
    if puzzle.get("dailyNumber") != number or puzzle.get("dateKey") != expected_date:
        raise ValueError(f"Archive returned a different puzzle; expected number {number}, date {expected_date}")
    return puzzle


def fetch_date(value: str, tz_offset: int = -480) -> dict:
    requested = parse_date(value)
    return fetch_number((requested - FIRST_PUZZLE_DATE).days + 1, tz_offset)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download one Daily Akari puzzle JSON without solving it.")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--today", action="store_true", help="current daily puzzle (default)")
    source.add_argument("--date", type=parse_date, metavar="YYYY-MM-DD", help="puzzle date, from 2025-01-06")
    source.add_argument("--number", type=positive_number, metavar="N", help="daily sequence number, not puzzleId")
    parser.add_argument("--tz-offset", type=int, default=-480, metavar="MINUTES",
                        help="UTC minus local time in minutes (default: -480 for UTC+8)")
    parser.add_argument("--output", required=True, help="destination for original puzzle JSON")
    args = parser.parse_args()
    if not -840 <= args.tz_offset <= 840:
        parser.error("--tz-offset must be between -840 and 840 minutes")
    try:
        if args.date is not None:
            puzzle = fetch_date(args.date.isoformat(), args.tz_offset)
        elif args.number is not None:
            puzzle = fetch_number(args.number, args.tz_offset)
        else:
            puzzle = fetch_today(args.tz_offset)
        content = json.dumps(puzzle, ensure_ascii=False, indent=2) + "\n"
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    except (OSError, ValueError, OverflowError) as error:
        parser.exit(1, f"Download failed: {error}\n")
    print(f"Saved puzzle: {target}")
    print(f"date={puzzle.get('dateKey', 'unknown')} dailyNumber={puzzle.get('dailyNumber', 'unknown')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
