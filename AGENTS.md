# AGENTS.md: Desirepath

Start here if you are an AI agent (or a human) joining this codebase. Keep this file current:
whoever finishes a module updates **Module map**, **Latest changes**, and **Next up** in the
same change.

## What this is

Desirepath is an MCP context server for coding agents, built on HydraDB for the HydraDB
Hackathon (Nov 14–16, 2026; deadline ~Nov 16 09:00 IST). It indexes a repo into a code graph
in HydraDB. Given a task, it walks that graph (bounded traversal, no vector search) and
returns a token-budgeted context pack with a "why" path for every item. After each run or
merged PR it learns which paths led to the files that actually changed, so the next pack is
sharper.

Judging: engineering + go-to-market. Hard rule: "it has to earn its place over a vector store."

## Reading order

1. This file.
2. `docs/PLAN.md`: full architecture, data model, flows, eval design, schedule, GTM.
3. `desirepath/schema.py`: labels, edge types, walk steps and priors.
4. `desirepath/ports.py`: the `GraphStore` interface everything depends on.
5. `desirepath/adapters/queries.py`: every Cypher statement, plus the HydraDB dialect rules.
6. `tests/test_store_contract.py`: what both stores guarantee.

## Run it

```bash
docker compose up -d                       # HydraDB (ghcr.io/hydra-db/hydradb:latest), plaintext dev
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9090/readyz   # expect 200
uv venv --python 3.12 .venv && uv pip install -e ".[dev,eval]"
.venv/bin/python -m pytest -q              # memory store only
DP_TEST_HYDRA=1 .venv/bin/python -m pytest -q   # also against live HydraDB
```

