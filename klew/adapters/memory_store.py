"""In-memory GraphStore with the same semantics as HydraGraphStore.

Used for unit tests, for frontend work before HydraDB is up, and as the reference
implementation in the store contract test.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Sequence

from .. import ids as idmod
from ..ports import Neighbor, Row
from ..schema import NODE_FIELDS, EdgeType


class MemoryGraphStore:
    def __init__(self) -> None:
        self.nodes: dict[str, dict[int, Row]] = defaultdict(dict)
        # etype -> src -> dst -> props
        self.out: dict[str, dict[int, dict[int, Row]]] = defaultdict(lambda: defaultdict(dict))
        self.inn: dict[str, dict[int, dict[int, Row]]] = defaultdict(lambda: defaultdict(dict))
        self.queries = 0

    def upsert_nodes(self, label: str, rows: Sequence[Row]) -> None:
        self.queries += 1
        for r in rows:
            cur = self.nodes[label].setdefault(r["id"], {"id": r["id"]})
            cur.update({k: v for k, v in r.items() if k in NODE_FIELDS[label]})

    def upsert_edges(self, etype: EdgeType, rows: Sequence[Row]) -> None:
        self.queries += 1
        for r in rows:
            s, d = r["src"], r["dst"]
            if s not in self.nodes[etype.src] or d not in self.nodes[etype.dst]:
                continue  # MATCH would not bind; HydraDB silently writes nothing
            props = self.out[etype.name][s].setdefault(d, {})
            props.update({k: v for k, v in r.items() if k not in ("src", "dst")})
            props.setdefault("eid", idmod.edge_id(etype.name, s, d))
            self.inn[etype.name][d][s] = props

    def delete_nodes(self, label: str, ids: Iterable[int]) -> None:
        self._drop({i for i in ids if i in self.nodes[label]})

    def delete_repo(self, repo: str) -> None:
        self._drop({i for lbl in self.nodes.values() for i, r in lbl.items() if r.get("repo") == repo})

    def _drop(self, doomed: set[int]) -> None:
        self.queries += 1
        for lbl in self.nodes.values():
            for i in list(lbl):
                if i in doomed:
                    del lbl[i]
        for idx in (self.out, self.inn):
            for adj in idx.values():
                for a in list(adj):
                    if a in doomed:
                        del adj[a]
                        continue
                    for b in list(adj[a]):
                        if b in doomed:
                            del adj[a][b]

    def expand(self, etype: EdgeType, direction: str, ids: Iterable[int]) -> list[Neighbor]:
        self.queries += 1
        adj = self.out[etype.name] if direction == "out" else self.inn[etype.name]
        out = []
        for a in dict.fromkeys(ids):
            for b, p in adj.get(a, {}).items():
                w = p.get("w")
                eid = idmod.edge_id(etype.name, a, b) if direction == "out" else idmod.edge_id(etype.name, b, a)
                out.append(Neighbor(a, b, eid, 1.0 if w is None else float(w)))
        return sorted(out)

    def get_nodes(self, label: str, ids: Iterable[int], fields: Sequence[str]) -> list[Row]:
        self.queries += 1
        tbl = self.nodes[label]
        return [{"id": i, **{f: tbl[i].get(f) for f in fields}} for i in dict.fromkeys(ids) if i in tbl]

    def scan_nodes(self, label: str, repo: str, fields: Sequence[str]) -> list[Row]:
        self.queries += 1
        return [{"id": i, **{f: r.get(f) for f in fields}}
                for i, r in self.nodes[label].items() if r.get("repo") == repo]

    def list_nodes(self, label: str, fields: Sequence[str]) -> list[Row]:
        self.queries += 1
        return [{"id": i, **{f: r.get(f) for f in fields}} for i, r in self.nodes[label].items()]

    def edge_weights(self, etype: EdgeType, pairs: Iterable[tuple[int, int]]) -> dict[tuple[int, int], Row]:
        self.queries += 1
        found = {}
        for s, d in set(pairs):
            p = self.out[etype.name].get(s, {}).get(d)
            if p is not None:
                found[(s, d)] = {"w": p.get("w"), "hits": p.get("hits") or 0,
                                 "misses": p.get("misses") or 0}
        return found

    def count_edges(self, etype: EdgeType, repo: str) -> int:
        self.queries += 1
        return sum(len(v) for s, v in self.out[etype.name].items()
                   if self.nodes[etype.src].get(s, {}).get("repo") == repo)

    def shortest_paths(self, etype: EdgeType, src: int, dst: int, max_len: int, k: int) -> list[list[Row]]:
        self.queries += 1
        # BFS over both directions, mirroring relDirection: 'both'
        from collections import deque
        q = deque([[src]])
        paths = []
        while q and len(paths) < k:
            p = q.popleft()
            if p[-1] == dst:
                paths.append(p)
                continue
            if len(p) > max_len:
                continue
            nbrs = set(self.out[etype.name].get(p[-1], {})) | set(self.inn[etype.name].get(p[-1], {}))
            for n in nbrs:
                if n not in p:
                    q.append(p + [n])
        lookup = {i: r for lbl in self.nodes.values() for i, r in lbl.items()}
        return [[{k2: v for k2, v in lookup[i].items() if k2 != "id"} for i in p] for p in paths]

    def close(self) -> None:
        pass
