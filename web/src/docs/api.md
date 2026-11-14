# REST API

`desirepath serve` starts a FastAPI server on `http://127.0.0.1:8000`. Interactive docs are at `/docs`,
and the OpenAPI schema is at `/openapi.json`. The dashboard uses this API, and you can too.

## Endpoints

| Method | Path | |
|---|---|---|
| `GET` | `/api/health` | `{"status": "ok"}` |
| `GET` | `/api/repos` | Indexed repositories: `repo`, `root`, `head`, `runs` |
| `GET` | `/api/stats?repo=` | Files, symbols, learned terms, runs, edges by type |
| `POST` | `/api/context` | Get a context pack |
| `POST` | `/api/outcome` | Record what a run changed, so the graph learns |
| `GET` | `/api/runs?repo=&limit=50` | Recent runs, newest first, with the files served |
| `GET` | `/api/runs/{run_id}/subgraph` | Nodes and links along a run's why-paths (for graph views) |
| `GET` | `/api/eval` | Evaluation results available on this server |
| `GET` | `/api/eval/{name}?records=false` | One result: summary and curves (per-commit records with `records=true`) |

## Get context

```bash
curl -s -X POST http://127.0.0.1:8000/api/context \
  -H 'Content-Type: application/json' \
  -d '{"repo": "httpx", "task": "Raise ReadTimeout when the server stalls while streaming", "budget_tokens": 2000}'
```

```json
{
  "run_id": 567736201929104,
  "repo": "httpx",
  "task": "Raise ReadTimeout when the server stalls while streaming",
  "items": [
    {
      "file_id": 3198932373963087,
      "path": "httpx/_exceptions.py",
      "score": 13.8129,
      "tokens": 111,
      "symbols": [
        "class ReadTimeout(TimeoutException)  # Timed out while receiving data from the host.",
        "…"
      ],
      "snippet": "class ReadTimeout(TimeoutException):\n    \"\"\"\n    Timed out w …",
      "why": [
        {"node_id": 3198932373963087, "node": "httpx/_exceptions.py", "via": null, "weight": null}
      ],
      "seed_reason": "name match: httpx/_exceptions.py"
    },
    {
      "path": "httpx/_config.py",
      "score": 8.7339,
      "why": [
        {"node": "httpx._config.Timeout.__init__", "via": null},
        {"node": "httpx/_config.py", "via": "defined in"}
      ],
      "…": "…"
    }
  ],
  "tokens": 755,
  "budget_tokens": 2000,
  "abstained": false,
  "abstain_reason": "",
  "timings": {"seed_ms": 0.54, "walk_ms": 184.03, "rank_ms": 0.2, "pack_ms": 11.06, "total_ms": 195.84, "queries": 23}
}
```

Trimmed for length: the real response has more items and full symbols and snippets. A pack can use less
than the budget when the remaining candidates score too low to be worth the tokens.

`budget_tokens` must be between 200 and 32,000. If nothing in the graph matches the task, the response
has `abstained: true` and no items. A wrong answer would cost more than no answer.

## Record an outcome

```bash
curl -s -X POST http://127.0.0.1:8000/api/outcome \
  -H 'Content-Type: application/json' \
  -d '{"repo": "httpx", "run_id": 567736201929104, "touched_files": ["httpx/_models.py", "httpx/_exceptions.py", "httpx/_transports/default.py"]}'
```

```json
{
  "run_id": 567736201929104,
  "hits": ["httpx/_models.py", "httpx/_exceptions.py"],
  "misses": ["httpx/_config.py", "tests/conftest.py", "httpx/_content.py"],
  "unserved": ["httpx/_transports/default.py"],
  "edges_reinforced": 4,
  "edges_decayed": 0,
  "edges_created": 20
}
```

`hits` were served and touched. `misses` were served but not touched, so any learned links toward them are weakened (here there were none yet, so nothing decayed). `unserved`
were touched but never served, so new links are created toward them.

Runs are kept in memory by the server that created them. To learn from a run created elsewhere, use
`desirepath learn-git` or the [Python library](#docs/library).
