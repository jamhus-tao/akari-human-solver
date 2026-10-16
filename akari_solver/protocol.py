"""Canonical, compact v8 wire format. Solver traces are internal diagnostics."""
SCHEMA_VERSION = 8


def cost_expression(part):
    """Optional display annotation; never used as input to numeric verification."""
    details = part.get("cost_details", {})
    counts = part.get("candidate_counts")
    if not counts:
        return None
    if "expression" in details:
        return details["expression"]
    return f"{' * '.join(map(str, counts))} = {part['cost']}"


def make_report(puzzle, history, initial_marks=None, cost_model=None):
    """Store actions once and only the selected centers needed to replay proofs.

    Candidate domains, branch effects, costs, types, state snapshots and totals
    are deterministic derivatives. Never serialize those as alternate truths.
    """
    if initial_marks is None:
        initial_marks = next((e.get("before", {}) for e in history if "before" in e), {})
    if isinstance(puzzle, str):
        puzzle = {"puzzlink": puzzle}
    geometry = "grid" if "grid" in puzzle else "puzzlink"
    metadata = ("title", "author", "dateKey", "dailyNumber", "puzzleId",
                "difficulty", "source", "license", "socialUrl")
    report = {"schema_version": SCHEMA_VERSION,
              "puzzle": {k: puzzle[k] for k in (geometry, *metadata)
                         if k in puzzle and puzzle[k] is not None},
              "steps": []}
    cost_model = cost_model or next((e.get("cost_model") for e in history if e.get("cost_model")), "product")
    if cost_model != "product":
        report["cost_model"] = cost_model
    if initial_marks:
        report["initial_marks"] = dict(initial_marks)
    for event in history:
        if event["type"] in ("stuck", "search_limit", "partial"):
            report["stop"] = {"kind": event["type"], "reason": event["reason"]}
            continue
        parts = event["components"] if event["type"] == "fast_mark" else [event]
        step = {
            "actions": dict(event["new_marks"]),
            "proofs": [[label.split("@", 1)[1] for label in part["centers"]]
                      for part in parts],
        }
        expressions = [cost_expression(part) for part in parts]
        if all(expressions):
            if event["type"] == "fast_mark":
                step["cost_expression"] = f"{' + '.join(str(p['cost']) for p in parts)} = {sum(p['cost'] for p in parts)}"
                step["proof_cost_expressions"] = expressions
            else:
                step["cost_expression"] = expressions[0]
        report["steps"].append(step)
    return report
