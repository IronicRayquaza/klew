"""The storage port. Domain and services depend on this, never on a driver."""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any, Protocol

from .schema import EdgeType

Row = dict[str, Any]


class Neighbor(tuple):
    """(src_id, dst_id, edge_id, weight) for one traversed edge, in traversal direction."""
    __slots__ = ()

    def __new__(cls, src: int, dst: int, eid: int, w: float):
        return super().__new__(cls, (src, dst, eid, w))

    src = property(lambda s: s[0])
    dst = property(lambda s: s[1])
    eid = property(lambda s: s[2])
    w = property(lambda s: s[3])


class GraphStore(Protocol):
    queries: int  # number of round trips issued (for timings / benchmarks)

    def upsert_nodes(self, label: str, rows: Sequence[Row]) -> None:
        """rows: {id, **props}. Idempotent."""

    def upsert_edges(self, etype: EdgeType, rows: Sequence[Row]) -> None:
        """rows: {src, dst, w, **props}. Edge id is derived from (type, src, dst). Idempotent."""

    def expand(self, etype: EdgeType, direction: str, ids: Iterable[int]) -> list[Neighbor]:
        """One-hop neighbors of `ids` over `etype`. direction 'out' follows src→dst, 'in' dst→src.
        Returned Neighbor.src is always the id we expanded from."""

    def get_nodes(self, label: str, ids: Iterable[int], fields: Sequence[str]) -> list[Row]:
        ...

    def scan_nodes(self, label: str, repo: str, fields: Sequence[str]) -> list[Row]:
        ...

    def list_nodes(self, label: str, fields: Sequence[str]) -> list[Row]:
        """Every node with this label (small labels only, e.g. DpRepo)."""

    def edge_weights(self, etype: EdgeType, pairs: Iterable[tuple[int, int]]) -> dict[tuple[int, int], Row]:
        """Current {w, hits, misses} for (src, dst) pairs that exist."""

    def count_edges(self, etype: EdgeType, repo: str) -> int:
        ...

    def delete_nodes(self, label: str, ids: Iterable[int]) -> None:
        """DETACH DELETE the given nodes."""

    def delete_repo(self, repo: str) -> None:
        ...

    def shortest_paths(self, etype: EdgeType, src: int, dst: int, max_len: int, k: int) -> list[list[Row]]:
        """Native path procedure (HydraDB algo.SPpaths). Returns node property maps per path."""

    def close(self) -> None:
        ...
