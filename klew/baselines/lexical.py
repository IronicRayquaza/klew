"""BM25 RAG baseline over code chunks."""
from __future__ import annotations

from pathlib import Path

from ..domain.bm25 import BM25
from ..text import tokenize
from .chunks import Chunk, chunk_repo, fill_budget


class BM25Retriever:
    name = "bm25"

    def __init__(self, root: Path):
        self.reload(root)

    def reload(self, root: Path) -> None:
        self.chunks: list[Chunk] = chunk_repo(root)
        self.index = BM25({c.id: tokenize(c.text) for c in self.chunks})

    def file_rank(self, task: str, k: int = 30) -> list[str]:
        """Files ordered by their best BM25 chunk (for rank fusion; no embeddings needed)."""
        order: list[str] = []
        for i, _ in self.index.search(tokenize(task), k=200):
            p = self.chunks[i].path
            if p not in order:
                order.append(p)
                if len(order) >= k:
                    break
        return order

    def retrieve(self, task: str, budget: int):
        hits = self.index.search(tokenize(task), k=200)
        return fill_budget([self.chunks[i] for i, _ in hits], budget)
