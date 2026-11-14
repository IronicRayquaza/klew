"""Ranker + Packer: walk result → ranked files → token-budgeted context pack."""
from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass

from ..adapters.tokens import count_tokens
from ..models import ContextItem, PathStep
from .walker import WalkResult

SYMBOL_TO_FILE = 0.5     # share of a symbol's relevance credited to its file at rank time
MAX_SIGS = 4
MAX_SIG_CHARS = 140
SNIPPET_ITEMS = 3
SNIPPET_TOKENS = 260


@dataclass
class RankedFile:
    file_id: int
    score: float
    symbols: list[tuple[int, float]]   # (symbol_id, score), best first
    anchor: int                         # node whose why-path explains this file
    via: tuple[int, str] | None = None  # (parent file, relation) when promoted as a companion


def promote_companions(ranked: list[RankedFile], companions: dict[int, list[tuple[int, str]]],
                       top_k: int, weight: float) -> list[RankedFile]:
    """Pull each top file's companions (its test file, its strongest co-change partner) up to
    `weight` x the parent's score. A change to one file usually touches its companions too."""
    if weight <= 0 or not companions:
        return ranked
    by_id = {r.file_id: r for r in ranked}
    for parent in ranked[:top_k]:
        for cid, label in companions.get(parent.file_id, []):
            target = parent.score * weight
            cur = by_id.get(cid)
            if cur is None:
                cur = RankedFile(cid, target, [], cid, (parent.file_id, label))
                ranked.append(cur)
                by_id[cid] = cur
            elif cur.score < target:
                cur.score = target
                cur.via = cur.via or (parent.file_id, label)
    return sorted(ranked, key=lambda r: -r.score)


def rank_files(res: WalkResult, sym_file: dict[int, int], file_ids: set[int],
               exclude_tests: set[int] | None = None, file_size: dict[int, int] | None = None,
               hub_damping: float = 0.0) -> list[RankedFile]:
    """Aggregate node relevance to files. `hub_damping` > 0 divides each file's score by
    (1 + ln(1 + symbols in file)) ** hub_damping, so large central files (which collect relevance
    from everywhere) don't win by default."""
    score: dict[int, float] = defaultdict(float)
    syms: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for nid, v in res.visits.items():
        if nid in file_ids:
            score[nid] += v.score
        elif nid in sym_file:
            f = sym_file[nid]
            score[f] += SYMBOL_TO_FILE * v.score
            syms[f].append((nid, v.score))
    out = []
    for f, sc in score.items():
        if exclude_tests and f in exclude_tests:
            continue
        ss = sorted(syms[f], key=lambda x: -x[1])
        anchor = f if f in res.visits else (ss[0][0] if ss else f)
        if hub_damping and file_size:
            sc /= (1.0 + math.log1p(file_size.get(f, 0))) ** hub_damping
        out.append(RankedFile(f, sc, ss, anchor))
    return sorted(out, key=lambda r: -r.score)


def why_path(res: WalkResult, rf: RankedFile, key_of: Callable[[int], str],
             by_id: dict[int, RankedFile] | None = None) -> list[PathStep]:
    if rf.via is not None and (rf.anchor not in res.visits or rf.anchor == rf.file_id):
        parent, label = rf.via
        base = why_path(res, by_id[parent], key_of, by_id) if by_id and parent in by_id else []
        return [*base, PathStep(node_id=rf.file_id, node=key_of(rf.file_id), via=label)]
    if rf.anchor not in res.visits:
        return []
    steps = [PathStep(node_id=n, node=key_of(n), via=via, weight=w)
             for n, via, w in res.path_to(rf.anchor)]
    if rf.anchor != rf.file_id:
        steps.append(PathStep(node_id=rf.file_id, node=key_of(rf.file_id), via="defined in"))
    return steps


def pack(ranked: list[RankedFile], budget: int, *, path_of: Callable[[int], str],
         sym_rows: dict[int, dict], snippet_of: Callable[[str, int, int], str] | None,
         why_of: Callable[[RankedFile], list[PathStep]], seed_reason: dict[int, str],
         max_items: int = 12) -> list[ContextItem]:
    """Greedy: header + top signatures (+ snippet for the first few) per file until the budget or
    `max_items` is reached. Files that don't fit are skipped, so smaller ones can still fill gaps."""
    items: list[ContextItem] = []
    used = 0
    for rf in ranked[:max_items * 3]:
        if len(items) >= max_items:
            break
        path = path_of(rf.file_id)
        sigs, top_sym = [], None
        for sid, _ in rf.symbols[:MAX_SIGS]:
            row = sym_rows.get(sid)
            if row:
                doc = f"  # {row['doc'][:80]}" if row.get("doc") else ""
                sig = row["sig"] if len(row["sig"]) <= MAX_SIG_CHARS else row["sig"][:MAX_SIG_CHARS] + "…"
                sigs.append(f"{sig}{doc}")
                top_sym = top_sym or row
        header = f"## {path}"
        body = "\n".join(sigs)
        snippet = ""
        if snippet_of and top_sym and len(items) < SNIPPET_ITEMS:
            snippet = snippet_of(path, top_sym["start"], top_sym["end"])
            if count_tokens(snippet) > SNIPPET_TOKENS:
                lines, acc = [], 0
                for ln in snippet.splitlines():
                    acc += count_tokens(ln) + 1
                    if acc > SNIPPET_TOKENS:
                        lines.append("    ...")
                        break
                    lines.append(ln)
                snippet = "\n".join(lines)
        cost = count_tokens("\n".join(x for x in (header, body, snippet) if x))
        if used + cost > budget:
            if snippet:  # retry without the snippet
                snippet = ""
                cost = count_tokens("\n".join(x for x in (header, body) if x))
            if used + cost > budget:
                continue
        used += cost
        reason = seed_reason.get(rf.anchor) or seed_reason.get(rf.file_id) or ""
        items.append(ContextItem(file_id=rf.file_id, path=path, score=round(rf.score, 4),
                                 tokens=cost, symbols=sigs, snippet=snippet,
                                 why=why_of(rf), seed_reason=reason))
    return items
