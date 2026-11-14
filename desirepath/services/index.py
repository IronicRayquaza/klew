"""IndexService: repository → code graph in the GraphStore."""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import structlog

from .. import ids
from ..adapters.git_miner import Commit, co_change
from ..adapters.source_reader import ParsedFile, ParsedSymbol, parse_repo
from ..ports import GraphStore
from ..schema import CALLS, CO_CHANGED, CONTAINS, FILE, IMPORTS, INHERITS, SYMBOL, TESTS

log = structlog.get_logger()

MAX_GLOBAL_CANDIDATES = 2   # an unresolved name may fan out to at most this many definitions
CO_CHANGE_MIN = 2           # pairs must have co-changed at least this often


@dataclass
class IndexReport:
    repo: str
    files: int
    symbols: int
    edges: dict[str, int]
    seconds: float
    learned: int = 0


class _Resolver:
    """Static name resolution across the repository."""

    def __init__(self, files: list[ParsedFile]):
        self.by_qual: dict[str, ParsedSymbol] = {}
        self.module_to_path: dict[str, str] = {}
        self.by_name: dict[str, list[str]] = defaultdict(list)
        self.methods: dict[str, dict[str, str]] = defaultdict(dict)  # class qual -> name -> qual
        self.class_bases: dict[str, list[str]] = {}
        for f in files:
            self.module_to_path[f.module] = f.path
            for s in f.symbols:
                self.by_qual[s.qualname] = s
                if s.kind != "test":
                    self.by_name[s.name].append(s.qualname)
                if s.parent_class and s.kind in ("method", "test"):
                    self.methods[s.parent_class][s.name] = s.qualname

    def resolve_dotted(self, dotted: str) -> str | None:
        """Map an import target to a symbol qualname, following package re-exports one level."""
        if dotted in self.by_qual:
            return dotted
        return None

    def module_path(self, dotted: str) -> str | None:
        while dotted:
            if dotted in self.module_to_path:
                return self.module_to_path[dotted]
            dotted = dotted.rpartition(".")[0]
        return None

    def method_on(self, cls: str, name: str, depth: int = 0) -> str | None:
        if name in self.methods.get(cls, {}):
            return self.methods[cls][name]
        if depth < 3:
            for base in self.class_bases.get(cls, []):
                hit = self.method_on(base, name, depth + 1)
                if hit:
                    return hit
        return None


def _bind(f: ParsedFile, name: str, r: _Resolver, reexports: dict[str, str]) -> str | None:
    target = f.bindings.get(name)
    if target:
        hit = r.resolve_dotted(target) or r.resolve_dotted(reexports.get(target, ""))
        if hit:
            return hit
    local = f"{f.module}.{name}" if f.module else name
    if local in r.by_qual:
        return local
    return None


