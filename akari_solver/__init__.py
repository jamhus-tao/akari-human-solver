"""Public API for strict local Akari solving."""
from .solver import AkariHumanSolver, BrainStep, Center, Contradiction, SearchLimit
from .puzzle import parse_puzzlink
from .board import diff, illuminated, render

__all__ = ["AkariHumanSolver", "BrainStep", "Center", "Contradiction", "SearchLimit",
           "parse_puzzlink", "fetch_today", "diff", "illuminated", "render"]


def fetch_today(tz_offset=-480):
    """Compatibility API; acquisition lives in the independent download module."""
    from .download import fetch_today as download_today
    return download_today(tz_offset)
