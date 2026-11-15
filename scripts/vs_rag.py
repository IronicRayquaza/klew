"""Side by side: Klew vs vector RAG on a real commit the graph has never seen.

The graph is rebuilt as of an older commit (`--back` eligible commits before HEAD) and warm-started only on
history before that point, exactly like the eval. A later commit is then replayed: its message is the task,
the files it changed are the answer, and both retrievers get the same token budget. No leakage.

  .venv/bin/python scripts/vs_rag.py --list                 # candidate commits (never seen by the graph)
  .venv/bin/python scripts/vs_rag.py --commit <sha>          # replay one of them
  .venv/bin/python scripts/vs_rag.py --task "free text"      # any task (no answer key)

The first run indexes and warm-starts the snapshot (~2 min on httpx); later runs reuse it.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from rich.console import Console
from rich.table import Table
from rich.text import Text

from klew import ids
from klew.adapters.git_miner import commits, worktree
from klew.baselines.vector import MODEL, VectorRetriever
from klew.runtime import make_store
from klew.schema import FILE, REPO
from klew.services.engine import EngineParams, RepoEngine, warm_start
from klew.services.index import IndexService

MAX_TRUTH = 8          # same eligibility rule as the eval
SHOW = 10              # rows per column on screen
console = Console()


def snapshot(repo: Path, name: str, back: int, learn: int):
    allc = commits(repo)
    eligible = [c for c in allc if 1 <= len(c.changed) <= MAX_TRUTH]
    first_new = eligible[-back]
    idx = next(i for i, c in enumerate(allc) if c.sha == first_new.sha)
    at = allc[idx - 1]                                  # graph state = just before the first unseen commit
    later = eligible[-back:]
    key = f"{name}::vsrag-{at.sha[:8]}"
    snap = worktree(repo, at.sha, Path(".klew/vsrag") / f"{name}-{at.sha[:8]}")
    store = make_store()
    learned = None
    if not store.scan_nodes(FILE, key, ("path",)):
        console.print(f"[dim]Preparing {name} @ {at.sha[:8]}: index + learn from up to {learn} earlier commits…[/]")
        IndexService(store).index(key, snap, history=allc[:idx], fresh=True)
        eng = RepoEngine(store, key, snap, EngineParams())
        learned = warm_start(eng, allc[:idx], limit=learn, max_files=MAX_TRUTH)
        store.upsert_nodes(REPO, [{"id": ids.stable_id(key, "vsrag"), "repo": key, "key": key,
                                   "vsrag_learned": learned}])
    else:
        rows = [r for r in store.scan_nodes(REPO, key, ("vsrag_learned",)) if r.get("vsrag_learned") is not None]
        learned = rows[0]["vsrag_learned"] if rows else None
    return store, key, snap, at, later, learned


def vector_for(snap: Path) -> VectorRetriever:
    """The vector baseline with its chunk embeddings cached on disk next to the snapshot (same results, fast start)."""
    import numpy as np
    from fastembed import TextEmbedding
    cache = snap.parent / f"{snap.name}.vectors.npz"
    v = VectorRetriever.__new__(VectorRetriever)
    v.model = TextEmbedding(MODEL)
    v._cache = {}
    if cache.exists():
        z = np.load(cache)
        v._cache = dict(zip(z["keys"].tolist(), z["vecs"], strict=True))
    before = len(v._cache)
    v.reload(snap)
    if len(v._cache) != before:
        np.savez(cache, keys=np.array(list(v._cache)), vecs=np.stack(list(v._cache.values())))
    return v


def column(title: str, files: list[str], truth: set[str], tokens: int, ms: float, n_inside: int) -> Table:
    t = Table(title=title, title_style="bold", show_header=False, box=None, pad_edge=False, expand=True)
    t.add_column(width=3, justify="right", style="dim")
    t.add_column(ratio=1, overflow="ellipsis", no_wrap=True)
    for i, f in enumerate(files[:SHOW], 1):
        hit = f in truth
        t.add_row(str(i), Text(("✓ " if hit else "  ") + f, style="bold green" if hit else ""))
    if len(files) > SHOW:
        more = [f for f in files[SHOW:] if f in truth]
        t.add_row("", Text(f"  + {len(files) - SHOW} more in the pack" + (f" (incl. ✓ {', '.join(more)})" if more else ""),
                           style="dim"))
    found = [f for f in files if f in truth]
    t.add_row("", "")
    t.add_row("", Text(f"{tokens:,} tokens · {n_inside} files · {ms:,.0f} ms", style="dim"))
    if truth:
        style = "bold green" if found else "bold red"
        t.add_row("", Text(f"changed files in pack: {len(found)}/{len(truth)}", style=style))
    return t


def replay_all(store, key, snap, at, later, budget: int, name: str) -> None:
    """Every unseen commit, frozen graph (no learning between commits): share of changed files in each pack."""
    eng = RepoEngine(store, key, snap, EngineParams())
    vec = vector_for(snap)
    k_sum = v_sum = 0.0
    k_wins = v_wins = 0
    with console.status(f"Replaying {len(later)} unseen {name} commits…"):
        for c in later:
            truth = set(c.changed)
            k = {i.path for i in eng.get_context(c.task, budget, record=False).items}
            _, v, _ = vec.retrieve(c.task, budget)
            kh, vh = len(truth & k) / len(truth), len(truth & set(v)) / len(truth)
            k_sum, v_sum = k_sum + kh, v_sum + vh
            k_wins += kh > vh
            v_wins += vh > kh
    n = len(later)
    console.rule(f"[bold]{name}[/] · {n} commits after {at.sha[:8]} · {budget:,} tokens each · learning frozen")
    console.print(Text(f"Changed files in the pack   Klew {k_sum / n * 100:.1f}%   vector RAG {v_sum / n * 100:.1f}%",
                       style="bold"))
    console.print(Text(f"Klew found more on {k_wins} commits, vector RAG on {v_wins}, tied on {n - k_wins - v_wins}.",
                       style="dim"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", type=Path, default=Path(".vendor/eval-repos/httpx"))
    ap.add_argument("--name", default=None)
    ap.add_argument("--back", type=int, default=60, help="unseen commits to keep after the snapshot")
    ap.add_argument("--learn", type=int, default=300, help="earlier commits to learn from (warm start)")
    ap.add_argument("--budget", type=int, default=2000)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--commit")
    ap.add_argument("--task")
    ap.add_argument("--all", action="store_true", help="replay every unseen commit and print the totals")
    a = ap.parse_args()
    repo = a.repo.resolve()
    name = a.name or repo.name
    store, key, snap, at, later, learned = snapshot(repo, name, a.back, a.learn)

    if a.all:
        replay_all(store, key, snap, at, later, a.budget, name)
        return

    if a.list or not (a.commit or a.task):
        t = Table(title=f"{name}: commits after {at.sha[:8]} (the graph has never seen these)", box=None)
        for col in ("sha", "files", "message"):
            t.add_column(col, style="dim" if col == "sha" else None)
        for c in later:
            t.add_row(c.sha[:8], str(len(c.changed)), c.subject[:90])
        console.print(t)
        return

    truth: set[str] = set()
    if a.commit:
        c = next((c for c in later if c.sha.startswith(a.commit)), None)
        if c is None:
            raise SystemExit("That commit isn't after the snapshot. Pick one from --list.")
        task, truth = c.task, set(c.changed)
    else:
        task = a.task

    eng = RepoEngine(store, key, snap, EngineParams())
    vec = vector_for(snap)
    t0 = time.perf_counter()
    pack = eng.get_context(task, a.budget, record=False)
    k_ms = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    _, inside, used = vec.retrieve(task, a.budget)
    v_ms = (time.perf_counter() - t0) * 1000

    console.rule(f"[bold]{name}[/] · {a.budget:,}-token budget each")
    console.print(Text("Task: ", style="bold") + Text(task.splitlines()[0]))
    if truth:
        console.print(Text("Actually changed: ", style="bold") + Text(", ".join(sorted(truth)), style="green"))
    console.print()
    grid = Table.grid(expand=True, padding=(0, 4))
    grid.add_column(ratio=1)
    grid.add_column(ratio=1)
    grid.add_row(
        column("Vector RAG (bge-small)", inside, truth, used, v_ms, len(inside)),
        column("Klew (HydraDB graph)", [i.path for i in pack.items], truth, pack.tokens,
               k_ms, len(pack.items)),
    )
    console.print(grid)
    console.print()
    note = f"Graph as of {at.sha[:8]}"
    if learned is not None:
        note += f", learned from {learned} earlier commits"
    console.print(Text(note + ". This commit came later, so neither side has seen it.", style="dim"))
    res = Path("eval/results") / f"{name}.json"
    if res.exists():   # the aggregate, straight from the eval results
        d = json.loads(res.read_text())
        s = d.get("summary_held_out") or d["summary"]
        n = d.get("held_out_commits") or d["scored"]
        pct = lambda arm: f"{s[arm]['budget_recall'] * 100:.0f}%" if arm in s else "–"  # noqa: E731
        console.print(Text(f"That's one commit. Across {n} held-out {name} commits, right file in context: "
                           f"Klew {pct('graph_learn')}, Klew + vector seeds {pct('graph_hybrid')}, "
                           f"vector RAG {pct('vector')}.", style="dim"))


if __name__ == "__main__":
    main()
