"""Bootstrap confidence intervals over per-commit eval records (no re-running needed).

Commits are resampled with replacement. For a comparison between two arms we resample the *same* commits
for both (a paired bootstrap), which is the right test for "is A better than B on these tasks".
"""
from __future__ import annotations

import random
import statistics as st

METRICS = ("budget_recall", "recall@5", "hit@1", "mrr")
COMPARISONS = (
    ("graph_hybrid", "vector", "Klew + vector seeds vs vector RAG"),
    ("graph_learn", "vector", "Klew vs vector RAG"),
    ("graph_learn", "graph_static", "Learning on vs off"),
    ("graph_learn", "graph_nowalk", "Graph walk on vs off"),
)


def _boot(values_by_commit: list[float], b: int, rng: random.Random) -> tuple[float, float]:
    n = len(values_by_commit)
    means = sorted(st.fmean(values_by_commit[rng.randrange(n)] for _ in range(n)) for _ in range(b))
    return means[int(0.025 * b)], means[int(0.975 * b) - 1]


def intervals(records: list[dict], arms, b: int = 2000, seed: int = 7) -> dict:
    """Per-arm 95% CIs and paired-difference CIs, for the given records."""
    rng = random.Random(seed)
    out = {"n": len(records), "arms": {}, "comparisons": []}
    for a in arms:
        out["arms"][a] = {m: _boot([r["arms"][a][m] for r in records], b, rng) for m in METRICS}
    for a, base, label in COMPARISONS:
        if a not in arms or base not in arms:
            continue
        diffs = {}
        for m in METRICS:
            d = [r["arms"][a][m] - r["arms"][base][m] for r in records]
            lo, hi = _boot(d, b, rng)
            diffs[m] = {"diff": st.fmean(d), "lo": lo, "hi": hi, "significant": lo > 0 or hi < 0}
        out["comparisons"].append({"a": a, "b": base, "label": label, "metrics": diffs})
    return out
