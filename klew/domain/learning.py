"""LearningRule: outcome of a run → updates to learned edges. Pure; the service persists.

Structural edges are facts from the indexer and never change here. Experience lives in two
learned edge types:
- POINTS_TO (task term → file): reinforced toward files that were actually touched, decayed
  for files we served that were not touched.
- CO_CHANGED (file ↔ file): reinforced for files touched together.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations


@dataclass(frozen=True)
class LearnParams:
    alpha: float = 0.35        # POINTS_TO reinforcement rate
    beta: float = 0.15         # POINTS_TO decay rate for served-but-untouched files
    alpha_cc: float = 0.20     # CO_CHANGED reinforcement rate
    decay_top_k: int = 5       # only the top-k served misses are decayed
    max_truth: int = 12        # sweeping changes are skipped (too noisy to learn from)
    prune_below: float = 0.03


@dataclass
class EdgeUpdate:
    src: int
    dst: int
    w: float
    hits: int
    misses: int


@dataclass
class LearnDelta:
    points_to: list[EdgeUpdate]
    co_changed: list[EdgeUpdate]
    reinforced: int = 0
    decayed: int = 0
    created: int = 0


def apply(term_ids: list[int], served: list[int], truth: list[int],
          pt_current: dict[tuple[int, int], dict], cc_current: dict[tuple[int, int], dict],
          p: LearnParams = LearnParams()) -> LearnDelta:
    truth_set = set(truth)
    delta = LearnDelta([], [])
    if not truth_set or len(truth_set) > p.max_truth:
        return delta
    for t in term_ids:
        for f in truth_set:
            cur = pt_current.get((t, f))
            w = (cur or {}).get("w") or 0.0
            nw = w + p.alpha * (1.0 - w)
            delta.points_to.append(EdgeUpdate(t, f, round(nw, 5), ((cur or {}).get("hits") or 0) + 1,
                                              (cur or {}).get("misses") or 0))
            delta.reinforced += 1 if cur else 0
            delta.created += 0 if cur else 1
        misses = [f for f in served if f not in truth_set][: p.decay_top_k]
        for f in misses:
            cur = pt_current.get((t, f))
            if not cur:
                continue
            nw = (cur.get("w") or 0.0) * (1.0 - p.beta)
            delta.points_to.append(EdgeUpdate(t, f, round(nw, 5), cur.get("hits") or 0,
                                              (cur.get("misses") or 0) + 1))
            delta.decayed += 1
    for a, b in combinations(sorted(truth_set), 2):
        for s, d in ((a, b), (b, a)):
            cur = cc_current.get((s, d))
            w = (cur or {}).get("w") or 0.0
            nw = w + p.alpha_cc * (1.0 - w)
            delta.co_changed.append(EdgeUpdate(s, d, round(nw, 5), ((cur or {}).get("hits") or 0) + 1, 0))
            delta.reinforced += 1 if cur else 0
            delta.created += 0 if cur else 1
    return delta
