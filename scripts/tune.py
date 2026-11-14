"""Grid-search engine parameters on the held-in slice only (first N commits of the window).

Usage:
  .venv/bin/python scripts/tune.py .vendor/eval-repos/httpx --head 50 \
      --grid '{"max_items": [12, 30], "companion_weight": [0, 0.4, 0.7], "warm": [0, 300]}'

`warm` is the number of pre-window commits learned at install; every other key is an EngineParams
field. Results print one JSON line per combination. Never tune on the slice you report.

History of choices (httpx, first 50 commits):
  round 1: learned_weight 1.0, alpha 0.35, hops 2
  round 2: hub_damping 0.5
"""
from __future__ import annotations

import argparse
import itertools
import json
from dataclasses import replace
from pathlib import Path

from klew.adapters.hydra_store import HydraGraphStore
from klew.eval.replay import run_replay
from klew.services.engine import EngineParams


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("repo", type=Path)
    ap.add_argument("--head", type=int, default=50)
    ap.add_argument("--window", type=int, default=300)
    ap.add_argument("--arm", default="graph_learn")
    ap.add_argument("--grid", required=True, help="JSON object: param -> list of values")
    a = ap.parse_args()
    grid: dict[str, list] = json.loads(a.grid)
    store = HydraGraphStore()
    rows = []
    keys = list(grid)
    for values in itertools.product(*grid.values()):
        combo = dict(zip(keys, values, strict=True))
        warm = int(combo.pop("warm", 0))
        p = replace(EngineParams(), **combo)
        r = run_replay(store, a.repo, f"tune-{a.repo.name}", window=a.window, head=a.head,
                       reindex_every=50, arms=(a.arm,), params=p, write=False, warm=warm)
        s = r["summary"][a.arm]
        rows.append({**combo, "warm": warm, "budget_recall": s["budget_recall"],
                     "recall@5": s["recall@5"], "hit@1": s["hit@1"], "mrr": s["mrr"],
                     "tokens": s["tokens_mean"], "p50_ms": s["p50_ms"]})
        print(json.dumps(rows[-1]), flush=True)
    rows.sort(key=lambda x: (-x["budget_recall"], -x["recall@5"]))
    print("\nbest:", json.dumps(rows[0]))


if __name__ == "__main__":
    main()
