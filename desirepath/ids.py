"""Deterministic ids. 52-bit so they survive JSON round trips in JavaScript (2^53 safe range)."""
from __future__ import annotations

import hashlib

_MASK = (1 << 52) - 1


def stable_id(*parts: str) -> int:
    h = hashlib.blake2b("\x1f".join(parts).encode(), digest_size=8).digest()
    return int.from_bytes(h, "big") & _MASK


def file_id(repo: str, path: str) -> int:
    return stable_id(repo, "file", path)


def symbol_id(repo: str, qualname: str) -> int:
    return stable_id(repo, "sym", qualname)


def term_id(repo: str, term: str) -> int:
    return stable_id(repo, "term", term)


def edge_id(etype: str, src: int, dst: int) -> int:
    return stable_id("edge", etype, str(src), str(dst))
