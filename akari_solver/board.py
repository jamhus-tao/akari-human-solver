"""Physical lighting, action differences and text board rendering."""
from .terminology import CellAction, cell_states, display_token

Cell = tuple[int, int]
Action = CellAction

def diff(old: dict[Cell, Action], new: dict[Cell, Action]) -> dict[str, Action]:
    return {f"({r+1},{c+1})": v for (r, c), v in sorted(new.items()) if old.get((r, c)) != v}


def illuminated(grid: list[list[int]], marks: dict[Cell, Action]) -> set[Cell]:
    """Light from explicit lamps only; walls AND numbers block rays."""
    white = {(r, c) for r, row in enumerate(grid) for c, v in enumerate(row) if v == -1}
    lit = set()
    for (r, c), mark in marks.items():
        if (r, c) not in white or mark not in ("Lamp", "Mark"):
            raise ValueError("invalid explicit mark")
        if mark != "Lamp":
            continue
        lit.add((r, c))
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            rr, cc = r + dr, c + dc
            while (rr, cc) in white:
                lit.add((rr, cc))
                rr, cc = rr + dr, cc + dc
    return lit


def render(grid: list[list[int]], marks: dict[Cell, Action]) -> str:
    return "\n".join(" ".join(display_token(cell) for cell in row)
                     for row in cell_states(grid, marks, illuminated(grid, marks)))
