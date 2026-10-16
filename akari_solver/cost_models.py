"""Interchangeable scores for the same frozen local domains.

No search, enumeration, verification, resource limits or commits belong here.
Each scorer returns a numeric cost, display expression and diagnostic details.
"""
import math


def _counts(selected):
    counts = [len(choices) for _, choices in selected]
    if not counts or not all(counts):
        raise ValueError("cost needs nonempty center domains")
    return counts


def product_cost(selected):
    counts = _counts(selected)
    cost = math.prod(counts)
    return {"model": "product", "cost": cost, "raw_product": cost,
            "expression": f"{' * '.join(map(str, counts))} = {cost}"}


def overlap_cost(selected):
    """Assign shared points in coordinate order to the smallest current residual."""
    counts = _counts(selected)
    raw = math.prod(counts)
    owners = {}
    for i, (_, choices) in enumerate(selected):
        for cell in {cell for choice in choices for cell in choice}:
            owners.setdefault(cell, []).append(i)
    remaining = counts.copy()
    shares = []
    for cell, indexes in sorted(owners.items()):
        if len(indexes) < 2:
            continue
        keeper = min(indexes, key=lambda i: (remaining[i], selected[i][0].cell,
                                              selected[i][0].kind))
        for i in indexes:
            if i != keeper:
                remaining[i] -= 1
        shares.append({"cell": f"({cell[0]+1},{cell[1]+1})",
                       "retained_by": selected[keeper][0].label(),
                       "deducted_from": sorted(selected[i][0].label()
                                                for i in indexes if i != keeper)})
    factors = [max(1, value) for value in remaining]
    cost = math.prod(factors) + len(selected) - 1
    terms = []
    for initial, residual in zip(counts, remaining):
        term = f"({initial} - {initial - residual})" if initial != residual else str(initial)
        terms.append(f"max(1, {term})" if residual < 1 else term)
    return {"model": "overlap-experimental", "cost": cost,
            "expression": f"{' * '.join(terms)} + {len(selected)} - 1 = {cost}",
            "raw_product": raw, "initial_contributions": counts,
            "remaining_contributions": remaining, "factors": factors,
            "center_penalty": len(selected) - 1, "shared_points": shares}


COST_FUNCTIONS = {"product": product_cost, "overlap-experimental": overlap_cost}
