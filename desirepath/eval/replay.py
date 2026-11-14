"""Git-history replay: does the graph get sharper every run, and does it beat a vector store?

For each commit in a window, oldest first:
  task  = commit message, truth = .py files it modified (that exist in the snapshot)
  every arm retrieves under the same token budget, then the learning arm learns from the truth.
The code snapshot is re-indexed every `reindex_every` commits at the parent of the next commit,
so no arm ever sees code from the future.

Arms:
  vector        bge-small chunk embeddings, cosine top-k, greedy pack to budget
  bm25          BM25 over the same chunks
  graph_static  Desirepath graph with history co-change, no online learning
  graph_learn   Desirepath graph, learns from every replayed commit (the product loop)
"""
from __future__ import annotations

import json
import statistics
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import structlog

from .. import ids
from ..adapters.git_miner import Commit, commits, remove_worktree, worktree
from ..ports import GraphStore
from ..schema import FILE, SYMBOL
from ..services.engine import EngineParams, RepoEngine
from ..services.index import IndexService

log = structlog.get_logger()


@dataclass
class ArmResult:
    ranked: list[str]
    inside: list[str]
    tokens: int
    ms: float


@dataclass
class CommitRecord:
    i: int
    sha: str
    task: str
    truth: list[str]
    arms: dict[str, dict] = field(default_factory=dict)


def metrics(ranked: list[str], inside: list[str], truth: list[str]) -> dict:
    t = set(truth)
    rr = next((1.0 / (k + 1) for k, p in enumerate(ranked) if p in t), 0.0)
    return {
        "recall@5": len(t & set(ranked[:5])) / len(t),
        "recall@10": len(t & set(ranked[:10])) / len(t),
        "hit@1": 1.0 if ranked[:1] and ranked[0] in t else 0.0,
        "mrr": rr,
        "budget_recall": len(t & set(inside)) / len(t),
    }


def _sync_learn_arm(store: GraphStore, repo: str, root: Path, svc: IndexService) -> None:
    """Re-index a learning graph in place: refresh structure, keep learned edges, drop stale nodes."""
    old = {r["path"]: r["id"] for r in store.scan_nodes(FILE, repo, ("path",))}
    old_syms = {r["id"] for r in store.scan_nodes(SYMBOL, repo, ("qualname",))}
    svc.index(repo, root, history=None, fresh=False)
    new = {r["path"] for r in store.scan_nodes(FILE, repo, ("path",))}
    from ..adapters.source_reader import parse_repo
    live_paths = {f.path for f in parse_repo(root)}
    live_syms = {ids.symbol_id(repo, s.qualname) for f in parse_repo(root) for s in f.symbols}
    stale_files = [fid for p, fid in old.items() if p not in live_paths and p in new]
    if stale_files:
        store.delete_nodes(FILE, stale_files)
    stale_syms = list(old_syms - live_syms)
    if stale_syms:
        store.delete_nodes(SYMBOL, stale_syms)


