"""Offline puzzle geometry parsing."""

def parse_puzzlink(url: str) -> list[list[int]]:
    import re
    m = re.search(r"akari/(\d+)/(\d+)/(.+)$", url)
    if not m:
        raise ValueError(f"not an Akari puzz.link URL: {url}")
    cols, rows, body = int(m.group(1)), int(m.group(2)), m.group(3)
    if rows < 1 or cols < 1:
        raise ValueError("puzzle dimensions must be positive")
    grid = [[-1 for _ in range(cols)] for _ in range(rows)]  # -1 white, -2 black, >=0 clue
    pos = 0
    for ch in body:
        if pos >= rows * cols:
            raise ValueError("encoded cells exceed board size")
        r, c = divmod(pos, cols)
        if "0" <= ch <= "4":
            grid[r][c] = int(ch)
        elif "5" <= ch <= "9":
            grid[r][c] = int(ch, 16) - 5
            pos += 1
        elif "a" <= ch <= "e":
            grid[r][c] = int(ch, 16) - 10
            pos += 2
        elif "g" <= ch <= "z":
            pos += int(ch, 36) - 16
        elif ch == ".":
            grid[r][c] = -2
        else:
            raise ValueError(f"invalid Akari encoding character: {ch!r}")
        pos += 1
        # Compact numbered tokens include one/two implicit trailing white
        # cells, even when the number is at the edge of the board.
        padding = 2 if "a" <= ch <= "e" else 1 if "5" <= ch <= "9" else 0
        if pos > rows * cols + padding:
            raise ValueError("encoded run exceeds board size")
    return grid
