"""Render eval results to PNG for the README: learning curve + efficiency bars."""
from __future__ import annotations

import json
from pathlib import Path

LABEL = {"vector": "Vector RAG", "bm25": "BM25 RAG", "graph_static": "Graph, no learning",
         "graph_learn": "Desirepath", "graph_hybrid": "Desirepath + vector seeds"}
COLOR = {"vector": "#3c6e91", "bm25": "#8a99a3", "graph_static": "#b9c4ca",
         "graph_learn": "#b8741a", "graph_hybrid": "#2e7556"}


def plot(result_path: Path, out_dir: Path) -> list[Path]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    r = json.loads(result_path.read_text())
    out_dir.mkdir(parents=True, exist_ok=True)
    name = result_path.stem
    outs = []

    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=150)
    skip = 20
    for a in r["arms"]:
        ys = r["curves"][a]["budget_recall"][skip:]
        xs = list(range(skip + 1, skip + 1 + len(ys)))
        lw = 2.6 if a in ("graph_learn", "graph_hybrid") else 1.5
        ax.plot(xs, ys, label=LABEL.get(a, a), color=COLOR.get(a), lw=lw)
    ax.set_ylabel("changed files in 2k-token context\n(trailing 50 commits)")
    ax.set_xlabel("commits replayed")
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.grid(axis="y", ls=":", alpha=0.6)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.legend(frameon=False, fontsize=9, loc="lower right")
    ax.set_title(f"{r['repo']}: {r['scored']} commits, {r['budget_tokens']}-token budget", fontsize=10, loc="left")
    fig.tight_layout()
    p = out_dir / f"{name}-curve.png"
    fig.savefig(p)
    outs.append(p)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 3.2), dpi=150)
    arms = r["arms"]
    vals = [r["summary"][a]["tokens_per_hit"] or 0 for a in arms]
    ax.barh([LABEL.get(a, a) for a in arms], vals, color=[COLOR.get(a) for a in arms])
    for i, v in enumerate(vals):
        ax.text(v + max(vals) * 0.01, i, f"{v:,.0f}", va="center", fontsize=9)
    ax.set_xlabel("context tokens spent per changed file found (lower is better)")
    ax.invert_yaxis()
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    fig.tight_layout()
    p = out_dir / f"{name}-tokens.png"
    fig.savefig(p)
    outs.append(p)
    plt.close(fig)
    return outs
