"""GraphStore backed by a HydraDB node over Bolt (Neo4j driver)."""
from __future__ import annotations

import threading
from collections.abc import Iterable, Sequence

from neo4j import GraphDatabase

from .. import ids as idmod
from ..config import HydraConfig
from ..ports import Neighbor, Row
from ..schema import EDGE_TYPES, NODE_FIELDS, EdgeType
from . import queries as Q

BATCH = 1000  # HydraDB caps UNWIND batches at 1024 items
ID_CHUNK = 1000


def _chunks(seq: Sequence, n: int):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


class HydraGraphStore:
    def __init__(self, cfg: HydraConfig | None = None):
        cfg = cfg or HydraConfig()
        self._driver = GraphDatabase.driver(cfg.uri, auth=("neo4j", cfg.token))
        self._db = cfg.database
        # Sessions are not thread-safe, the driver is: one session per thread lets the walker
        # run a hop's expansions concurrently.
        self._local = threading.local()
        self._sessions: list = []
        self._count_lock = threading.Lock()
        self.queries = 0

    # -- plumbing -------------------------------------------------------------------------
    def _run(self, cypher: str, **params) -> list[Row]:
        # HydraDB rejects explicit transactions, so every statement is an auto-commit RUN.
        sess = getattr(self._local, "session", None)
        if sess is None:
            sess = self._local.session = self._driver.session(database=self._db)
            with self._count_lock:
                self._sessions.append(sess)
        with self._count_lock:
            self.queries += 1
        return [r.data() for r in sess.run(cypher, params)]

    def ping(self) -> None:
        self._driver.verify_connectivity()

    # -- writes ---------------------------------------------------------------------------
    def upsert_nodes(self, label: str, rows: Sequence[Row]) -> None:
        if not rows:
            return
        fields = tuple(f for f in NODE_FIELDS[label] if f in rows[0])
        cypher = Q.upsert_nodes(label, fields)
        for chunk in _chunks(list(rows), BATCH):
            self._run(cypher, rows=[{"id": r["id"], **{f: r.get(f) for f in fields}} for r in chunk])

    def upsert_edges(self, etype: EdgeType, rows: Sequence[Row]) -> None:
        if not rows:
            return
        extra = tuple(k for k in rows[0] if k not in ("src", "dst", "eid"))
        cypher = Q.upsert_edges(etype, extra)
        for chunk in _chunks(list(rows), BATCH):
            self._run(cypher, rows=[
                {"src": r["src"], "dst": r["dst"],
                 "eid": r.get("eid") or idmod.edge_id(etype.name, r["src"], r["dst"]),
                 **{k: r.get(k) for k in extra}}
                for r in chunk
            ])

    def delete_nodes(self, label: str, ids: Iterable[int]) -> None:
        ids = list(dict.fromkeys(ids))
        for chunk in _chunks(ids, ID_CHUNK):
            self._run(Q.delete_nodes(label), ids=chunk)

    def delete_repo(self, repo: str) -> None:
        for label in NODE_FIELDS:
            self._run(Q.delete_repo(label), repo=repo)

    # -- reads ----------------------------------------------------------------------------
    def expand(self, etype: EdgeType, direction: str, ids: Iterable[int]) -> list[Neighbor]:
        ids = list(dict.fromkeys(ids))
        out: list[Neighbor] = []
        cypher = Q.expand(etype, direction)
        for chunk in _chunks(ids, ID_CHUNK):
            for r in self._run(cypher, ids=chunk):
                a, b = r["src"], r["dst"]
                # Edge ids are identity, not readable properties; recompute from the endpoints.
                eid = idmod.edge_id(etype.name, a, b) if direction == "out" else idmod.edge_id(etype.name, b, a)
                out.append(Neighbor(a, b, eid, 1.0 if r.get("w") is None else float(r["w"])))
        return sorted(out)   # HydraDB row order varies between runs; callers get a stable order

    def get_nodes(self, label: str, ids: Iterable[int], fields: Sequence[str]) -> list[Row]:
        ids = list(dict.fromkeys(ids))
        out: list[Row] = []
        cypher = Q.get_nodes(label, tuple(fields))
        for chunk in _chunks(ids, ID_CHUNK):
            out.extend(self._run(cypher, ids=chunk))
        return out

    def scan_nodes(self, label: str, repo: str, fields: Sequence[str]) -> list[Row]:
        return self._run(Q.scan_nodes(label, tuple(fields)), repo=repo)

    def list_nodes(self, label: str, fields: Sequence[str]) -> list[Row]:
        return self._run(Q.list_nodes(label, tuple(fields)))

    def edge_weights(self, etype: EdgeType, pairs: Iterable[tuple[int, int]]) -> dict[tuple[int, int], Row]:
        pairs = set(pairs)
        srcs = list({s for s, _ in pairs})
        found: dict[tuple[int, int], Row] = {}
        cypher = Q.edge_stats(etype)
        for chunk in _chunks(srcs, ID_CHUNK):
            for r in self._run(cypher, ids=chunk):
                key = (r["src"], r["dst"])
                if key in pairs:
                    found[key] = {"w": r.get("w"), "hits": r.get("hits") or 0,
                                  "misses": r.get("misses") or 0}
        return found

    def count_edges(self, etype: EdgeType, repo: str) -> int:
        rows = self._run(Q.count_edges(etype), repo=repo)
        return int(rows[0]["c"]) if rows else 0

    def key_paths(self, repo: str, src_label: str, src_keys, dst_label: str, dst_keys, rel_types,
                  max_len: int = 3, limit: int = 5) -> list[list]:
        """Native algo.MSpaths between nodes named by `key`. Keys repeat across repos, so only paths whose
        nodes all belong to `repo` are kept. Each path alternates node dicts and relationship-type strings."""
        rows = self._run(Q.ms_paths(src_label, list(src_keys), dst_label, list(dst_keys), list(rel_types), max_len))
        out = []
        for r in rows:
            path = r["path"]
            nodes = [x for x in path if isinstance(x, dict)]
            if nodes and all(n.get("repo") == repo for n in nodes):
                out.append(path)
        out.sort(key=len)
        return out[:limit]

    def shortest_paths(self, etype: EdgeType, src: int, dst: int, max_len: int, k: int) -> list[list[Row]]:
        rows = self._run(Q.shortest_paths(etype), src=src, dst=dst, max_len=max_len, k=k)
        return [[x for x in r["path"] if isinstance(x, dict)] for r in rows]

    def close(self) -> None:
        for sess in self._sessions:
            sess.close()
        self._driver.close()


__all__ = ["HydraGraphStore", "EDGE_TYPES"]
