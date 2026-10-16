"""Canonical Akari vocabulary shared by solver output and replay protocols."""
from typing import Literal

LAMP = "Lamp"
MARK = "Mark"
LIT = "Lit"
EMPTY = "Empty"
WALL = "Wall"
CLUE = "Clue"
SATISFIED = "Satisfied"
CellAction = Literal["Lamp", "Mark"]

def position_state(actions, lit):
    """Physical state: illumination supersedes a historical no-lamp action."""
    state = dict(actions)
    for cell in lit:
        if state.get(cell) != LAMP:
            state[cell] = LIT
    return state

def cell_states(grid, actions, lit):
    """Derived display only. Never replace a puzzle's original clue value."""
    state = position_state(actions, lit)
    result = []
    for r, row in enumerate(grid):
        cells = []
        for c, value in enumerate(row):
            if value >= 0:
                adjacent = sum(actions.get(x) == LAMP for x in
                               ((r-1, c), (r+1, c), (r, c-1), (r, c+1)))
                remaining = value - adjacent
                cells.append({"kind": CLUE, "original": value, "remaining": remaining,
                              "satisfied": remaining == 0})
            elif value == -2:
                cells.append({"kind": WALL})
            else:
                action = actions.get((r, c))
                cells.append({"kind": state.get((r, c), EMPTY),
                              "action": action, "lit": (r, c) in lit})
        result.append(cells)
    return result

def display_token(cell):
    if cell["kind"] != CLUE:
        return cell["kind"]
    primary = SATISFIED if cell["satisfied"] else str(cell["remaining"])
    return f"Clue:{primary}" + (f"[original={cell['original']}]"
                                if cell["remaining"] != cell["original"] else "")
