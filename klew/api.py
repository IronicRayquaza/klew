"""REST API for the dashboard. Thin: validate → call the engine → serialize."""
from __future__ import annotations

import json
import os
import threading
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .models import ContextPack, GraphStats, LearnReport
from .runtime import get_runtime
from .schema import RUN

RESULTS_DIR = Path(os.environ.get("KLEW_RESULTS_DIR", "eval/results"))
WEB_DIR = Path(os.environ.get("KLEW_WEB_DIR", "web/dist"))
# Public demo: requests per minute per client IP on the endpoints that do work (0 = unlimited).
RATE_PER_MIN = int(os.environ.get("KLEW_RATE_PER_MIN", "0"))

app = FastAPI(title="Klew API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if RATE_PER_MIN and request.method == "POST" and request.url.path.startswith("/api/"):
        ip = request.headers.get("fly-client-ip") or request.headers.get("x-forwarded-for", "").split(",")[0] \
            or (request.client.host if request.client else "?")
        now = time.monotonic()
        with _hits_lock:
            q = _hits[ip]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= RATE_PER_MIN:
                from fastapi.responses import JSONResponse
                return JSONResponse({"detail": "Too many requests; try again in a minute."}, status_code=429)
            q.append(now)
    return await call_next(request)

_packs: dict[int, ContextPack] = {}


class ContextRequest(BaseModel):
    repo: str
    task: str = Field(min_length=3, max_length=2000)
    budget_tokens: int = Field(2000, ge=200, le=32000)
    cutoff: float | None = Field(None, ge=0, le=1, description="Stop below this fraction of the top score")


class OutcomeRequest(BaseModel):
    repo: str
    run_id: int
    touched_files: list[str] = Field(max_length=50)


class GraphNode(BaseModel):
    id: str
    label: str
    kind: str        # file | symbol | seed
    score: float = 0


class GraphLink(BaseModel):
    source: str
    target: str
    via: str


class Subgraph(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/repos")
def repos() -> list[dict]:
    return get_runtime().repos()


@app.get("/api/stats", response_model=GraphStats)
def stats(repo: str) -> GraphStats:
    return get_runtime().stats(repo)


@app.post("/api/context", response_model=ContextPack)
def context(req: ContextRequest) -> ContextPack:
    eng = get_runtime().engine(req.repo)
    if not eng.path_of:
        raise HTTPException(404, f"repo '{req.repo}' is not indexed; run `klew index`")
    pack = eng.get_context(req.task, req.budget_tokens, source="dashboard", cutoff=req.cutoff)
    _packs[pack.run_id] = pack
    return pack


@app.post("/api/outcome", response_model=LearnReport)
def outcome(req: OutcomeRequest) -> LearnReport:
    eng = get_runtime().engine(req.repo)
    try:
        return eng.record_outcome(req.run_id, req.touched_files)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/api/runs")
def runs(repo: str, limit: int = 50) -> list[dict]:
    rows = get_runtime().store.scan_nodes(RUN, repo, ("task", "ts", "source", "served_json",
                                                      "tokens_served"))
    rows.sort(key=lambda r: -(r.get("ts") or 0))
    for r in rows:
        r["served"] = json.loads(r.pop("served_json") or "[]")
    return rows[:limit]


@app.get("/api/runs/{run_id}/subgraph", response_model=Subgraph)
def subgraph(run_id: int) -> Subgraph:
    pack = _packs.get(run_id)
    if pack is None:
        raise HTTPException(404, "run not in this server's memory; request a new context")
    nodes: dict[str, GraphNode] = {}
    links: dict[tuple[str, str], GraphLink] = {}
    for it in pack.items:
        prev = None
        for i, step in enumerate(it.why):
            nid = str(step.node_id)
            kind = "seed" if i == 0 else ("file" if step.node.endswith(".py") else "symbol")
            if nid not in nodes or kind == "seed":
                nodes[nid] = GraphNode(id=nid, label=step.node, kind=kind)
            if prev is not None:
                links[(prev, nid)] = GraphLink(source=prev, target=nid, via=step.via or "")
            prev = nid
        fid = str(it.file_id)
        if fid in nodes:
            nodes[fid].score = it.score
            if nodes[fid].kind != "seed":
                nodes[fid].kind = "file"
    return Subgraph(nodes=list(nodes.values()), links=list(links.values()))


@app.get("/api/eval")
def eval_list() -> list[dict]:
    out = []
    for p in sorted(RESULTS_DIR.glob("*.json")):
        d = json.loads(p.read_text())
        out.append({"name": p.stem, "repo": d.get("repo"), "scored": d.get("scored"),
                    "summary": d.get("summary")})
    return out


@app.get("/api/learning")
def learning_curves() -> list[dict]:
    """Held-out accuracy vs commits learned (scripts/learning_curve.py)."""
    d = RESULTS_DIR / "learning"
    return [json.loads(p.read_text()) for p in sorted(d.glob("*.json"))] if d.is_dir() else []


@app.get("/api/eval/{name}")
def eval_one(name: str, records: bool = False) -> dict:
    p = RESULTS_DIR / f"{Path(name).name}.json"
    if not p.exists():
        raise HTTPException(404, "no such result")
    d = json.loads(p.read_text())
    if not records:
        d.pop("records", None)
    return d


# The built web app, served from the same origin as the API (production / hosted demo).
if WEB_DIR.is_dir():
    @app.get("/{path:path}", include_in_schema=False)
    def site(path: str):
        target = (WEB_DIR / path).resolve()
        if path and target.is_file() and WEB_DIR.resolve() in target.parents:
            return FileResponse(target)
        return FileResponse(WEB_DIR / "index.html")
