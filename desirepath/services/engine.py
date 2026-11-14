"""RepoEngine: the application service for one indexed repository.

get_context: task → seeds (lexical + learned) → walk (HydraDB) → rank → pack.
record_outcome: touched files → LearningRule → learned edges written back to HydraDB.
"""
from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import structlog

from .. import ids
from ..adapters.source_reader import read_span
from ..domain import learning, seeder
from ..domain.packer import pack, promote_companions, rank_files, why_path
from ..domain.walker import walk
from ..models import ContextPack, LearnReport, Timings
from ..ports import GraphStore
from ..schema import CO_CHANGED, FILE, POINTS_TO, REPO, RUN, SERVED, SYMBOL, TERM, TOUCHED

log = structlog.get_logger()

SYM_FIELDS = ("qualname", "name", "kind", "file_id", "doc", "terms")
ABSTAIN_BELOW = 0.15


@dataclass
class EngineParams:
    hops: int = 2
    beam: int = 48
    lexical_k: int = 12
    learned_k: int = 12
    learned_weight: float = 1.0
    use_learned: bool = True
    external_weight: float = 1.0
    hub_damping: float = 0.5  # tuned on the held-in slice (first 50 httpx commits)
    max_items: int = 30            # cap on files per pack (12 left ~40% of the budget unused)
    companion_weight: float = 0.4  # pulls in top files' tests and co-change partners (tuned, held-in)
    companion_top_k: int = 3
    learn: learning.LearnParams = field(default_factory=learning.LearnParams)


# Optional extra seed source (e.g. a vector index): task → [(repo-relative path, score in 0..1)].
ExternalSeeds = Callable[[str], list[tuple[str, float]]]


@dataclass
class _Run:
    run_id: int
    task: str
    term_ids: list[int]
    served: list[int]