def run_replay(store: GraphStore, repo_root: Path, name: str, *, window: int = 300,
               reindex_every: int = 50, budget: int = 2000, max_truth: int = 8,
               arms: tuple[str, ...] = ("vector", "bm25", "graph_static", "graph_learn"),
               out_dir: Path = Path("eval/results"), work_dir: Path = Path(".desirepath/eval"),
               params: EngineParams | None = None, head: int | None = None,
               write: bool = True) -> dict:
    """`head` limits the replay to the first N commits of the window (the held-in tuning slice)."""
    t_start = time.perf_counter()
    all_commits = commits(repo_root)
    eligible = [c for c in all_commits if 1 <= len(c.changed) <= max_truth]
    window_commits = eligible[-window:]
    first_sha = window_commits[0].sha
    first_idx = next(i for i, c in enumerate(all_commits) if c.sha == first_sha)
    repo_root = repo_root.resolve()
    snap = worktree(repo_root, f"{first_sha}^", work_dir.resolve() / f"{name}-snap")
    svc = IndexService(store)
    keys = {"graph_static": f"{name}::static", "graph_learn": f"{name}::learn",
            "graph_hybrid": f"{name}::hybrid"}
    if "graph_hybrid" in arms and "vector" not in arms:
        arms = ("vector", *arms)

    def history_before(sha: str) -> list[Commit]:
        idx = next(i for i, c in enumerate(all_commits) if c.sha == sha)
        return all_commits[:idx]

    engines: dict[str, RepoEngine] = {}
    retrievers: dict = {}
    records: list[CommitRecord] = []
    reindex_s = 0.0

    def reindex(at_sha: str, initial: bool) -> None:
        nonlocal reindex_s
        t = time.perf_counter()
        worktree(repo_root, f"{at_sha}^", snap)
        hist = history_before(at_sha)
        if "graph_static" in arms:
            svc.index(keys["graph_static"], snap, history=hist, fresh=True)
            engines["graph_static"] = RepoEngine(store, keys["graph_static"], snap,
                                                 EngineParams(use_learned=False))
        for arm in ("graph_learn", "graph_hybrid"):
            if arm not in arms:
                continue
            if initial:
                svc.index(keys[arm], snap, history=hist, fresh=True)
                ext = None
                if arm == "graph_hybrid":
                    ext = lambda task: retrievers["vector"].file_scores(task)  # noqa: E731
                engines[arm] = RepoEngine(store, keys[arm], snap, params, external_seeds=ext)
            else:
                _sync_learn_arm(store, keys[arm], snap, svc)
                engines[arm].reload()
        if "bm25" in arms:
            from ..baselines.lexical import BM25Retriever
            if "bm25" in retrievers:
                retrievers["bm25"].reload(snap)
            else:
                retrievers["bm25"] = BM25Retriever(snap)
        if "vector" in arms:
            from ..baselines.vector import VectorRetriever
            if "vector" in retrievers:
                retrievers["vector"].reload(snap)
            else:
                retrievers["vector"] = VectorRetriever(snap)
        reindex_s += time.perf_counter() - t

    for i, c in enumerate(window_commits[:head] if head else window_commits):
        if i % reindex_every == 0:
            reindex(c.sha, initial=(i == 0))
        snap_paths = set(engines["graph_static"].fid_of) if "graph_static" in engines else (
            set(engines["graph_learn"].fid_of) if "graph_learn" in engines else None)
        truth = [p for p in c.changed if snap_paths is None or p in snap_paths]
        if not truth:
            continue
        rec = CommitRecord(i, c.sha[:10], c.task[:300], truth)
        for arm in arms:
            t = time.perf_counter()
            if arm in retrievers:
                ranked, inside, used = retrievers[arm].retrieve(c.task, budget)
            else:
                eng = engines[arm]
                p = eng.get_context(c.task, budget, record=False, source="replay")
                ranked = [eng.path_of[r.file_id] for r in eng._ranked_cache[:20]]
                inside, used = p.ranked_paths(), p.tokens
                if arm in ("graph_learn", "graph_hybrid"):
                    eng.record_outcome(p.run_id, truth)
            ms = (time.perf_counter() - t) * 1000
            rec.arms[arm] = {**metrics(ranked, inside, truth), "tokens": used, "ms": round(ms, 1),
                             "top": ranked[:5]}
        records.append(rec)
        if len(records) % 25 == 0:
            log.info("replay", repo=name, done=len(records), at=i,
                     **{a: round(statistics.mean(r.arms[a]["recall@5"] for r in records[-25:]), 3)
                        for a in arms})

    summary = summarize(records, arms)
    result = {
        "repo": name, "source": str(repo_root), "window": len(window_commits),
        "scored": len(records), "budget_tokens": budget, "reindex_every": reindex_every,
        "first_commit": first_sha, "last_commit": window_commits[-1].sha,
        "history_commits_before_window": first_idx, "arms": list(arms),
        "summary": summary, "curves": curves(records, arms),
        "params": asdict(params or EngineParams()),
        "runtime_s": round(time.perf_counter() - t_start, 1), "reindex_s": round(reindex_s, 1),
        "records": [asdict(r) for r in records],
    }
    if write:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / f"{name}.json").write_text(json.dumps(result, indent=1))
    remove_worktree(repo_root, snap)
    return result


def summarize(records: list[CommitRecord], arms) -> dict:
    out = {}
    n = len(records)
    for a in arms:
        rows = [r.arms[a] for r in records]
        s = {k: round(statistics.mean(x[k] for x in rows), 4)
             for k in ("recall@5", "recall@10", "hit@1", "mrr", "budget_recall")}
        s["tokens_mean"] = round(statistics.mean(x["tokens"] for x in rows), 1)
        lat = sorted(x["ms"] for x in rows)
        s["p50_ms"] = lat[len(lat) // 2]
        s["p95_ms"] = lat[int(len(lat) * 0.95) - 1] if lat else 0
        half = n // 2
        s["recall@5_first_half"] = round(statistics.mean(x["recall@5"] for x in rows[:half]), 4)
        s["recall@5_second_half"] = round(statistics.mean(x["recall@5"] for x in rows[half:]), 4)
        hits = sum(x["budget_recall"] for x in rows)
        s["tokens_per_hit"] = round(sum(x["tokens"] for x in rows) / hits, 1) if hits else None
        out[a] = s
    return out


def curves(records: list[CommitRecord], arms, window: int = 50) -> dict:
    """Trailing-window mean of recall@5 and budget recall per arm."""
    out = {}
    for a in arms:
        r5 = [r.arms[a]["recall@5"] for r in records]
        br = [r.arms[a]["budget_recall"] for r in records]
        out[a] = {
            "recall@5": [round(statistics.mean(r5[max(0, k - window + 1): k + 1]), 4) for k in range(len(r5))],
            "budget_recall": [round(statistics.mean(br[max(0, k - window + 1): k + 1]), 4) for k in range(len(br))],
        }
    return out
