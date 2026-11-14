# Python library

The CLI, MCP server and REST API are thin layers over one engine. You can use it directly.

```python
from pathlib import Path
from desirepath.runtime import get_runtime

rt = get_runtime()                                  # connects to HydraDB from HYDRA_* env vars
rt.index(Path("~/code/your-repo").expanduser(), "your-repo")

engine = rt.engine("your-repo")
pack = engine.get_context("Support NO_PROXY with CIDR ranges", budget_tokens=2000)
for item in pack.items:
    print(item.path, round(item.score, 2), " → ".join(s.node for s in item.why))

report = engine.record_outcome(pack.run_id, ["httpx/_utils.py"])
print(report.hits, report.unserved, report.edges_created)
```

`ContextPack`, `ContextItem`, `PathStep` and `LearnReport` are Pydantic models (`desirepath.models`), so
`pack.model_dump_json()` gives you the same JSON the REST API returns.

## Using another store

Everything talks to storage through the `GraphStore` protocol (`desirepath/ports.py`). Set `DP_STORE=memory`
to run the whole engine on the in-memory reference store, with no HydraDB at all. It's useful for tests.
