"""Accuracy as the graph learns: held-out accuracy vs. how many past commits the graph has learned from.

For each N in --steps, the graph learns from the N commits just before the evaluation window, then
learning is FROZEN and the window is replayed. So the x-axis is exactly "commits learned", and N = 0 is
the same graph with no learning at all (the baseline). Metrics are on the held-out commits only (after
the first --tuned-on commits of the window, which were used for tuning).

Usage: .venv/bin/python scripts/learning_curve.py .vendor/eval-repos/httpx --name httpx
Writes eval/results/learning/<name>.json.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import replace
from pathlib import Path

from klew.adapters.hydra_store import HydraGraphStore
from klew.eval.replay import run_replay
from klew.services.engine import EngineParams

METRICS = ("budget_recall", "recall@5", "hit@1", "mrr")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("repo", type=Path)
    ap.add_argument("--name", required=True)
    ap.add_argument("--window", type=int, default=300)
    ap.add_argument("--tuned-on", type=int, default=100)
    ap.add_argument("--steps", default="0,50,100,200,400,600")
    ap.add_argument("--out", type=Path, default=Path("eval/results/learning"))
    a = ap.parse_args()
    store = HydraGraphStore()
    points = []

    for n in [int(x) for x in a.steps.split(",")]:
        r = run_replay(store, a.repo, f"lc-{a.name}", window=a.window, arms=("graph_learn",),
                       write=False, warm=n, tuned_on=a.tuned_on, params=replace(EngineParams()),
                       learn_online=False)
        s = r["summary_held_out"]["graph_learn"]
        points.append({"learned": n, "learning": n > 0, **{m: s[m] for m in METRICS}})
        print(json.dumps(points[-1]), flush=True)

    a.out.mkdir(parents=True, exist_ok=True)
    out = {"repo": a.name, "window": a.window, "tuned_on_first": a.tuned_on,
           "held_out_commits": r["held_out_commits"], "first_commit": r["first_commit"],
           "points": points}
    (a.out / f"{a.name}.json").write_text(json.dumps(out, indent=1))
    print("wrote", a.out / f"{a.name}.json")


if __name__ == "__main__":
    main()
