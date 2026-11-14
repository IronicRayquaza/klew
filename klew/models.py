"""Public data models shared by the MCP server, the REST API, and the eval harness."""
from __future__ import annotations

from pydantic import BaseModel, Field


class PathStep(BaseModel):
    node_id: int
    node: str                 # human key, e.g. "httpx/_client.py" or "httpx._client.Client.send"
    via: str | None = None    # relation used to arrive here, e.g. "called by"; None for the seed
    weight: float | None = None


class ContextItem(BaseModel):
    file_id: int
    path: str
    score: float
    tokens: int
    symbols: list[str] = Field(default_factory=list)  # signatures included
    snippet: str = ""
    why: list[PathStep] = Field(default_factory=list)  # seed → … → this file
    seed_reason: str = ""


class Timings(BaseModel):
    seed_ms: float = 0
    walk_ms: float = 0
    rank_ms: float = 0
    pack_ms: float = 0
    total_ms: float = 0
    queries: int = 0


class ContextPack(BaseModel):
    run_id: int
    repo: str
    task: str
    items: list[ContextItem]
    tokens: int
    budget_tokens: int
    abstained: bool = False
    abstain_reason: str = ""
    timings: Timings = Field(default_factory=Timings)

    def ranked_paths(self) -> list[str]:
        return [i.path for i in self.items]


class Outcome(BaseModel):
    run_id: int
    touched_files: list[str]
    success: bool | None = None


class LearnReport(BaseModel):
    run_id: int
    hits: list[str]
    misses: list[str]
    unserved: list[str]
    edges_reinforced: int
    edges_decayed: int
    edges_created: int


class GraphStats(BaseModel):
    repo: str
    files: int
    symbols: int
    terms: int
    runs: int
    edges: dict[str, int]
