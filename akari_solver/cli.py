"""Command-line input, report output and diagnostic presentation."""
import argparse
import json
from pathlib import Path

from .solver import AkariHumanSolver
from .puzzle import parse_puzzlink, fetch_today
from .board import illuminated, render
from .protocol import make_report
from .cost_models import COST_FUNCTIONS

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", action="store_true", help="fetch Daily Akari's current puzzle")
    ap.add_argument("--puzzlink", help="puzz.link Akari URL")
    ap.add_argument("--json", help="Daily Akari JSON object or path to it")
    ap.add_argument("--max-combinations", type=int, default=200_000)
    ap.add_argument("--max-branches", type=int, default=200_000)
    ap.add_argument("--cost-model", choices=tuple(COST_FUNCTIONS),
                    default="product", help="experimental overlap score changes step selection")
    ap.add_argument("--cost-output", help="save cost diagnostics separately from canonical v8 proof")
    ap.add_argument("--output", help="save full JSON proof to this path")
    ap.add_argument("--steps-output", help="save cumulative step diagrams as Markdown")
    ap.add_argument("--json-output", action="store_true")
    args = ap.parse_args()
    for output in (args.output, args.steps_output, args.cost_output):
        if output:
            Path(output).parent.mkdir(parents=True, exist_ok=True)
    if args.today or not (args.puzzlink or args.json):
        data = fetch_today()
        url = data["puzzlink"]
    elif args.json:
        raw = args.json if args.json.lstrip().startswith("{") else Path(args.json).read_text(encoding="utf-8")
        data = json.loads(raw)
        if isinstance(data, str):
            data = {"puzzlink": data}
        url = data["puzzlink"]
    else:
        data = {"puzzlink": args.puzzlink}
        url = args.puzzlink
    solver = AkariHumanSolver(parse_puzzlink(url), args.max_combinations, args.max_branches, args.cost_model)
    history = solver.solve()
    result = make_report(data, history, cost_model=args.cost_model)
    if args.cost_output:
        diagnostics = {"format": "akari-cost-experiment", "version": 1,
                       "cost_model": args.cost_model, "status": solver.status,
                       "limits": {"max_combinations": args.max_combinations,
                                  "max_branches": args.max_branches}, "steps": []}
        for event in history:
            if event["type"] not in ("brain", "fast_mark"):
                diagnostics["stop"] = event
                continue
            parts = event["components"] if event["type"] == "fast_mark" else [event]
            diagnostics["steps"].append({"step": event["step"], "type": event["type"],
                "cost": event["cost"], "total_cost": event["total_cost"],
                "search": event["search"], "proofs": [
                    {"centers": p["centers"], "candidate_count": p["candidate_count"],
                     **p["cost_details"]}
                    for p in parts]})
        Path(args.cost_output).write_text(json.dumps(diagnostics, indent=2) + "\n", encoding="utf-8")
    if args.output:
        Path(args.output).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    if args.steps_output:
        diagrams = ["# Mark steps\n\nLamp: placed light; Mark: forbidden position; "
                    "Lit: illuminated without action; Empty: unlit; Wall: obstacle. "
                    "Clue values show remaining lamps; changed clues include original values.\n"]
        for event in history:
            if "step" not in event:
                continue
            summary = (f"fast mark | {event['component_count']} independent results | "
                       f"cost 1 each | total cost {event['total_cost']}"
                       if event["type"] == "fast_mark" else f"brain cost {event['cost']}")
            children = ""
            if event["type"] == "fast_mark":
                children = "\n".join(
                    f"- {child['component']}. {', '.join(child['centers'])}: `{child['new_marks']}`"
                    for child in event["components"]) + "\n\n"
            diagrams.append(f"## Step {event['step']} | {summary} | "
                            f"{', '.join(event['centers'])}\n\n"
                            f"New actions: `{event['new_marks']}`\n\n"
                            f"{children}"
                            f"```text\n{event['board_after']}\n```\n")
        Path(args.steps_output).write_text("\n".join(diagrams), encoding="utf-8")
    if args.json_output:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"date={data.get('dateKey', 'unknown')} dailyNumber={data.get('dailyNumber', 'unknown')}")
        print(f"cost_model={solver.cost_model}")
        print(f"status={solver.status} explicit_actions={len(solver.marks)} "
              f"lit={len(illuminated(solver.grid, solver.marks))}/{len(solver.white)}")
        for i, item in enumerate(history, 1):
            if item["type"] in ("brain", "fast_mark"):
                print(f"\nMarked step {i}: {item['type']} cost={item['cost']} centers={item['centers']}")
                if item["type"] == "fast_mark":
                    print(f"  independent results={item['component_count']} total_cost={item['total_cost']}")
                print("  new:", item["new_marks"])
            else:
                print(f"\nStopped: {item['type']}: {item['reason']}")
        print("\nFinal board (Lamp, Mark, Lit, Empty, Wall; Clue remaining/original):")
        print(render(solver.grid, solver.marks))
    return 0 if solver.status == "solved" else 2
