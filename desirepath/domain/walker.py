"""Walker: bounded relevance propagation over the code graph, one hop at a time.

Each hop issues one 1-hop expansion per (edge type, direction) through the GraphStore, so
the graph is traversed where it lives (HydraDB). Relevance flowing along an edge is
score(src) · prior(step) · w(edge) · damp(fan-out). A node's score sums its contributions;
its best single contribution is kept as the why-path back-pointer.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

from ..ports import GraphStore
from ..schema import WALK_STEPS, Step
from .seeder import Seed


@dataclass
class Visit:
    score: float = 0.0
    best: float = 0.0
    parent: int | None = None
    via: str | None = None
    weight: float | None = None
    label: str = ""
    hops: int = 0


@dataclass
class WalkResult:
    visits: dict[int, Visit] = field(default_factory=dict)
    edges_seen: int = 0

    def path_to(self, node: int) -> list[tuple[int, str | None, float | None]]:
        out = []
        seen = set()
        cur: int | None = node
        while cur is not None and cur not in seen:
            seen.add(cur)
            v = self.visits[cur]
            out.append((cur, v.via, v.weight))
            cur = v.parent
        return list(reversed(out))


def walk(store: GraphStore, seeds: list[Seed], *, hops: int = 3, beam: int = 48,
         max_edges: int = 4000, min_contrib: float = 0.01,
         steps: tuple[Step, ...] = WALK_STEPS) -> WalkResult:
    res = WalkResult()
    for s in seeds:
        res.visits[s.node_id] = Visit(s.score, s.score, None, None, None, s.label, 0)
    frontier = {s.node_id: s.score for s in seeds}
    for hop in range(1, hops + 1):
        if not frontier or res.edges_seen >= max_edges:
            break
        by_label: dict[str, list[int]] = defaultdict(list)
        for nid in frontier:
            by_label[res.visits[nid].label].append(nid)
        contrib: dict[int, tuple[float, int, str, float, str]] = {}
        gained: dict[int, float] = defaultdict(float)
        for step in steps:
            src_ids = by_label.get(step.from_label)
            if not src_ids:
                continue
            nbrs = store.expand(step.edge, step.direction, src_ids)
            res.edges_seen += len(nbrs)
            fan: dict[int, int] = defaultdict(int)
            for n in nbrs:
                fan[n.src] += 1
            for n in nbrs:
                c = frontier[n.src] * step.prior * n.w / math.sqrt(fan[n.src])
                if c < min_contrib:
                    continue
                gained[n.dst] += c
                if c > contrib.get(n.dst, (0,))[0]:
                    contrib[n.dst] = (c, n.src, step.label, n.w, step.to_label)
        # BFS layers: a node keeps the parent of the hop that first reached it (shortest
        # why-path); only newly reached nodes propagate further, so cycles cannot inflate scores.
        nxt: dict[int, float] = {}
        for nid, total in gained.items():
            c, parent, via, w, label = contrib[nid]
            v = res.visits.get(nid)
            if v is None:
                res.visits[nid] = Visit(total, c, parent, via, w, label, hop)
                nxt[nid] = total
            else:
                v.score += total
        frontier = dict(sorted(nxt.items(), key=lambda x: -x[1])[:beam])
    return res
