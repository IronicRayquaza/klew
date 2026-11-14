"""Grid-search engine parameters on the held-in slice only (first N commits of the window).

Usage: .venv/bin/python scripts/tune.py .vendor/eval-repos/httpx --head 50
Results print as a table; pick by budget_recall, then recall@5. Never tune on the reported slice.
"""
from __future__ import annotations

import argparse
import itertools
import json
from dataclasses import replace
from pathlib import Path

from desirepath.adapters.hydra_store import HydraGraphStore
from desirepath.domain.learning import LearnParams
from desirepath.eval.replay import run_replay
from desirepath.services.engine import EngineParams

# Round 1 (learned_weight, alpha, hops) chose 1.0 / 0.35 / 2. Round 2 tunes hub damping only.
GRID = {
    "hub_damping": [0.0, 0.25, 0.5, 0.75, 1.0],
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("repo", type=Path)
    ap.add_argument("--head", type=int, default=50)
    ap.add_argument("--window", type=int, default=300)
    a = ap.parse_args()
    store = HydraGraphStore()
    rows = []
    for (hub,) in itertools.product(*GRID.values()):
        p = EngineParams(hub_damping=hub, learn=replace(LearnParams()))
        r = run_replay(store, a.repo, f"tune-{a.repo.name}", window=a.window, head=a.head,
                       reindex_every=50, arms=("graph_learn",), params=p, write=False)
        s = r["summary"]["graph_learn"]
        rows.append({"hub_damping": hub,
                     "budget_recall": s["budget_recall"], "recall@5": s["recall@5"],
                     "hit@1": s["hit@1"], "p50_ms": s["p50_ms"]})
        print(json.dumps(rows[-1]), flush=True)
    rows.sort(key=lambda x: (-x["recall@5"], -x["budget_recall"]))
    print("\nbest:", json.dumps(rows[0]))


if __name__ == "__main__":
    main()
