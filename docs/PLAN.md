# Klew: Architecture & Build Plan (HydraDB Hackathon, Nov 14–16, 2026)

## 0. Context

- **Event** ([luma.com/bqwllms4](https://luma.com/bqwllms4)): 48 hours from Nov 14, 9 AM IST, so the deadline is about Nov 16, 9 AM IST. Target submission is H46. The prize pool is $1,000. Judging covers **engineering and go-to-market**, and there is one hard rule: *"it has to earn its place over a vector store."*
- **Tracks:** (1) "A graph that improves itself, sharper every run." (2) "The context layer for agents, traversing structure instead of burning tokens." The design below targets both.
- **HydraDB OSS:** a Rust graph database on object storage. It speaks an openCypher subset over Bolt (we use the Python `neo4j` driver) and HTTP :8443, and has `algo.SSpaths/MSpaths/SPpaths/degree`. There is **no vector search and no SDK**.
- **Lessons from Hack Hydra (Aug 2026):** no winners have been published. The rubric ran: technical execution > graph-native HydraDB use > product completeness > quality of results > originality. The strongest entries (Seismic, Hindsight, HydraClaim) all had a narrow wedge, a typed graph, bounded native traversal, an MCP surface, why-paths and abstention, a reproducible baseline comparison, and honest limitations. None of them combined self-improvement with context serving, so that's our gap.
- **Team:** 2 people (A = graph/backend/eval, B = product/frontend/GTM). Stack: Python + React.

**Product in one line:** Klew is an MCP context server for coding agents. It hands the agent a token-budgeted map of the code that matters, found by traversing a code graph in HydraDB, and it learns from every run and merged PR which paths actually led to the files that changed.

---

## 1. System context

```
  Developer ──uses──► Coding agent (Claude Code / Cursor)
                          │  MCP (stdio)
                          ▼
  GitHub ──PR merged──► ┌───────────────── Klew ─────────────────┐ ◄── Judge / visitor
  (Action)              │  Python pkg (MCP · API · CLI)  +  React web  │     (landing, dashboard)
                        └───────────────────────┬──────────────────────┘
                                                │ Bolt :7687
                                                ▼
                               HydraDB (graph-node + indexer, local object store)
```

## 2. Containers (things we deploy)

| Container | Tech | Responsibility | Ports |
|---|---|---|---|
| `hydradb` | Upstream Dockerfile; local FS / MinIO object store | Source of truth for the code graph, learned weights, and runs | 7687, 8443, 9090 |
| `klew mcp` | Python, FastMCP, stdio | Agent-facing tools. Talks to HydraDB **directly**, with no API hop | stdio |
| `klew serve` | FastAPI + SSE | Dashboard API and live run events | 8000 |
| `klew` CLI | Typer | `init`, `index`, `learn`, `eval`, `consolidate` | — |
| `web` | Vite + React + Tailwind + react-force-graph + Recharts | `/` landing page, `/app` dashboard. **Snapshot mode** loads precomputed JSON, so it can deploy to Vercel with no backend | 5173 |
| GitHub Action | Composite action that runs `uvx klew learn --pr` | Learns from each merged PR | — |

The three Python entrypoints share one `core` package.

## 3. Layering inside the Python package (ports and adapters)

```
interfaces   mcp_server.py │ api.py │ cli.py                      (thin: validate → call service → serialize)
application  ContextService │ LearningService │ IndexService │ EvalRunner
domain       Seeder · Walker · Ranker · Packer · LearningRule · Consolidator     (pure, no I/O, unit-tested)
ports        GraphStore (Protocol) · SourceReader · TokenCounter
adapters     HydraGraphStore (neo4j driver) · InMemoryGraphStore (fake) · GitTreeSitterReader · tiktoken
             baselines/bm25.py · baselines/vector.py (fastembed)
```

**Why an `InMemoryGraphStore`:** (a) person B can build MCP and the dashboard from H3, before HydraDB is up; (b) it gives fast unit tests; (c) a **contract test** checks that both stores return the same packs on a fixture repo, which proves the HydraDB adapter is correct.

All Cypher lives in **one file**, `adapters/queries.py`. If the dialect rejects something (`ON CREATE SET`, `coalesce`, `type(r)`), we fix it in one place.

## 4. Data model (HydraDB)

**IDs:** `id` is an int64 from `blake2b(repo|kind|qualname)`, so it's deterministic and every write can be a `MERGE`. `key` holds the human-readable string. Every node carries `repo`. Labels are namespaced `Klew*`.

| Node | Key properties |
|---|---|
| `KlewRepo` | `id, name, head_sha` |
| `KlewFile` | `id, repo, path, lang, tokens, sha` |
| `KlewSymbol` | `id, repo, qualname, kind(func/class/method), sig, start, end, file_id, tokens` |
| `DpTest` | same shape as `KlewSymbol`, for test functions |
| `DpConfig` | `id, repo, path, keys` |
| `KlewTerm` | `id, text` (normalized task vocabulary: snake/camel split, stemmed, stop-worded) |
| `KlewRun` | `id, repo, task, ts, source(agent/pr/replay), served_json, outcome, tokens_served` |

| Edge | From → To | Properties | Kind |
|---|---|---|---|
| `CONTAINS` | File → Symbol/Test | `w` | structural |
| `IMPORTS` | File → File | `w` | structural |
| `CALLS` | Symbol → Symbol | `w` | structural (best-effort name resolution) |
| `INHERITS` | Symbol → Symbol | `w` | structural |
| `TESTS` | Test → Symbol | `w` | structural (heuristic) |
| `READS_CONFIG` | Symbol → Config | `w` | structural |
| `CO_CHANGED` | File → File (stored in both directions) | `w, count` | mined from git |
| `POINTS_TO` | Term → File/Symbol | `w, hits, misses, updated_at` | **learned** |
| `SHORTCUT` | Symbol/File → File | `w, hits` | **learned** (consolidator) |
| `SERVED` / `TOUCHED` | Run → File/Symbol | `rank, score` | provenance |

**Where data lives:** code *text* stays on disk. The graph stores structure, spans, and hashes, which keeps it small. Re-indexing is triggered by a changed file `sha`.

**Representative queries** (all anchored, batched at ≤1000 per call, math done in Python):

```cypher
-- upsert
UNWIND $rows AS row MERGE (n:KlewSymbol {id: row.id}) SET n.qualname=row.q, n.sig=row.sig, n.start=row.s, n.end=row.e, n.repo=row.repo
UNWIND $rows AS row MATCH (a:KlewSymbol {id: row.src}) MATCH (b:KlewSymbol {id: row.dst}) MERGE (a)-[r:CALLS]->(b) SET r.w=row.w
-- frontier expansion (one query per edge type, run concurrently)
UNWIND $ids AS i MATCH (a {id: i})-[r:CALLS]->(b) RETURN a.id AS src, b.id AS dst, r.w AS w
-- learned weight write-back
UNWIND $rows AS row MATCH (a:KlewTerm {id: row.src})-[r:POINTS_TO]->(b {id: row.dst}) SET r.w=row.w, r.hits=row.h, r.misses=row.m
```

The `Walker` has two implementations behind one interface: `AlgoPathsWalker` (native `algo.MSpaths`, used once we've confirmed its output shape at H0) and `FrontierWalker` (iterative 1-hop `UNWIND`, the safe fallback).

## 5. Core flows

**5.1 Index** (`klew init` / `index`)
1. `SourceReader` walks the `.py` files with tree-sitter and extracts symbols, imports, calls, and tests.
2. It resolves names through each file's imports and the same module.
3. `GraphStore.upsert` writes nodes first, then edges.
4. `miner` reads the last N commits, counts co-changes, and writes `CO_CHANGED.w = count / max`.
5. It builds the in-memory **lexicon** (BM25 over symbol names, paths, and docstrings, plus the `KlewTerm` table), because HydraDB has no full-text search.

**5.2 get_context** (hot path, target p95 < 300 ms on about 5k symbols)
```
task ─► Seeder: terms + identifiers → seeds {node: s0}  (lexicon match ∪ learned POINTS_TO from KlewTerm)
     ─► Walker: ≤3 hops, fan-out cap 50/node, ≤2000 edges, over CALLS/IMPORTS/TESTS/CO_CHANGED/SHORTCUT
     ─► Ranker: score(n) = Σ_paths s0 · Π w(e) · γ^len  (γ=0.6, drop paths < ε); best path kept as why_path
     ─► Packer: greedy by score/tokens → signature first, then snippet span read from disk; stop at budget
     ─► ContextPack {run_id, items[], tokens, timings, abstained}   (abstain if max seed score < τ)
     ─► async: write KlewRun + SERVED (queue, never blocks the response)
```

**5.3 record_outcome** (after an agent run, from a git hook, or the agent calling it)
1. Work out the touched files: use the `touched_files` passed in, or else compute them from `git diff`.
2. `LearningRule` loads the served paths from `KlewRun.served_json` and computes deltas:
   - Served items whose why-path ended in a touched file: `w(e) += α·(1 − w/w_max)` along that path, and `POINTS_TO(term→file) += α` for each task term. Missing edges are created at w0 = 0.5.
   - Served items that weren't touched: `w(e) −= β·w` with a floor of 0.05. Structural edges are never deleted.
   - Touched files that were *never served*: create `POINTS_TO(term→file)` at w0. This is what fixes misses.
3. Write the updates back in batches under a **per-repo file lock**, so concurrent learners don't race. Reads stay lock-free on HydraDB snapshots.
4. Emit an SSE event so the dashboard animates the changed edges.

**5.4 learn_from_pr** (GitHub Action, and the eval replay): PR title and body become the task, and the changed files become the truth. It calls `get_context` with `serve=false`, then `record_outcome`, so it's exactly the same code path as an agent run.

**5.5 consolidate** (every N runs)
- Promote `POINTS_TO` pairs with `hits ≥ k` that are reached through a common intermediate into `SHORTCUT` edges.
- Prune learned edges where `misses > m · hits`.
- Report the counts of added and pruned edges. That's the visible proof that "the graph improves itself."

**5.6 Eval replay** (`klew eval`)
1. For each commit in chronological order: predict, score against the changed files, then learn.
2. Arms: vector RAG (fastembed bge-small + numpy), BM25, static graph, learning graph, and an optional vector-seed + learning graph arm.
3. Output `eval/results/{repo}.json` with the commit hash, plus plots.
4. Tune α/β/γ on the first 50 commits of repo 1 only. Report results on everything held out.

## 6. Interfaces

All interfaces share Pydantic models (`ContextPack`, `ContextItem{id, file, symbol, sig, snippet, score, tokens, why_path[{node, edge, w}]}`, `Outcome`, `RunSummary`, `GraphStats`).
- B generates TypeScript types from OpenAPI with `openapi-typescript`.
- B can mock against fixture JSON from H3.

**MCP tools:**
- `get_context(task, budget_tokens=2000, repo?)` returns a `ContextPack`.
- `explain(run_id, item_id)` returns the full path with edge weights and their history.
- `record_outcome(run_id, touched_files?, success?, failed_tests?)`
- `learn_from_pr(title, body, changed_files)`
- `graph_stats(repo?)`
- There is **no raw Cypher tool**, so the attack surface stays small.

**REST:**
- Context and outcome: `POST /api/context`, `POST /api/outcome`
- Runs: `GET /api/runs`, `GET /api/runs/{id}`, `GET /api/runs/{id}/subgraph`
- Repos and results: `GET /api/repos`, `GET /api/stats`, `GET /api/eval/results`
- Live events: `GET /api/events` (SSE)

**Config:** `.klew.toml` in the repo, plus env vars `HYDRA_URI`, `HYDRA_TOKEN`, `HYDRA_GRAPH=default`, `HYDRA_CELL=cell-0`, and `RUST_MIN_STACK` for the node.

## 7. Deployment

- **Local / judges:** `docker compose up` starts `hydradb` (built from the upstream Dockerfile, with a volume `./data/store`) and `api`. MCP runs on the host via `uvx klew mcp`. `scripts/demo-seed.sh` loads a committed demo dataset, so judges don't have to clone anything.
- **Public demo:** `web` on Vercel in snapshot mode, backed by precomputed eval and recorded runs. A live backend on a small VM is a stretch goal.
- **CI:** GitHub Actions runs ruff + mypy + pytest. One job builds or pulls the HydraDB image and runs the integration and contract tests.

## 8. Cross-cutting

- **Idempotency:** deterministic IDs + `MERGE`, so re-running index or learn is safe.
- **Performance:** batches of 1000, edge-type queries run concurrently, a cap on walk size, the lexicon kept in memory, and timings (seed/walk/rank/pack) returned in every pack and shown on the dashboard.
- **Observability:** structlog JSON logs, HydraDB `/metrics`, and the `KlewRun` history doubles as the audit log.
- **Security and privacy:** code never leaves the machine; the MCP surface is read-only except the learning tools; plaintext HydraDB is used only for local development.
- **Testing pyramid:** domain unit tests (ranking math, packing, learning rule, seeding) → InMemory-vs-Hydra contract test → live integration test → golden eval fixture (5 commits with known expected files).

## 9. Key decisions (ADR-lite)

1. **Rank in Python, not Cypher.** The dialect forbids arithmetic in `RETURN`, and Python is easier to tune and test. HydraDB does what it's good at: durable, snapshot-consistent, bounded traversal.
2. **No vectors on the core path.** Vectors appear only as a baseline and an optional seeding arm. This answers "earn its place over a vector store" directly.
3. **Learning from PRs is the same code path as learning from agent runs.** The eval is the product loop, so the chart is honest.
4. **One Python package with three entrypoints**, plus a GraphStore port with a fake. This unblocks parallel work and gives a fallback if HydraDB is late.
5. **Code text on disk, structure in the graph.** The graph stays small, there's no stale text, and privacy is easy to explain.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| HydraDB build fails on macOS (Rust 1.99+, GraphBLAS, libcypher-parser) | Start at H0. Fall back to the Dockerfile. Use `InMemoryGraphStore` in the meantime |
| Unknown `algo.*paths` output / dialect gaps | Probe at H0. `FrontierWalker` fallback. All Cypher in `queries.py` |
| Python call resolution is imprecise | Best-effort resolution through imports; `CO_CHANGED` + learned edges make up for it; documented as a limitation |
| The learning curve is flat | Tune on held-in commits; add SHORTCUTs; fall back to the tokens-per-hit story; report honestly |
| 48-hour time pressure | Follow the cut list in §12 |

## 11. Repo layout

```
klew/
  core/domain/{seeder,walker,ranker,packer,learning,consolidator}.py
  core/services/{context,learning,index,eval}.py
  core/ports.py  core/models.py
  adapters/{hydra_store,memory_store,queries,source_reader,tokens}.py
  baselines/{bm25,vector}.py
  mcp_server.py  api.py  cli.py
eval/{replay,plots}.py  eval/results/
web/  (src/pages/{Landing,Dashboard,Run}.tsx, src/api/types.ts generated)
.github/workflows/ci.yml  action/action.yml
docker-compose.yml  scripts/demo-seed.sh
README.md  ARCHITECTURE.md  JUDGES.md  LICENSE (MIT; attribute HydraDB ELv2)
```

## 12. 48-hour schedule and scope cuts

| Hours | A (graph/backend/eval) | B (product/frontend/GTM) |
|---|---|---|
| 0–3 | Build HydraDB, smoke test, probe `algo.*paths` and dialect | Read the Discord rules; scaffold package, models, InMemory store, Vite app |
| 3–10 | `queries.py`, HydraGraphStore, SourceReader, miner; load repo 1 | MCP server and API on the InMemory store; wire into Claude Code |
| 10–18 | Seeder/Walker/Ranker/Packer; BM25 and vector baselines | Dashboard: pack viewer and why-path graph |
| 18–24 | Sleep in shifts; long ingests run overnight | ← |
| 24–32 | LearningRule, consolidator, eval replay; first curve | Landing page, savings calculator, Action, live SSE view |
| 32–38 | Full eval on 2 repos, tuning, freeze results | Live agent A/B (3 tasks); screen captures |
| 38–44 | README, ARCHITECTURE, JUDGES, limitations; CI green | Video of 3 minutes or less; Vercel deploy |
| 44–46 | Fresh-clone test → **submit** | Form, Discord/X post |

**Must have:** indexer, retrieval, learning, replay eval against the vector baseline with the curve, MCP server, README, video. **Should have:** dashboard graph view, landing page, Action, second repo. **Could have:** consolidator, TypeScript parsing, live hosted backend.

## 13. Go-to-market (shown on the landing page and in the README)

- **Customer:** engineering teams of 20–500 devs using coding agents on large repos. **Buyer:** the DevEx or platform lead.
- **Wedge:** free, local, OSS MCP server with a one-line install.
- **Paid tier:** *Team graph* at about $15–20 per dev per month. It's a shared learned graph on HydraDB object storage, so every engineer's runs sharpen everyone's agent: a network effect and an accumulating moat.
- **Distribution:** MCP registries, Claude Code plugin, GitHub Marketplace Action.

## 14. Verification

- `pytest`: domain unit tests, the contract test, and a live HydraDB integration test. The integration test checks that a 2-hop neighbor comes back with its why-path, and that `w` increases after `record_outcome`.
- `make eval` reproduces `eval/results/*.json` and the plots from a clean checkout.
- `claude mcp add klew -- uvx klew mcp`, then a real task: confirm `get_context` is called and `record_outcome` updates the weights shown on the dashboard.
- Fresh-clone quickstart on the second machine before submitting.

## 15. Working rules (from the user)

- **No `git commit` and no `git push` until the user says so.** Local edits only.
- **A live handoff artifact**, "Klew Build Status". It's a private claude.ai page published from the scratchpad, **never added to the repo**. It's written so the teammate's AI agent can study it and get up to speed on the codebase. Contents:
  - "Agent: start here": what to read and in what order
  - The architecture summary and diagram
  - A module map with status per file (done / in progress / todo)
  - How to run (HydraDB, MCP, API, web, eval)
  - Key decisions and HydraDB dialect gotchas we've hit
  - The task list split by person (A/B), with open questions
  - Known issues, plus a changelog
- I update it after every milestone (each completed module or eval result), republishing to the same URL.
- **An in-repo context file, `AGENTS.md`, at the repo root.** It **is** committed when the user pushes. Codex, Cursor, and others read `AGENTS.md` automatically; a one-line `CLAUDE.md` containing `@AGENTS.md` does the same for Claude Code. It mirrors the artifact in plain markdown:
  - Orientation and reading order
  - Architecture pointer (to `ARCHITECTURE.md`)
  - Module map with status
  - Run and test commands
  - Conventions and HydraDB gotchas
  - **Latest changes** (newest first, with dates)
  - **Next up / open tasks** by person
  - Known issues
- I update it in the same step as the artifact, so the two never drift apart.

## Sources
[Event](https://luma.com/bqwllms4) · [HydraDB](https://github.com/hydra-db/hydradb) · [USING-HYDRADB.md](https://github.com/hydra-db/hydradb/blob/main/USING-HYDRADB.md) · [Hack Hydra rubric](https://hackhydra.hydradb.com/) · [Seismic](https://github.com/himanshu748/seismic-hydradb) · [Hindsight](https://github.com/kgarg2468/hydradb-oss-hack) · [HydraClaim](https://github.com/aayushman-singh/hydraclaim) · [hydradb.com](https://hydradb.com)
