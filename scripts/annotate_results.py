"""Backfill agent_view_held_out into existing eval/results/*.json (from their per-commit records)."""
import json
from pathlib import Path

from klew.eval.replay import agent_view, slice_dates

for p in sorted(Path("eval/results").glob("*.json")):
    d = json.loads(p.read_text())
    held = [r for r in d["records"] if r["i"] >= d.get("tuned_on_first", 100)]
    d["agent_view_held_out"] = agent_view(held, d["arms"])
    d["tuning_repo"] = "httpx"
    d["slices"] = slice_dates(Path(d["source"]), d["records"], d.get("tuned_on_first", 100))
    p.write_text(json.dumps(d, indent=1))
    v = d["agent_view_held_out"]
    print(p.stem, d["slices"], "vector none:", v["baseline_none_in_context"], {a: x for a, x in v["arms"].items() if a in ("graph_hybrid", "graph_learn")})
