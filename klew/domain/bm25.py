"""A small BM25 index. Used for lexical seeding and as the lexical baseline."""
from __future__ import annotations

import math
from collections import Counter, defaultdict


class BM25:
    def __init__(self, docs: dict[int, list[str]], k1: float = 1.2, b: float = 0.75):
        self.k1, self.b = k1, b
        self.len = {d: len(t) for d, t in docs.items()}
        self.avg = (sum(self.len.values()) / len(self.len)) if self.len else 1.0
        self.post: dict[str, dict[int, int]] = defaultdict(dict)
        for d, toks in docs.items():
            for t, n in Counter(toks).items():
                self.post[t][d] = n
        self.N = len(docs)

    def idf(self, term: str) -> float:
        df = len(self.post.get(term, ()))
        return math.log(1 + (self.N - df + 0.5) / (df + 0.5)) if df else 0.0

    def search(self, query: list[str], k: int = 20) -> list[tuple[int, float]]:
        scores: dict[int, float] = defaultdict(float)
        for t in set(query):
            posting = self.post.get(t)
            if not posting:
                continue
            idf = self.idf(t)
            for d, tf in posting.items():
                dl = self.len[d] / self.avg
                scores[d] += idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * dl))
        return sorted(scores.items(), key=lambda x: (-x[1], x[0]))[:k]