Env: `HYDRA_URI` (bolt://127.0.0.1:7687), `HYDRA_TOKEN` (local-development-token-32-bytes),
`HYDRA_GRAPH` (default), `DP_STORE` (hydra|memory). Compose pins `GRAPH_CYPHER_ENGINE=legacy`.

## Layout and module map

Status: ✅ done · 🟡 in progress · ⬜ todo

| Path | Layer | Status | Notes |
|---|---|---|---|
| `docker-compose.yml` | infra | ✅ | HydraDB node, named volume at /tmp/graph, telemetry off, legacy engine |
| `desirepath/config.py`, `ids.py`, `text.py` | core | ✅ | env settings · 52-bit ids · tokenizer (snake/camel split, stopwords, stemming) |
| `desirepath/schema.py` | core | ✅ | labels, edge types, `WALK_STEPS` (edge, direction, prior) |
| `desirepath/models.py` | core | ✅ | Pydantic: ContextPack, ContextItem, PathStep, LearnReport, GraphStats |
| `desirepath/ports.py` | core | ✅ | GraphStore protocol |
| `desirepath/adapters/queries.py` | adapter | ✅ | all Cypher |
| `desirepath/adapters/hydra_store.py` / `memory_store.py` | adapter | ✅ | both pass `tests/test_store_contract.py` |
| `desirepath/adapters/source_reader.py` | adapter | ✅ | tree-sitter: symbols, signatures, docstrings, body terms, calls, imports, bases |
| `desirepath/adapters/git_miner.py` | adapter | ✅ | commits (oldest first), co-change counts, detached worktrees |
| `desirepath/adapters/tokens.py` | adapter | ✅ | tiktoken cl100k, falls back to chars/4 |
| `desirepath/services/index.py` | app | ✅ | parse → static name resolution → nodes/edges → HydraDB; co-change from history |
| `desirepath/domain/bm25.py`, `seeder.py` | domain | ✅ | lexical seeds (names, docs, body terms, exact identifiers) + learned seeds (POINTS_TO) |
| `desirepath/domain/walker.py` | domain | ✅ | BFS-layered relevance propagation, 1-hop expansions in HydraDB, why-path back-pointers |
| `desirepath/domain/packer.py` | domain | ✅ | rank files (symbol credit → file), token-budgeted pack with signatures + snippets |
| `desirepath/domain/learning.py` | domain | ✅ | reinforce POINTS_TO toward touched files, decay served misses, reinforce CO_CHANGED |
| `desirepath/services/engine.py` | app | ✅ | RepoEngine: `get_context`, `record_outcome`; optional external (vector) seeds |
| `desirepath/runtime.py` | app | ✅ | composition root used by CLI/MCP/API |
| `desirepath/baselines/` | eval | ✅ | chunker, BM25 RAG, vector RAG (fastembed bge-small, local) |
| `desirepath/eval/replay.py` | eval | ✅ | git-history replay, 5 arms, metrics + curves → JSON |
| `desirepath/mcp_server.py` | interface | ✅ | MCP v2 `MCPServer`, stdio: get_context, record_outcome, explain, graph_stats |
| `desirepath/cli.py` | interface | ✅ | `index`, `context`, `learn-git`, `stats`, `eval`, `serve`, `mcp` |
| `desirepath/api.py` | interface | ✅ | FastAPI for the dashboard (context, outcome, runs, subgraph, eval) |
| `web/` | frontend | ✅ | Landing (`#`), Dashboard (`#app`), Results (`#results`), Docs (`#docs/<slug>`); falls back to `public/snapshot/` without the API; checked at 390px and 1280px, light and dark |
| `web/src/docs/*.md` | docs | ✅ | 12-page manual (quickstart, MCP, CLI, REST API, Action, library, concepts, architecture, evaluation, integrations/plans, FAQ). Examples are real recorded outputs; regenerate them if behaviour changes |
| `eval/results/` | eval | ✅ | final httpx + flask results (5 arms); charts in `docs/img/` |
| `action/`, `.github/workflows/` | product | ✅ | learn-on-merge Action, example workflow, CI (ruff, pytest, live HydraDB, web build); CI not yet run on GitHub |
| `scripts/` | tooling | ✅ | `tune.py` (held-in grid), `readme_results.py`, `snapshot_web.py` |
| `README.md`, `JUDGES.md`, `docs/VIDEO.md` | docs | ✅ | README results come from the JSON via `scripts/readme_results.py` |

## Conventions

- Domain code is pure: no I/O, no driver imports. It talks to storage only through `GraphStore`.
- All Cypher goes in `adapters/queries.py`. Never inline Cypher elsewhere.
- Every write is idempotent (deterministic ids + MERGE). Batch at ≤1000 rows.
- Scoring math happens in Python, never in Cypher.
- Structural edges are facts from the indexer and are never learned. Experience lives only in
  learned edge types (`POINTS_TO`, `CO_CHANGED`), so re-indexing can never erase learning.
- New store behaviour needs a case in `tests/test_store_contract.py` that passes on both stores.
- **Do not commit or push** until the repo owner says so.

## HydraDB gotchas (verified on v0.4.0, legacy engine)

- Explicit transactions are rejected: use auto-commit `session.run`, not `driver.execute_query`.
- Vertex batch: `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Label, n.x = row.x`.
  Putting the label or properties inside MERGE is rejected.
- Edge batch: `UNWIND $rows AS row MATCH (s:A {id: row.src}), (d:B {id: row.dst}) MERGE (s)-[r:T {id: row.eid}]->(d) SET r.w = row.w`.
  The relationship MERGE needs an `id`.
- A list-of-maps parameter is only legal as UNWIND input. For batched reads, use `WHERE a.id IN $ids`
  with a scalar list (works despite the docs saying `IN` is unsupported).
- `r.id` is not readable (it's identity). Reading `r.w` works when the far node is unlabeled:
  `MATCH (a:A)-[r:T]->(b) WHERE a.id IN $ids RETURN a.id, b.id, r.w`.
- No `type(r)`, `labels(n)`, `coalesce`, `ON CREATE SET`, or list-valued properties
  (store JSON strings). One relationship type per pattern.
- `algo.SPpaths` / `algo.SSpaths` work. Paths come back as `[nodeProps, 'TYPE', nodeProps, …]`
  without node ids, so keep a human `key` property on every node. `algo.MSpaths` needs string `sourceValues`.
- The datafusion engine rejects the vertex-batch form. Stay on legacy.
- Throughput (M5 laptop, Docker): ~30k vertices/s and ~14k edges/s batched; 1-hop expand ~1–2 ms.

## Latest changes (newest first)

- **2026-11-14 H9.5: hub damping + docs site.**
  - Ranking divides file scores by `(1 + ln(1 + symbols))^0.5` (`EngineParams.hub_damping`, tuned on the
    held-in slice). Final results were re-run and promoted:

    | | httpx in-ctx | flask in-ctx | httpx r@5 / top-1 | flask r@5 / top-1 | tok/hit httpx |
    |---|---|---|---|---|---|
    | Vector RAG | 59.3% | 49.0% | 63.7% / 50.5% | 52.8% / 40.2% | 3,328 |
    | Desirepath | 77.3% | 76.6% | 57.2% / 48.1% | 58.5% / 38.2% | 1,483 |
    | Desirepath + vector seeds | **83.2%** | **83.9%** | **64.9% / 52.5%** | **63.9% / 44.3%** | 1,474 |

  - The hybrid now beats vector RAG on every quality metric on both repos. It's slower: ~350 ms vs ~15 ms.
    Learning alone: +7.6 pts (httpx), +6.4 pts (flask).
  - New Docs section in the web app (`web/src/pages/Docs.tsx` + Markdown). "Read the docs" link on the landing page.
  - `/api/repos` hides eval-internal graphs. `eval --arms` defaults to all five arms. The demo graph `flask` is indexed.
- **2026-11-14 H9**: First push to https://github.com/IronicRayquaza/desirepath (private for now). CI is green on
  GitHub, including the live-HydraDB contract tests (23 passed).
- **2026-11-14 H8.5: first final evals** (superseded by H9.5's re-run with hub damping; numbers below are history). Default `hops=2` (held-in grid on the first 50 httpx commits).

  | | httpx in-context | flask in-context | tokens/hit (httpx) | recall@5 httpx / flask |
  |---|---|---|---|---|
  | Vector RAG | 59.3% | 49.0% | 3,328 | 63.7% / 52.8% |
  | Desirepath | 76.1% | 75.9% | 1,581 | 56.8% / 56.0% |
  | Desirepath + vector seeds | **82.4%** | **83.3%** | 1,587 | 60.6% / **59.1%** |

  Learning alone adds +6.3 (httpx) and +5.4 (flask) points. Vector still has the best recall@5 on httpx.
  - Web app finished and visually checked. Hero sample is real CLI output.
  - MCP warm-up at start: first call 300 ms (was 3.3 s).
  - Fixed: replay worktree cleanup (`remove_worktree`); the phone overflow on the dashboard.
- **2026-11-14 H8**: Retrieval, learning, eval, and product surface are all working end to end on `encode/httpx`.
  - Indexing httpx takes 0.9s (60 files, 1,240 symbols, ~3.8k structural + 728 co-change edges). get_context
    runs ~130–300 ms with ~34 HydraDB queries.
  - **Eval v0** (history, superseded; 297 commits, 2k-token budget, before the seeding fixes):

    | Arm | budget recall | tokens | tokens/hit | recall@5 | hit@1 |
    |---|---|---|---|---|---|
    | vector | 0.593 | 1973 | 3328 | 0.637 | 0.505 |
    | bm25 | 0.489 | 1788 | 3652 | 0.556 | 0.411 |
    | graph_static | 0.657 | 1192 | 1813 | 0.508 | 0.367 |
    | graph_learn | **0.733** | 1277 | **1742** | 0.560 | 0.374 |

  - Since v0, the seeder also uses body terms, "test" is no longer a stopword, more filler words
    are stopwords, signatures are truncated, and there's a `graph_hybrid` arm (vector seeds → learning graph).
    v1 is running.
  - The MCP server was verified over stdio with the SDK client (all 4 tools). The CLI was verified (`index`, `context`).
  - Design change: learning touches only learned edge types (see Conventions).
- **2026-11-14 H6**: HydraDB running in Docker from the published image. Dialect probed. Core package
  scaffolded. Store contract test is green on both stores.

## Next up

- **B (teammate): UI pass on `web/`.** The pages are Landing `src/pages/Landing.tsx`, Dashboard
  `src/pages/Dashboard.tsx`, Results `src/pages/Results.tsx`, and Docs `src/pages/Docs.tsx` + `src/docs/*.md`.
  Theme tokens live in `src/index.css` (light and dark). Run it with `desirepath serve` + `cd web && npm run dev`.
  Starting backlog:
  - Consider leading the landing stats with the hybrid (83% right-file-in-context) instead of graph-only (77%).
  - The Results page lists repos alphabetically (flask first); httpx first may read better.
  - The why-path force graph clips nodes at its edges; consider fitting the view after layout (`zoomToFit`).
  - Keep every number sourced from `eval/results/*.json` (snapshot: `scripts/snapshot_web.py`). Never hard-code results.
  - Check at 390px and 1280px in both themes; the page must not scroll horizontally.
- **Everyone:** confirm submission rules on Discord; make the repo public before submitting; record the
  video (`docs/VIDEO.md`); deploy `web/` as a static site.
- **A (optional):** TypeScript parsing, a third eval repo, pruning of learned edges with misses ≫ hits.

## Known issues / open questions

- The Luma page doesn't list submission requirements. Confirm on Discord.
- Graph-only Desirepath still trails vector RAG on httpx top-1/recall@5; the hybrid beats it everywhere. Say
  so plainly in the pitch, along with the latency cost.
- The demo `httpx` graph has a few learned outcomes from testing (e.g. 'cidr' → `_utils.py`). The landing hero
  shows that output and says so. Re-index for a clean graph.
- `algo.MSpaths` needs string `sourceValues`, and our ids are ints. Not used; the walker uses 1-hop expansion.

## How to evaluate

```bash
.venv/bin/desirepath eval .vendor/eval-repos/httpx --name httpx --window 300   # ~6 min on an M-series laptop
# arms: vector,bm25,graph_static,graph_learn,graph_hybrid → eval/results/httpx.json
```
Clone eval repos into `.vendor/eval-repos/` (gitignored), with full history.
