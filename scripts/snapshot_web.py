"""Build web/public/snapshot/: eval results (records stripped) + real recorded context packs.

Usage: .venv/bin/python scripts/snapshot_web.py --repo httpx --results eval/results
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from klew.runtime import get_runtime

TASKS = [
    "Support NO_PROXY environment variable with CIDR ranges",
    "Raise ReadTimeout when the server stalls while streaming the response body",
    "Client.send should not follow redirects to another origin with auth headers",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="httpx")
    ap.add_argument("--results", type=Path, default=Path("eval/results"))
    ap.add_argument("--out", type=Path, default=Path("web/public/snapshot"))
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    names = []
    for p in sorted(a.results.glob("*.json")):
        d = json.loads(p.read_text())
        d.pop("records", None)
        (a.out / f"eval-{p.stem}.json").write_text(json.dumps(d))
        names.append(p.stem)
    (a.out / "eval-index.json").write_text(json.dumps(names))
    curves = [json.loads(p.read_text()) for p in sorted((a.results / "learning").glob("*.json"))]
    (a.out / "learning.json").write_text(json.dumps(curves))
    eng = get_runtime().engine(a.repo)
    packs = [eng.get_context(t, 2000, record=False).model_dump() for t in TASKS]
    (a.out / "packs.json").write_text(json.dumps(packs))
    print(f"wrote {len(names)} results and {len(packs)} packs to {a.out}")


if __name__ == "__main__":
    main()
