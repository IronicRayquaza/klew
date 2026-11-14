"""Seeder: task text → starting nodes with scores.

Two independent signals, combined:
- lexical: BM25 over symbol and file names/docstrings, plus exact identifier matches;
- learned: task terms → files through POINTS_TO edges that past runs have reinforced.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..text import identifiers, split_identifier, tokenize
from .bm25 import BM25


@dataclass
class Unit:
    id: int
    label: str           # KlewFile | KlewSymbol
    key: str
    file_id: int
    name: str = ""


@dataclass
class Seed:
    node_id: int
    label: str
    score: float
    reason: str


@dataclass
class Lexicon:
    """In-memory name index over one repo (HydraDB has no full-text search)."""
    units: dict[int, Unit]
    bm25: BM25
    by_name: dict[str, list[int]] = field(default_factory=dict)  # exact symbol / file stem → ids

    @classmethod
    def build(cls, files: list[dict], symbols: list[dict]) -> Lexicon:
        units: dict[int, Unit] = {}
        docs: dict[int, list[str]] = {}
        by_name: dict[str, list[int]] = {}
        names_in_file: dict[int, list[str]] = {}
        for s in symbols:
            if s.get("kind") == "test":
                continue  # tests are reached by traversal, not seeded by name
            units[s["id"]] = Unit(s["id"], "KlewSymbol", s["qualname"], s["file_id"], s["name"])
            parts = s["qualname"].split(".")
            tail = parts[-2:] if len(parts) > 1 else parts
            docs[s["id"]] = (tokenize(" ".join(tail)) * 3 + tokenize(s.get("doc") or "")
                             + (s.get("terms") or "").split())
            by_name.setdefault(s["name"].lower(), []).append(s["id"])
            names_in_file.setdefault(s["file_id"], []).append(s["name"])
        for f in files:
            units[f["id"]] = Unit(f["id"], "KlewFile", f["path"], f["id"])
            stem = f["path"].rsplit("/", 1)[-1].removesuffix(".py").lstrip("_")
            docs[f["id"]] = tokenize(f["path"].replace("/", " ")) * 2 + tokenize(
                " ".join(names_in_file.get(f["id"], [])))
            by_name.setdefault(stem.lower(), []).append(f["id"])
        return cls(units, BM25(docs), by_name)


def task_terms(task: str) -> list[str]:
    return sorted(set(tokenize(task)))


def lexical_seeds(lex: Lexicon, task: str, k: int = 12) -> list[Seed]:
    q = tokenize(task)
    hits = lex.bm25.search(q, k=k * 3)
    seeds: dict[int, Seed] = {}
    if hits:
        top = hits[0][1]
        for uid, sc in hits:
            u = lex.units[uid]
            seeds[uid] = Seed(uid, u.label, sc / top, f"name match: {u.key}")
    # Exact identifiers in the task (`Client.send`, ReadTimeout, url_parse) are strong evidence.
    for ident in identifiers(task):
        for uid in lex.by_name.get(ident.lower(), [])[:4]:
            u = lex.units[uid]
            prev = seeds.get(uid)
            seeds[uid] = Seed(uid, u.label, max(1.2, prev.score if prev else 0),
                              f"mentions `{ident}`")
        # also split CamelCase identifiers into words already covered by BM25
        _ = split_identifier(ident)
    ranked = sorted(seeds.values(), key=lambda s: (-s.score, s.node_id))
    return ranked[:k]


def learned_seeds(term_files: dict[int, dict[int, float]], term_idf: dict[int, float],
                  term_text: dict[int, str], k: int = 12) -> list[Seed]:
    """term_files: term_id → {file_id: w}. Scores are idf-weighted and normalized to [0, 1]."""
    acc: dict[int, float] = {}
    best: dict[int, tuple[float, int]] = {}
    for tid, files in term_files.items():
        idf = term_idf.get(tid, 1.0)
        for fid, w in files.items():
            c = idf * w
            acc[fid] = acc.get(fid, 0.0) + c
            if c > best.get(fid, (0, 0))[0]:
                best[fid] = (c, tid)
    if not acc:
        return []
    norm = sum(term_idf.get(t, 1.0) for t in term_files) or 1.0
    out = [Seed(fid, "KlewFile", min(1.5, sc / norm * 2.0),
                f"learned: '{term_text.get(best[fid][1], '?')}' → this file")
           for fid, sc in acc.items()]
    return sorted(out, key=lambda s: (-s.score, s.node_id))[:k]


def idf(df: int, n_runs: int) -> float:
    return math.log(1 + (n_runs + 1) / (df + 0.5))


def merge_seeds(lexical: list[Seed], learned: list[Seed], learned_weight: float = 1.0) -> list[Seed]:
    out: dict[int, Seed] = {s.node_id: Seed(s.node_id, s.label, s.score, s.reason) for s in lexical}
    for s in learned:
        sc = s.score * learned_weight
        if s.node_id in out:
            cur = out[s.node_id]
            cur.score += sc
            cur.reason = f"{cur.reason}; {s.reason}"
        else:
            out[s.node_id] = Seed(s.node_id, s.label, sc, s.reason)
    return sorted(out.values(), key=lambda s: (-s.score, s.node_id))
