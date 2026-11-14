"""Every Cypher statement Desirepath sends to HydraDB lives here.

HydraDB dialect rules this file respects (verified against v0.4.0, legacy engine):
- Vertex batch upsert must be `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Label, ...`.
- Relationship batch upsert must MATCH both endpoints and MERGE with an edge id: `{id: row.eid}`.
- Composite (list-of-maps) params are only legal as UNWIND input, so batched *reads* use
  `WHERE a.id IN $ids` with a scalar list instead of UNWIND.
- Exactly one relationship type per pattern; no type(r)/labels(n); RETURN only binding.prop or
  aggregates; property values are scalars only (lists/maps are stored as JSON strings).
- Reading r.<prop> works when the far endpoint is unlabeled.
"""
from __future__ import annotations

from ..schema import EdgeType


def upsert_nodes(label: str, fields: tuple[str, ...]) -> str:
    sets = ", ".join(f"n.{f} = row.{f}" for f in fields)
    return f"UNWIND $rows AS row MERGE (n {{id: row.id}}) SET n:{label}" + (f", {sets}" if sets else "")


def upsert_edges(e: EdgeType, fields: tuple[str, ...]) -> str:
    sets = ", ".join(f"r.{f} = row.{f}" for f in fields)
    return (
        f"UNWIND $rows AS row MATCH (s:{e.src} {{id: row.src}}), (d:{e.dst} {{id: row.dst}}) "
        f"MERGE (s)-[r:{e.name} {{id: row.eid}}]->(d)" + (f" SET {sets}" if sets else "")
    )


def expand(e: EdgeType, direction: str) -> str:
    if direction == "out":
        return (f"MATCH (a:{e.src})-[r:{e.name}]->(b) WHERE a.id IN $ids "
                "RETURN a.id AS src, b.id AS dst, r.w AS w")
    return (f"MATCH (a:{e.dst})<-[r:{e.name}]-(b) WHERE a.id IN $ids "
            "RETURN a.id AS src, b.id AS dst, r.w AS w")


def edge_stats(e: EdgeType) -> str:
    return (f"MATCH (a:{e.src})-[r:{e.name}]->(b) WHERE a.id IN $ids "
            "RETURN a.id AS src, b.id AS dst, r.w AS w, r.hits AS hits, r.misses AS misses")


def get_nodes(label: str, fields: tuple[str, ...]) -> str:
    cols = ", ".join(f"n.{f} AS {f}" for f in fields)
    return f"MATCH (n:{label}) WHERE n.id IN $ids RETURN n.id AS id, {cols}"


def scan_nodes(label: str, fields: tuple[str, ...]) -> str:
    cols = ", ".join(f"n.{f} AS {f}" for f in fields)
    return f"MATCH (n:{label}) WHERE n.repo = $repo RETURN n.id AS id, {cols}"


def list_nodes(label: str, fields: tuple[str, ...]) -> str:
    cols = ", ".join(f"n.{f} AS {f}" for f in fields)
    return f"MATCH (n:{label}) RETURN n.id AS id, {cols}"


def count_edges(e: EdgeType) -> str:
    return f"MATCH (a:{e.src})-[r:{e.name}]->(b) WHERE a.repo = $repo RETURN count(*) AS c"


def delete_nodes(label: str) -> str:
    return f"MATCH (n:{label}) WHERE n.id IN $ids DETACH DELETE n"


def delete_repo(label: str) -> str:
    return f"MATCH (n:{label}) WHERE n.repo = $repo DETACH DELETE n"


def shortest_paths(e: EdgeType) -> str:
    # Procedure maps take scalars only; lists are inlined literals.
    return (
        "CALL algo.SPpaths({sourceNode: $src, targetNode: $dst, "
        f"relTypes: ['{e.name}'], relDirection: 'both', maxLen: $max_len, pathCount: $k}}) "
        "YIELD path, pathWeight RETURN path, pathWeight"
    )