class RepoEngine:
    def __init__(self, store: GraphStore, repo: str, root: Path | None = None,
                 params: EngineParams | None = None, external_seeds: ExternalSeeds | None = None):
        self.store, self.repo, self.root = store, repo, root
        self.p = params or EngineParams()
        self.external_seeds = external_seeds
        self._runs: dict[int, _Run] = {}
        self.reload()

    # -- state ------------------------------------------------------------------------------
    def reload(self) -> None:
        files = self.store.scan_nodes(FILE, self.repo, ("path", "is_test", "tokens"))
        syms = self.store.scan_nodes(SYMBOL, self.repo, SYM_FIELDS)
        self.path_of = {f["id"]: f["path"] for f in files}
        self.fid_of = {f["path"]: f["id"] for f in files}
        self.test_files = {f["id"] for f in files if f.get("is_test")}
        self.tests_for = _test_companions(files)
        self.sym_file = {s["id"]: s["file_id"] for s in syms}
        self.file_size: dict[int, int] = {}
        for fid in self.sym_file.values():
            self.file_size[fid] = self.file_size.get(fid, 0) + 1
        self.sym_key = {s["id"]: s["qualname"] for s in syms}
        self.lexicon = seeder.Lexicon.build(files, syms)
        terms = self.store.scan_nodes(TERM, self.repo, ("text", "df"))
        self.term_df = {t["text"]: int(t.get("df") or 0) for t in terms}
        meta = self.store.get_nodes(REPO, [ids.stable_id(self.repo, "repo")], ("runs",))
        self.n_runs = int(meta[0].get("runs") or 0) if meta else 0

    def key_of(self, nid: int) -> str:
        return self.path_of.get(nid) or self.sym_key.get(nid) or str(nid)

    # -- retrieval ----------------------------------------------------------------------------
    def get_context(self, task: str, budget_tokens: int = 2000, *, record: bool = True,
                    source: str = "agent", include_tests: bool = True) -> ContextPack:
        t0 = time.perf_counter()
        q0 = self.store.queries
        terms = seeder.task_terms(task)
        term_ids = [ids.term_id(self.repo, t) for t in terms]

        lex = seeder.lexical_seeds(self.lexicon, task, k=self.p.lexical_k)
        learned: list[seeder.Seed] = []
        if self.p.use_learned:
            known = [(tid, t) for tid, t in zip(term_ids, terms, strict=True) if t in self.term_df]
            if known:
                tf: dict[int, dict[int, float]] = {}
                for n in self.store.expand(POINTS_TO, "out", [tid for tid, _ in known]):
                    if n.w > self.p.learn.prune_below:
                        tf.setdefault(n.src, {})[n.dst] = n.w
                idf = {tid: seeder.idf(self.term_df.get(t, 0), self.n_runs) for tid, t in known}
                learned = seeder.learned_seeds(tf, idf, dict(known), k=self.p.learned_k)
        seeds = seeder.merge_seeds(lex, learned, self.p.learned_weight)
        if self.external_seeds is not None:
            ext = [seeder.Seed(self.fid_of[p], FILE, sc, f"vector match: {p}")
                   for p, sc in self.external_seeds(task) if p in self.fid_of]
            seeds = seeder.merge_seeds(seeds, ext, self.p.external_weight)
        seeds = seeds[: self.p.lexical_k + self.p.learned_k]
        t_seed = time.perf_counter()

        run_id = ids.stable_id(self.repo, "run", task, str(time.time_ns()))
        if not seeds or seeds[0].score < ABSTAIN_BELOW:
            # Still register the run: learning from the outcome of a task we could not answer
            # is exactly how the graph fills its gaps.
            self._runs[run_id] = _Run(run_id, task, term_ids, [])
            self._ranked_cache = []
            return ContextPack(run_id=run_id, repo=self.repo, task=task, items=[], tokens=0,
                               budget_tokens=budget_tokens, abstained=True,
                               abstain_reason="nothing in the graph matches this task",
                               timings=Timings(total_ms=_ms(t0), queries=self.store.queries - q0))

        res = walk(self.store, seeds, hops=self.p.hops, beam=self.p.beam)
        t_walk = time.perf_counter()
        ranked = rank_files(res, self.sym_file, set(self.path_of),
                            exclude_tests=None if include_tests else self.test_files,
                            file_size=self.file_size, hub_damping=self.p.hub_damping)
        if self.p.companion_weight > 0 and ranked:
            ranked = promote_companions(ranked, self._companions(ranked[: self.p.companion_top_k]),
                                        self.p.companion_top_k, self.p.companion_weight)
        t_rank = time.perf_counter()

        need = [sid for rf in ranked[:24] for sid, _ in rf.symbols[:4]]
        rows = {r["id"]: r for r in self.store.get_nodes(SYMBOL, need, ("sig", "doc", "start", "end"))}
        root = self.root
        snippet_of = (lambda p, s, e: read_span(root, p, s, e)) if root else None
        reasons = {s.node_id: s.reason for s in seeds}
        by_id = {r.file_id: r for r in ranked}
        items = pack(ranked, budget_tokens, path_of=lambda f: self.path_of.get(f, str(f)),
                     sym_rows=rows, snippet_of=snippet_of,
                     why_of=lambda rf: why_path(res, rf, self.key_of, by_id), seed_reason=reasons,
                     max_items=self.p.max_items)
        t_pack = time.perf_counter()

        pack_ = ContextPack(
            run_id=run_id, repo=self.repo, task=task, items=items,
            tokens=sum(i.tokens for i in items), budget_tokens=budget_tokens,
            timings=Timings(seed_ms=_ms(t0, t_seed), walk_ms=_ms(t_seed, t_walk),
                            rank_ms=_ms(t_walk, t_rank), pack_ms=_ms(t_rank, t_pack),
                            total_ms=_ms(t0), queries=self.store.queries - q0))
        # Ranked (not only packed) files are what learning decays against.
        served = [rf.file_id for rf in ranked[:10]]
        self._runs[run_id] = _Run(run_id, task, term_ids, served)
        self._ranked_cache = ranked
        if record:
            self._record_run(pack_, source)
        return pack_

    def _companions(self, top) -> dict[int, list[tuple[int, str]]]:
        """Test file(s) by name, plus the strongest co-change partner (one HydraDB query)."""
        out: dict[int, list[tuple[int, str]]] = {}
        for r in top:
            out[r.file_id] = [(t, "tested in") for t in self.tests_for.get(r.file_id, [])[:1]]
        best: dict[int, tuple[float, int]] = {}
        for n in self.store.expand(CO_CHANGED, "out", [r.file_id for r in top]):
            if n.w > best.get(n.src, (0.0, 0))[0]:
                best[n.src] = (n.w, n.dst)
        for src, (_, dst) in best.items():
            out.setdefault(src, []).append((dst, "changes with"))
        return out

    def ranked_paths(self, task: str, k: int = 20) -> list[str]:
        """Ranking only (no packing); used by the eval for recall@k."""
        self.get_context(task, budget_tokens=0, record=False)
        return [self.path_of[r.file_id] for r in self._ranked_cache[:k] if r.file_id in self.path_of]

    def _record_run(self, p: ContextPack, source: str) -> None:
        self.store.upsert_nodes(RUN, [{
            "id": p.run_id, "repo": self.repo, "key": f"run:{p.run_id}", "task": p.task[:2000],
            "ts": int(time.time()), "source": source,
            "served_json": json.dumps([i.path for i in p.items]), "truth_json": "",
            "tokens_served": p.tokens}])
        self.store.upsert_edges(SERVED, [{"src": p.run_id, "dst": it.file_id, "w": it.score,
                                          "rank": r} for r, it in enumerate(p.items)])

    # -- learning -----------------------------------------------------------------------------
    def record_outcome(self, run_id: int, touched_paths: list[str],
                       task: str | None = None) -> LearnReport:
        run = self._runs.get(run_id)
        if run is None:
            if task is None:
                raise KeyError(f"unknown run {run_id}; pass the task to learn without a run")
            terms = seeder.task_terms(task)
            run = _Run(run_id, task, [ids.term_id(self.repo, t) for t in terms], [])
        truth = [self.fid_of[p] for p in dict.fromkeys(touched_paths) if p in self.fid_of]
        terms = seeder.task_terms(run.task)
        pt_pairs = [(t, f) for t in run.term_ids for f in set(truth) | set(run.served)]
        pt_cur = self.store.edge_weights(POINTS_TO, pt_pairs) if pt_pairs else {}
        cc_pairs = [(a, b) for a in truth for b in truth if a != b]
        cc_cur = self.store.edge_weights(CO_CHANGED, cc_pairs) if cc_pairs else {}
        delta = learning.apply(run.term_ids, run.served, truth, pt_cur, cc_cur, self.p.learn)

        if delta.points_to:
            for t in terms:
                self.term_df[t] = self.term_df.get(t, 0) + 1
            self.store.upsert_nodes(TERM, [
                {"id": ids.term_id(self.repo, t), "repo": self.repo, "key": t, "text": t,
                 "df": self.term_df[t]} for t in terms])
            self.store.upsert_edges(POINTS_TO, [
                {"src": u.src, "dst": u.dst, "w": u.w, "hits": u.hits, "misses": u.misses}
                for u in delta.points_to])
        if delta.co_changed:
            self.store.upsert_edges(CO_CHANGED, [
                {"src": u.src, "dst": u.dst, "w": u.w, "hits": u.hits, "misses": u.misses}
                for u in delta.co_changed])
        if truth:
            self.n_runs += 1
            self.store.upsert_nodes(REPO, [{"id": ids.stable_id(self.repo, "repo"), "repo": self.repo,
                                            "key": self.repo, "runs": self.n_runs}])
            if run_id in self._runs:
                self.store.upsert_edges(TOUCHED, [{"src": run_id, "dst": f, "w": 1.0} for f in truth])
        served_set = set(run.served)
        return LearnReport(
            run_id=run_id,
            hits=[self.path_of[f] for f in truth if f in served_set],
            misses=[self.path_of[f] for f in run.served[:5] if f not in set(truth)],
            unserved=[self.path_of[f] for f in truth if f not in served_set],
            edges_reinforced=delta.reinforced, edges_decayed=delta.decayed,
            edges_created=delta.created)


