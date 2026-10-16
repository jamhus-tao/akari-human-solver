#!/usr/bin/env python3
"""Compatibility entry point. New code should import akari_solver."""
from akari_solver import (AkariHumanSolver, BrainStep, Center, Contradiction,
                          SearchLimit, parse_puzzlink, fetch_today, diff,
                          illuminated, render)
from akari_solver.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