def build_graph(repo: str, files: list[ParsedFile]) -> tuple[dict, dict]:
    """Pure: parsed files → ({label: rows}, {edge_type_name: rows})."""
    r = _Resolver(files)
    by_path = {f.path: f for f in files}

    # Package re-exports: `from ._client import Client` in httpx/__init__.py means
    # `httpx.Client` resolves to `httpx._client.Client`.
    reexports: dict[str, str] = {}
    for f in files:
        if f.path.endswith("__init__.py"):
            for local, target in f.bindings.items():
                if target in r.by_qual:
                    reexports[f"{f.module}.{local}"] = target

    # Class bases need resolution before method lookup through inheritance.
    for f in files:
        for s in f.symbols:
            if s.kind == "class":
                resolved = []
                for b in s.bases:
                    head = b.split(".")[-1]
                    hit = _bind(f, head, r, reexports)
                    if hit:
                        resolved.append(hit)
                r.class_bases[s.qualname] = resolved

    file_rows, sym_rows = [], []
    edges: dict[str, dict[tuple[int, int], dict]] = defaultdict(dict)

    def add_edge(etype: str, src: int, dst: int, w: float = 1.0, **extra) -> None:
        if src == dst:
            return
        cur = edges[etype].get((src, dst))
        if cur is None or cur["w"] < w:
            edges[etype][(src, dst)] = {"src": src, "dst": dst, "w": round(w, 4), **extra}

    for f in files:
        fid = ids.file_id(repo, f.path)
        file_rows.append({"id": fid, "repo": repo, "key": f.path, "path": f.path,
                          "tokens": f.tokens, "sha": f.sha, "is_test": f.is_test})
        for s in f.symbols:
            sid = ids.symbol_id(repo, s.qualname)
            sym_rows.append({"id": sid, "repo": repo, "key": s.qualname, "file_id": fid,
                             "path": f.path, "qualname": s.qualname, "name": s.name, "kind": s.kind,
                             "sig": s.sig, "doc": s.doc[:200], "start": s.start, "end": s.end,
                             "tokens": s.tokens, "terms": s.terms})
            add_edge(CONTAINS.name, fid, sid)

        # File imports
        for mod in f.imported_modules:
            target = r.module_path(mod)
            if target and target != f.path:
                add_edge(IMPORTS.name, fid, ids.file_id(repo, target))

    for f in files:
        for s in f.symbols:
            sid = ids.symbol_id(repo, s.qualname)
            if s.kind == "class":
                for base in r.class_bases.get(s.qualname, []):
                    add_edge(INHERITS.name, sid, ids.symbol_id(repo, base))
                continue
            etype = TESTS.name if s.kind == "test" else CALLS.name
            for recv, name in s.calls:
                targets: list[str] = []
                if recv == "":
                    hit = _bind(f, name, r, reexports)
                    if hit:
                        targets = [hit]
                elif recv in ("self", "cls") and s.parent_class:
                    hit = r.method_on(s.parent_class, name)
                    if hit:
                        targets = [hit]
                elif recv != "?":
                    # module.attr where module is an import binding: `httpx.get(...)`
                    bound = f.bindings.get(recv)
                    if bound:
                        cand = f"{bound}.{name}"
                        hit = r.resolve_dotted(cand) or r.resolve_dotted(reexports.get(cand, ""))
                        if hit:
                            targets = [hit]
                if not targets:
                    cands = [q for q in r.by_name.get(name, []) if q != s.qualname]
                    if 0 < len(cands) <= MAX_GLOBAL_CANDIDATES and not name.startswith("__"):
                        targets = cands
                w = 1.0 / len(targets) if targets else 0
                for t in targets:
                    add_edge(etype, sid, ids.symbol_id(repo, t), w)

    nodes = {FILE: file_rows, SYMBOL: sym_rows}
    return nodes, {k: list(v.values()) for k, v in edges.items()}, by_path


def co_change_edges(repo: str, history: list[Commit], known_paths: set[str]) -> list[dict]:
    cc = co_change(history)
    rows = []
    for (a, b), n in cc.pair_counts.items():
        if n < CO_CHANGE_MIN or a not in known_paths or b not in known_paths:
            continue
        w = round(cc.weight(a, b), 4)
        fa, fb = ids.file_id(repo, a), ids.file_id(repo, b)
        rows.append({"src": fa, "dst": fb, "w": w, "count": n, "hits": 0, "misses": 0})
        rows.append({"src": fb, "dst": fa, "w": w, "count": n, "hits": 0, "misses": 0})
    return rows


class IndexService:
    def __init__(self, store: GraphStore):
        self.store = store

    def index(self, repo: str, root: Path, history: list[Commit] | None = None,
              fresh: bool = True) -> IndexReport:
        t0 = time.perf_counter()
        if fresh:
            self.store.delete_repo(repo)
        files = parse_repo(root)
        nodes, edges, _ = build_graph(repo, files)
        for label, rows in nodes.items():
            self.store.upsert_nodes(label, rows)
        from ..schema import EDGE_TYPES
        for name, rows in edges.items():
            self.store.upsert_edges(EDGE_TYPES[name], rows)
        if history:
            cc_rows = co_change_edges(repo, history, {f.path for f in files})
            self.store.upsert_edges(CO_CHANGED, cc_rows)
            edges[CO_CHANGED.name] = cc_rows
        rep = IndexReport(repo, len(nodes[FILE]), len(nodes[SYMBOL]),
                          {k: len(v) for k, v in edges.items()}, round(time.perf_counter() - t0, 2))
        log.info("indexed", **rep.__dict__)
        return rep
