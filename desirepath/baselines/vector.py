"""Vector RAG baseline: bge-small embeddings over code chunks, cosine top-k (local, no API)."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .chunks import Chunk, chunk_repo, fill_budget

MODEL = "BAAI/bge-small-en-v1.5"
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class VectorRetriever:
    name = "vector"

    def __init__(self, root: Path, model: str = MODEL):
        from fastembed import TextEmbedding
        self.model = TextEmbedding(model)
        self._cache: dict[str, np.ndarray] = {}   # chunk digest → embedding, survives reloads
        self.reload(root)

    def reload(self, root: Path) -> None:
        self.chunks: list[Chunk] = chunk_repo(root)
        missing = [c for c in self.chunks if c.digest not in self._cache]
        if missing:
            for c, v in zip(missing, self.model.embed([c.text for c in missing], batch_size=64), strict=True):
                self._cache[c.digest] = np.asarray(v, dtype=np.float32)
        m = np.stack([self._cache[c.digest] for c in self.chunks])
        self.matrix = m / np.linalg.norm(m, axis=1, keepdims=True)

    def file_scores(self, task: str, k: int = 8) -> list[tuple[str, float]]:
        """Top files by best chunk similarity, scaled to 0..1 (for seeding the graph)."""
        q = np.asarray(next(iter(self.model.embed([QUERY_PREFIX + task]))), dtype=np.float32)
        q /= np.linalg.norm(q)
        sims = self.matrix @ q
        best: dict[str, float] = {}
        for i in np.argsort(-sims)[:60]:
            p = self.chunks[i].path
            best.setdefault(p, float(sims[i]))
        top = sorted(best.items(), key=lambda x: -x[1])[:k]
        if not top:
            return []
        hi, lo = top[0][1], top[-1][1]
        span = (hi - lo) or 1.0
        return [(p, 0.3 + 0.7 * (s - lo) / span) for p, s in top]

    def retrieve(self, task: str, budget: int):
        q = np.asarray(next(iter(self.model.embed([QUERY_PREFIX + task]))), dtype=np.float32)
        q /= np.linalg.norm(q)
        order = np.argsort(-(self.matrix @ q))[:200]
        return fill_budget([self.chunks[i] for i in order], budget)
