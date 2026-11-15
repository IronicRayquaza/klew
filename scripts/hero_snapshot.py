"""Build web/public/snapshot/hero.json: real packs for the landing-page hero, learning off vs on.

One clean httpx graph is indexed and warm-started on its last 300 commits (what `klew index` does on
install). Each task is then answered twice on that graph: with learned edges ignored (the eval's
"learning off" arm) and with them (the default). Vector RAG's top files are recorded for contrast.
Nothing here is hand-written: re-run this script if ranking behaviour changes.

Usage: .venv/bin/python scripts/hero_snapshot.py --root .vendor/eval-repos/httpx
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from klew.adapters.git_miner import commits
from klew.baselines.vector import VectorRetriever
from klew.runtime import make_store
from klew.services.engine import EngineParams, RepoEngine, warm_start
from klew.services.index import IndexService

TASKS = [
    "Support NO_PROXY environment variable with CIDR ranges",
    "Raise ReadTimeout when the server stalls while streaming the response body",
    "Client.send should not follow redirects to another origin with auth headers",
]
KEY = "httpx::hero"   # eval-style key: no root, so it never shows in /api/repos


def pack_view(pack, top: int) -> dict:
    return {
        "tokens": pack.tokens,
        "files": len(pack.items),
        "ms": round(pack.timings.total_ms),
        "items": [
            {"rank": i + 1, "path": it.path, "score": round(it.score, 3), "tokens": it.tokens,
             "reason": it.seed_reason, "symbols": it.symbols[:3],
             "why": [{"node": s.node, "via": s.via} for s in it.why]}
            for i, it in enumerate(pack.items[:top])
        ],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=Path(".vendor/eval-repos/httpx"))
    ap.add_argument("--learn-history", type=int, default=300)
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--out", type=Path, default=Path("web/public/snapshot/hero.json"))
    a = ap.parse_args()
    root = a.root.resolve()
    store = make_store()
    hist = commits(root)
    IndexService(store).index(KEY, root, history=hist, fresh=True)
    on = RepoEngine(store, KEY, root, EngineParams())
    learned = warm_start(on, hist, limit=a.learn_history)
    off = RepoEngine(store, KEY, root, EngineParams(use_learned=False))
    vec = VectorRetriever(root)
    head = hist[-1].sha if hist else ""
    out = {
        "repo": "httpx", "head": head[:12], "learned_from_commits": learned, "budget_tokens": 2000,
        "scenarios": [
            {"task": t,
             "off": pack_view(off.get_context(t, 2000, record=False), a.top),
             "on": pack_view(on.get_context(t, 2000, record=False), a.top),
             "vector_top": vec.file_rank(t, k=a.top)}
            for t in TASKS
        ],
    }
    store.delete_repo(KEY)
    a.out.write_text(json.dumps(out, indent=1))
    print(f"wrote {a.out} (learned from {learned} commits at {head[:12]})")


if __name__ == "__main__":
    main()
