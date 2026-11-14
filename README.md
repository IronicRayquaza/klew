# Desirepath

**A self-improving context layer for coding agents, built on [HydraDB](https://github.com/hydra-db/hydradb).**

Every session, a coding agent rediscovers your repository by grepping and pasting whole files into its
context. Desirepath gives it a small map instead: the functions, callers, tests and files that matter for
*this* task, each with the path through the code that connects it to the task. It builds that map by
walking a code graph in HydraDB, not by pulling the most similar-looking chunks. Every merged PR teaches
the graph which paths actually led to the code that changed, so the next map is sharper.

> A *desire path* is the trail worn into grass by people walking it. Desirepath is the trail your agents
> wear into your codebase.

<!-- RESULTS:START -->
## Results

**flask**: 296 real commits replayed in order, 2,000-token budget for every arm.

| Arm | Right file in context | Tokens per correct file | Recall@5 | Recall@10 | Top-1 | p50 latency |
|---|---|---|---|---|---|---|
| Vector RAG | 49.0% | 4,038 | 52.8% | 66.1% | 40.2% | 12 ms |
| BM25 RAG | 55.5% | 3,213 | 58.8% | 72.0% | 40.5% | 0 ms |
| Graph, no learning | 83.2% | 1,499 | 50.6% | 66.0% | 37.2% | 169 ms |
| **Desirepath** | 88.3% | 2,049 | 59.0% | 73.6% | 40.9% | 444 ms |
| **Desirepath + vector seeds** | 93.3% | 2,098 | 66.6% | 80.1% | 45.6% | 488 ms |

Learning alone (same graph, learning on vs off): **+5.1 points** of right-file-in-context.

![learning curve](docs/img/flask-curve.png)

**httpx**: 297 real commits replayed in order, 2,000-token budget for every arm.

| Arm | Right file in context | Tokens per correct file | Recall@5 | Recall@10 | Top-1 | p50 latency |
|---|---|---|---|---|---|---|
| Vector RAG | 59.3% | 3,328 | 63.7% | 79.3% | 50.5% | 16 ms |
| BM25 RAG | 49.4% | 3,626 | 57.0% | 68.7% | 42.8% | 0 ms |
| Graph, no learning | 82.0% | 1,641 | 54.7% | 65.8% | 47.1% | 194 ms |
| **Desirepath** | 88.8% | 2,014 | 58.9% | 73.2% | 48.5% | 478 ms |
| **Desirepath + vector seeds** | 94.2% | 2,021 | 64.1% | 80.2% | 51.2% | 500 ms |

Learning alone (same graph, learning on vs off): **+6.8 points** of right-file-in-context.

![learning curve](docs/img/httpx-curve.png)

<!-- RESULTS:END -->

## How it works

```
 repo ──► tree-sitter indexer ──┐                       ┌──────────── HydraDB ────────────┐
 git history ──► co-change ─────┼── UNWIND/MERGE ─────► │ files · symbols · calls · tests │
                                │                       │ imports · inheritance           │
                                │                       │ CO_CHANGED · POINTS_TO (learned)│
                                │                       └───────▲──────────────▲──────────┘
 agent ─MCP─► get_context ─► seed ─► walk (1-hop expansions) ───┘              │
                              │       rank ─► pack (signatures + snippet,      │
                              │                     why-path per file)         │
 merged PR / record_outcome ──┴──► learning rule ─► reinforce / decay ─────────┘
```

1. **Map.** Tree-sitter parses the repo into files and symbols, with calls, imports, inheritance and tests
   between them, resolved statically through each file's imports. Git history adds `CO_CHANGED` edges between
   files that change together. All of it lives in HydraDB.
2. **Walk.** For a task, Desirepath seeds from names in the task: BM25 over symbol names, docstrings and body
   terms, exact identifiers, plus anything it has learned. It then propagates relevance hop by hop through
   HydraDB (calls, callers, tests, inheritance, imports, co-change), keeping the shortest path to every
   node. Files are ranked, then packed into the token budget as signatures plus the best snippet, each with
   its why-path.
3. **Learn.** When a run or merged PR lands, the files that actually changed reinforce `POINTS_TO` edges from
   the task's words to those files, and files that were served but not touched decay. Files touched together
   reinforce `CO_CHANGED`. Structural edges are facts and never change; experience is learned on top, so
   re-indexing never erases what the graph has learned.

### Why a graph and not a vector store

- **The file you need often doesn't look like the task.** It's the caller, the test, or the config two hops
  away. Similarity can't follow a call edge.
- **It learns without re-embedding.** Outcomes update edge weights in place.
- **Every item says why it's there.** A path through the code is auditable; a cosine score isn't.
- **It spends fewer tokens.** Structure tells us which signature and which body to include.

### How it uses HydraDB

- **Typed graph:** `DpFile`, `DpSymbol`, `DpTerm`, `DpRun`, `DpRepo` nodes. `CONTAINS`, `IMPORTS`, `CALLS`,
  `TESTS`, `INHERITS` (structural), `CO_CHANGED`, `POINTS_TO` (learned), `SERVED`, `TOUCHED` (provenance).
- **Traversal where the graph lives:** each hop is one anchored 1-hop expansion per (edge type, direction),
  e.g. `MATCH (a:DpSymbol)<-[r:CALLS]-(b) WHERE a.id IN $ids RETURN a.id, b.id, r.w`. That's about 34
  queries and about half a second per context pack on httpx (median 555 ms measured on a
  warm-started graph, laptop, Docker).
- **Learning writes back in place:** batched `UNWIND … MERGE (s)-[r:POINTS_TO {id: row.eid}]->(d) SET r.w = row.w`.
- **Run history as a graph:** every context request becomes a `DpRun` with `SERVED` and `TOUCHED` edges, an
  audit trail of what the agent was shown and what it changed.
- All Cypher lives in [`desirepath/adapters/queries.py`](desirepath/adapters/queries.py), with the dialect
  rules we verified against HydraDB v0.4.0.

## Quickstart

```bash
docker compose up -d                       # HydraDB from ghcr.io/hydra-db/hydradb (local, plaintext)
uv venv --python 3.12 .venv && uv pip install -e ".[dev]"
.venv/bin/desirepath index ~/code/your-repo                 # ~1s for 60 files / 1,200 symbols
.venv/bin/desirepath context --repo your-repo "what you want to change"
```

**Use it from Claude Code** (from inside the repository):

```bash
claude mcp add desirepath -- /path/to/desirepath/.venv/bin/desirepath mcp
```

MCP tools: `get_context(task, budget_tokens)`, `record_outcome(run_id, touched_files?)` (which defaults to
the working tree's changed files), `explain(task, path)`, and `graph_stats()`. There is deliberately no
raw-Cypher tool.

**Learn from merged PRs:** `desirepath learn-git <merge-sha>` locally, or the GitHub Action in
[`action/`](action/action.yml) (see `.github/workflows/desirepath-learn.example.yml`).

**Dashboard:** `desirepath serve` (API on :8000) and `cd web && npm install && npm run dev` (UI on :5173).
Without the API, the UI falls back to a recorded snapshot.

## Evaluation

`desirepath eval <repo> --window 300` replays the last 300 commits that modified 1–8 Python files, in order:

- **task** = the commit message; **truth** = the `.py` files it modified that exist in the snapshot.
- Every arm gets the **same 2,000-token budget**.
- The code is **re-indexed at the parent commit every 50 commits**, so nothing ever sees the future.
- The learning arm learns from each commit **after** answering it, exactly as it would from a merged PR.

Arms: **vector RAG** (bge-small-en-v1.5 over 40-line chunks, local via fastembed), **BM25 RAG** (same
chunks), **graph without learning**, **Desirepath**, and **Desirepath + vector seeds**.

Metrics: **right file in context** (share of changed files inside the 2k-token pack, which is what an agent
reads), **recall@5 / recall@10 / hit@1 / MRR** of the file ranking, **tokens per correct file**, and latency.

Limits, stated plainly:
- Commit messages are terser than real agent prompts.
- We score Python files only.
- Static call resolution is best-effort.
- Parameters were tuned on the first 50 commits of the first repository only (`scripts/tune.py`).

## Repository map

| Path | What |
|---|---|
| `desirepath/schema.py` | labels, edge types, walk steps and priors |
| `desirepath/adapters/` | HydraDB + in-memory stores, Cypher, tree-sitter reader, git miner |
| `desirepath/domain/` | pure logic: seeder, walker, packer, learning rule, BM25 |
| `desirepath/services/` | indexing and the per-repo engine |
| `desirepath/{mcp_server,cli,api}.py` | interfaces |
| `desirepath/baselines/`, `desirepath/eval/` | RAG baselines, replay harness, plots |
| `web/` | landing page, live dashboard, results (Vite + React) |
| `tests/` | domain tests + a store contract test run against both stores |

## License

MIT for this repository. HydraDB is licensed separately under the Elastic License 2.0; we use its
published container image and do not redistribute it.
