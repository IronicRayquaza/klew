"""Fixed-window code chunks, shared by the lexical and vector baselines."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from ..adapters.source_reader import iter_python_files
from ..adapters.tokens import count_tokens

WINDOW, OVERLAP = 40, 10


@dataclass
class Chunk:
    id: int
    path: str
    start: int
    text: str
    tokens: int
    digest: str


def chunk_repo(root: Path) -> list[Chunk]:
    root = root.resolve()
    out: list[Chunk] = []
    for full in iter_python_files(root):
        rel = full.relative_to(root).as_posix()
        lines = full.read_text("utf-8", "replace").splitlines()
        step = WINDOW - OVERLAP
        for start in range(0, max(1, len(lines)), step):
            body = "\n".join(lines[start : start + WINDOW])
            if not body.strip():
                continue
            text = f"# {rel}\n{body}"
            out.append(Chunk(len(out), rel, start + 1, text, count_tokens(text),
                             hashlib.sha1(text.encode()).hexdigest()))
            if start + WINDOW >= len(lines):
                break
    return out


def fill_budget(ranked_chunks: list[Chunk], budget: int) -> tuple[list[str], list[str], int]:
    """Greedy RAG packing: (file ranking by first appearance, files inside the budget, tokens)."""
    order: list[str] = []
    inside: list[str] = []
    used = 0
    for c in ranked_chunks:
        if c.path not in order:
            order.append(c.path)
        if used + c.tokens <= budget:
            used += c.tokens
            if c.path not in inside:
                inside.append(c.path)
    return order, inside, used
