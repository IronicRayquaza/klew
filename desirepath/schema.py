"""The Desirepath graph schema: labels, edge types, and how the walker may traverse them.

HydraDB needs a label on the anchored side of every MATCH and exactly one relationship type
per pattern, so every edge type is pinned to one (src_label, dst_label) pair here.
"""
from __future__ import annotations

from dataclasses import dataclass

FILE = "DpFile"
SYMBOL = "DpSymbol"
TERM = "DpTerm"
RUN = "DpRun"
REPO = "DpRepo"

NODE_FIELDS: dict[str, tuple[str, ...]] = {
    FILE: ("repo", "key", "path", "tokens", "sha", "is_test"),
    SYMBOL: ("repo", "key", "file_id", "path", "qualname", "name", "kind", "sig", "doc",
             "start", "end", "tokens", "terms"),
    TERM: ("repo", "key", "text", "df"),
    REPO: ("repo", "key", "runs", "root", "head"),
    RUN: ("repo", "key", "task", "ts", "source", "served_json", "truth_json", "tokens_served"),
}


@dataclass(frozen=True)
class EdgeType:
    name: str
    src: str
    dst: str
    learned: bool = False


CONTAINS = EdgeType("CONTAINS", FILE, SYMBOL)
IMPORTS = EdgeType("IMPORTS", FILE, FILE)
CALLS = EdgeType("CALLS", SYMBOL, SYMBOL)
TESTS = EdgeType("TESTS", SYMBOL, SYMBOL)
INHERITS = EdgeType("INHERITS", SYMBOL, SYMBOL)
CO_CHANGED = EdgeType("CO_CHANGED", FILE, FILE, learned=True)
POINTS_TO = EdgeType("POINTS_TO", TERM, FILE, learned=True)
SERVED = EdgeType("SERVED", RUN, FILE)
TOUCHED = EdgeType("TOUCHED", RUN, FILE)

EDGE_TYPES = {e.name: e for e in (CONTAINS, IMPORTS, CALLS, TESTS, INHERITS, CO_CHANGED,
                                  POINTS_TO, SERVED, TOUCHED)}


@dataclass(frozen=True)
class Step:
    """One traversal move: follow `edge` forward (out) or backward (in), scaled by `prior`."""
    edge: EdgeType
    direction: str  # "out" | "in"
    prior: float
    label: str      # human label for why-paths

    @property
    def from_label(self) -> str:
        return self.edge.src if self.direction == "out" else self.edge.dst

    @property
    def to_label(self) -> str:
        return self.edge.dst if self.direction == "out" else self.edge.src


# Priors are tuned on the held-in slice only (see eval). They encode "how much relevance flows".
WALK_STEPS: tuple[Step, ...] = (
    Step(CONTAINS, "out", 0.55, "defines"),
    Step(CONTAINS, "in", 0.95, "defined in"),
    Step(CALLS, "out", 0.45, "calls"),
    Step(CALLS, "in", 0.40, "called by"),
    Step(TESTS, "in", 0.50, "tested by"),
    Step(TESTS, "out", 0.35, "tests"),
    Step(INHERITS, "out", 0.45, "inherits"),
    Step(INHERITS, "in", 0.40, "subclassed by"),
    Step(IMPORTS, "out", 0.20, "imports"),
    Step(IMPORTS, "in", 0.20, "imported by"),
    Step(CO_CHANGED, "out", 0.80, "co-changes with"),
)
