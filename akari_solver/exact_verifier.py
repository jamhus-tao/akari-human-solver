"""Independent CNF/DPLL safety checker, never used to generate human steps.

Variables describe white-cell lamps. Clauses encode segment exclusion, exact
clue cardinalities, and coverage. No human-solver propagation code is reused.
"""
from itertools import combinations


class UnsoundMarkError(ValueError):
    pass


class ExactVerifier:
    def __init__(self, grid):
        self.cells = [(r, c) for r, row in enumerate(grid)
                      for c, value in enumerate(row) if value == -1]
        self.ids = {cell: i + 1 for i, cell in enumerate(self.cells)}
        clauses = set()
        for r, c in self.cells:
            visible = [self.ids[r, c]]
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                rr, cc = r + dr, c + dc
                while (rr, cc) in self.ids:
                    other = self.ids[rr, cc]
                    visible.append(other)
                    clauses.add(tuple(sorted((-self.ids[r, c], -other))))
                    rr, cc = rr + dr, cc + dc
            clauses.add(tuple(sorted(visible)))
        for r, row in enumerate(grid):
            for c, clue in enumerate(row):
                if clue < 0:
                    continue
                neighbors = [self.ids[x] for x in
                             ((r-1, c), (r+1, c), (r, c-1), (r, c+1))
                             if x in self.ids]
                if clue > len(neighbors):
                    clauses.add(())
                    continue
                # At most clue lamps, and at most (n-clue) non-lamps.
                for subset in combinations(neighbors, clue + 1):
                    clauses.add(tuple(-x for x in subset))
                for subset in combinations(neighbors, len(neighbors) - clue + 1):
                    clauses.add(tuple(subset))
        self.clauses = tuple(sorted(clauses))
        self.calls = 0

    @staticmethod
    def _search(clauses, values):
        while True:
            remaining = []
            units = set()
            for clause in clauses:
                if any(values.get(abs(x)) == (x > 0) for x in clause):
                    continue
                rest = tuple(x for x in clause if abs(x) not in values)
                if not rest:
                    return None
                remaining.append(rest)
                if len(rest) == 1:
                    units.add(rest[0])
            if not remaining:
                return values
            if not units:
                break
            for literal in units:
                var, value = abs(literal), literal > 0
                if var in values and values[var] != value:
                    return None
                values[var] = value
            clauses = remaining
        literal = min(remaining, key=len)[0]
        for value in (literal > 0, literal < 0):
            result = ExactVerifier._search(remaining, {**values, abs(literal): value})
            if result is not None:
                return result
        return None

    def solution(self, marks):
        self.calls += 1
        if any(cell not in self.ids or v not in ("Lamp", "Mark") for cell, v in marks.items()):
            raise ValueError("invalid mark passed to verifier")
        values = {self.ids[cell]: v == "Lamp" for cell, v in marks.items()}
        answer = self._search(self.clauses, values)
        if answer is None:
            return None
        return {cell: "Lamp" if answer.get(i, False) else "Mark"
                for cell, i in self.ids.items()}

    def verify_batch(self, before, additions):
        if self.solution(before) is None:
            raise UnsoundMarkError("pre-step state has no solution; vacuous proofs forbidden")
        for cell, value in sorted(additions.items()):
            if cell in before:
                raise UnsoundMarkError("a mark step must only add new marks")
            opposite = "Mark" if value == "Lamp" else "Lamp"
            counterexample = self.solution({**before, cell: opposite})
            if counterexample is not None:
                raise UnsoundMarkError(
                    f"unproven mark {cell}={value}: opposite has a complete solution: "
                    f"{counterexample}")
        return {"method": "independent_cnf_opposite_unsat", "checked_marks": len(additions)}
