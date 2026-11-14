"""Composition root: builds the store and per-repo engines from settings.

The CLI, MCP server and REST API all go through here, so they share one way of
opening a repository.
"""
from __future__ import annotations

import threading
from pathlib import Path

from . import ids
from .adapters.git_miner import commits, head_sha
from .config import Settings, get_settings
from .models import GraphStats
from .ports import GraphStore
from .schema import CO_CHANGED, EDGE_TYPES, FILE, REPO, RUN, SYMBOL, TERM
from .services.engine import RepoEngine
from .services.index import IndexReport, IndexService


def make_store(settings: Settings | None = None) -> GraphStore:
    s = settings or get_settings()
    if s.store == "memory":
        from .adapters.memory_store import MemoryGraphStore
        return MemoryGraphStore()
    from .adapters.hydra_store import HydraGraphStore
    return HydraGraphStore(s.hydra)


def repo_key_for(root: Path) -> str:
    return root.resolve().name


class Runtime:
    def __init__(self, store: GraphStore | None = None):
        self.store = store or make_store()
        self._engines: dict[str, RepoEngine] = {}
        self._lock = threading.Lock()

    def index(self, root: Path, repo: str | None = None, history: int | None = 2000) -> IndexReport:
        root = root.resolve()
        repo = repo or repo_key_for(root)
        hist = None
        if history and (root / ".git").exists():
            hist = commits(root, max_count=history)
        rep = IndexService(self.store).index(repo, root, history=hist, fresh=True)
        head = head_sha(root) if (root / ".git").exists() else ""
        self.store.upsert_nodes(REPO, [{"id": ids.stable_id(repo, "repo"), "repo": repo, "key": repo,
                                        "root": str(root), "head": head}])
        with self._lock:
            self._engines.pop(repo, None)
        return rep

    def repos(self) -> list[dict]:
        # Only repos indexed through `desirepath index` carry a root; eval-internal graphs don't.
        rows = self.store.list_nodes(REPO, ("repo", "root", "head", "runs"))
        return sorted((r for r in rows if r.get("root")), key=lambda r: r.get("repo") or "")

    def engine(self, repo: str, root: Path | None = None) -> RepoEngine:
        with self._lock:
            eng = self._engines.get(repo)
            if eng is None:
                if root is None:
                    meta = self.store.get_nodes(REPO, [ids.stable_id(repo, "repo")], ("root",))
                    root = Path(meta[0]["root"]) if meta and meta[0].get("root") else None
                eng = RepoEngine(self.store, repo, root)
                self._engines[repo] = eng
            return eng

    def ensure_indexed(self, root: Path, repo: str | None = None) -> RepoEngine:
        root = root.resolve()
        repo = repo or repo_key_for(root)
        if not self.store.scan_nodes(FILE, repo, ("path",)):
            self.index(root, repo)
        return self.engine(repo, root)

    def stats(self, repo: str) -> GraphStats:
        files = len(self.store.scan_nodes(FILE, repo, ("path",)))
        syms = len(self.store.scan_nodes(SYMBOL, repo, ("qualname",)))
        terms = len(self.store.scan_nodes(TERM, repo, ("text",)))
        runs = len(self.store.scan_nodes(RUN, repo, ("ts",)))
        edges = {name: self.store.count_edges(e, repo) for name, e in EDGE_TYPES.items()}
        return GraphStats(repo=repo, files=files, symbols=syms, terms=terms, runs=runs, edges=edges)


_default: Runtime | None = None


def get_runtime() -> Runtime:
    global _default
    if _default is None:
        _default = Runtime()
    return _default


__all__ = ["Runtime", "get_runtime", "make_store", "repo_key_for", "CO_CHANGED"]