def _ms(a: float, b: float | None = None) -> float:
    return round(((b if b is not None else time.perf_counter()) - a) * 1000, 2)


def _test_companions(files: list[dict]) -> dict[int, list[int]]:
    """Map source files to test files by name: tests/**/test_urls.py ↔ pkg/_urls.py or pkg/urls.py."""
    by_stem: dict[str, list[int]] = {}
    for f in files:
        if f.get("is_test"):
            name = f["path"].rsplit("/", 1)[-1].removesuffix(".py")
            if name.startswith("test_"):
                by_stem.setdefault(name[5:], []).append(f["id"])
    out: dict[int, list[int]] = {}
    for f in files:
        if not f.get("is_test"):
            stem = f["path"].rsplit("/", 1)[-1].removesuffix(".py").lstrip("_")
            if stem in by_stem:
                out[f["id"]] = by_stem[stem]
    return out


def warm_start(engine: RepoEngine, history: list, limit: int = 300, max_files: int = 8) -> int:
    """Learn from the repository's own past commits, so a fresh install starts with a learned graph.
    Each commit message is a task; the .py files it modified (that still exist) are the outcome."""
    n = 0
    for c in history[-limit:]:
        truth = [f for f in c.changed if f in engine.fid_of]
        if not truth or len(c.changed) > max_files:
            continue
        pack = engine.get_context(c.task, 2000, record=False, source="warm-start")
        engine.record_outcome(pack.run_id, truth)
        n += 1
    return n
