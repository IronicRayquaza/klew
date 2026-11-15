# AGENTS.md: Klew

Start here if you are an AI agent (or a human) joining this codebase. Keep this file current:
whoever finishes a module updates **Module map**, **Latest changes**, and **Next up** in the
same change.

## What this is

Klew is an MCP context server for coding agents, built on HydraDB for the HydraDB
Hackathon (Nov 14–16, 2026; deadline ~Nov 16 09:00 IST). It indexes a repo into a code graph
in HydraDB. Given a task, it walks that graph (bounded traversal, no vector search) and
returns a token-budgeted context pack with a "why" path for every item. After each run or
merged PR it learns which paths led to the files that actually changed, so the next pack is
sharper.

Judging: engineering + go-to-market. Hard rule: "it has to earn its place over a vector store."

## Hackathon rules (from the organizers, Nov 14)

- Build on **open-source HydraDB**, self-hosted (we do: `docker-compose.yml`).
- Judging is **50% technical / 50% go-to-market**.
  - Technical: right metrics; real continual-learning improvement over a clear baseline; the graph doing
    real work ("would this fall apart on a plain store?").
  - GTM: posts on X/LinkedIn tagging HydraDB, and showing demand.
- Submission:
  1. **hosted usable app (live link)**;
  2. **public OSS repo**;
  3. **Loom walkthrough**.
- **Deadline: 9 AM IST, Nov 16.**

Submission checklist: [ ] live deployment (API + HydraDB + site) · [ ] repo renamed `klew` and public ·
[x] graph ablation (walk off) in the eval · [x] continual-learning chart · [ ] Loom · [ ] X/LinkedIn posts.

## Reading order

1. This file.
2. `docs/PLAN.md`: full architecture, data model, flows, eval design, schedule, GTM.
3. `klew/schema.py`: labels, edge types, walk steps and priors.
4. `klew/ports.py`: the `GraphStore` interface everything depends on.
5. `klew/adapters/queries.py`: every Cypher statement, plus the HydraDB dialect rules.
6. `tests/test_store_contract.py`: what both stores guarantee.

## Run it

```bash
docker compose up -d                       # HydraDB (ghcr.io/hydra-db/hydradb:latest), plaintext dev
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9090/readyz   # expect 200
uv venv --python 3.12 .venv && uv pip install -e ".[dev,eval]"
.venv/bin/python -m pytest -q              # memory store only
KLEW_TEST_HYDRA=1 .venv/bin/python -m pytest -q   # also against live HydraDB
```

Env: `HYDRA_URI` (bolt://127.0.0.1:7687), `HYDRA_TOKEN` (local-development-token-32-bytes),
`HYDRA_GRAPH` (default), `KLEW_STORE` (hydra|memory). Compose pins `GRAPH_CYPHER_ENGINE=legacy`.

## Layout and module map

Status: ✅ done · 🟡 in progress · ⬜ todo

| Path | Layer | Status | Notes |
|---|---|---|---|
| `docker-compose.yml` | infra | ✅ | HydraDB node, named volume at /tmp/graph, telemetry off, legacy engine |
| `klew/config.py`, `ids.py`, `text.py` | core | ✅ | env settings · 52-bit ids · tokenizer (snake/camel split, stopwords, stemming) |
| `klew/schema.py` | core | ✅ | labels, edge types, `WALK_STEPS` (edge, direction, prior) |
| `klew/models.py` | core | ✅ | Pydantic: ContextPack, ContextItem, PathStep, LearnReport, GraphStats |
| `klew/ports.py` | core | ✅ | GraphStore protocol |
| `klew/adapters/queries.py` | adapter | ✅ | all Cypher |
| `klew/adapters/hydra_store.py` / `memory_store.py` | adapter | ✅ | both pass `tests/test_store_contract.py` |
| `klew/adapters/source_reader.py` | adapter | ✅ | tree-sitter: symbols, signatures, docstrings, body terms, calls, imports, bases |
| `klew/adapters/git_miner.py` | adapter | ✅ | commits (oldest first), co-change counts, detached worktrees |
| `klew/adapters/tokens.py` | adapter | ✅ | tiktoken cl100k, falls back to chars/4 |
| `klew/services/index.py` | app | ✅ | parse → static name resolution → nodes/edges → HydraDB; co-change from history |
| `klew/domain/bm25.py`, `seeder.py` | domain | ✅ | lexical seeds (names, docs, body terms, exact identifiers) + learned seeds (POINTS_TO) |
| `klew/domain/walker.py` | domain | ✅ | BFS-layered relevance propagation, 1-hop expansions in HydraDB, why-path back-pointers |
| `klew/domain/packer.py` | domain | ✅ | rank files (symbol credit → file), token-budgeted pack with signatures + snippets |
| `klew/domain/learning.py` | domain | ✅ | reinforce POINTS_TO toward touched files, decay served misses, reinforce CO_CHANGED |
| `klew/services/engine.py` | app | ✅ | RepoEngine: `get_context`, `record_outcome`; optional external (vector) seeds |
| `klew/runtime.py` | app | ✅ | composition root used by CLI/MCP/API |
| `klew/baselines/` | eval | ✅ | chunker, BM25 RAG, vector RAG (fastembed bge-small, local) |
| `klew/eval/replay.py` | eval | ✅ | git-history replay, 5 arms, metrics + curves → JSON |
| `klew/mcp_server.py` | interface | ✅ | MCP v2 `MCPServer`, stdio: get_context, record_outcome, explain, graph_stats |
| `klew/cli.py` | interface | ✅ | `index`, `context`, `learn-git`, `stats`, `eval`, `serve`, `mcp` |
| `klew/api.py` | interface | ✅ | FastAPI for the dashboard (context, outcome, runs, subgraph, eval) |
| `web/` | frontend | ✅ | Soft light redesign (PR #1). Overview (`#`), Playground (`#app`, full-screen graph), Evidence (`#results`), Docs (`#docs/<slug>`); falls back to `public/snapshot/` without the API; checked at 390px and 1280px, light and dark |
| `web/src/docs/*.md` | docs | ✅ | 12-page manual (quickstart, MCP, CLI, REST API, Action, library, concepts, architecture, evaluation, integrations/plans, FAQ). Examples are real recorded outputs; regenerate them if behaviour changes |
| `eval/results/` | eval | ✅ | final httpx + flask results (5 arms); charts in `docs/img/` |
| `action/`, `.github/workflows/` | product | ✅ | learn-on-merge Action, example workflow, CI (ruff, pytest, live HydraDB, web build); CI not yet run on GitHub |
| `scripts/` | tooling | ✅ | `tune.py` (held-in grid), `readme_results.py`, `snapshot_web.py`, `hero_snapshot.py` (landing hero packs) |
| `klew/eval/stats.py` | eval | ✅ | paired bootstrap CIs → `ci_held_out` |
| `Dockerfile.demo`, `deploy/demo-*.sh`, `render.yaml` | deploy | ✅ | single-container hosted demo (Render Free); see `docs/DEPLOY.md` |
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

- **2026-11-15 H19: UI redesign merged (PR #1 by B, `ui/klew-labyrinth`), with data fixes.**
  - New brand mark (`favicon.svg`, `Logo.tsx`, `packages/mcpb/icon.png`, social cards), soft light theme
    (`index.css`), Overview / full-screen graph Playground / Evidence (repo switcher, httpx first) / Docs.
  - Merge kept main's H18 work the PR predated: `ci_held_out` type + **Key comparisons** panel (CIs), demo-mode
    banner and slow-server button text in the Playground, plus the "How we test" timeline and metric glossary.
  - Landing hero (`LabyrinthHero.tsx`) now renders **real recorded packs** from `web/public/snapshot/hero.json`
    (`scripts/hero_snapshot.py`: clean httpx graph warm-started on 268 commits; each task answered with learning
    off vs on; vector RAG's top 3 for contrast). The PR's hand-drawn scenarios had invented tokens/weights/scores
    and contradicted real output (e.g. ReadTimeout's real #1 is `_exceptions.py`).
  - Removed hard-coded fallback numbers on the landing page (some were wrong, e.g. 2,175 / 3,742 tok); learning lift
    is now MRR (significant on every repo; in-context lift isn't on ODS); "80-line chunks" → 40 (the real window);
    "Blind-start tasks avoided" relabelled to what it counts; MRR shown as % like the docs; held-out count computed.
  - Playground: offline mode no longer relabels a recorded pack with the typed task or simulates learning
    (teach and budget need `klew serve`); no hard-coded stats; graph rank labels come from the pack order
    (files met mid-path were showing another file's rank); defaults to httpx, which the example tasks are for.
  - Deploy check (demo image under 512 MB / 0.1 CPU, `PORT=10000` like Render): ready in 9 s, ~177 MB, a query
    ~9–10 s. `/api/stats` was taking ~70 s per call there (full graph scan) and the Playground calls it on load,
    so the demo now caches it (`KLEW_STATS_TTL`, off by default) and warms it at start. Added `.dockerignore`.
- **2026-11-15 H18: confidence intervals, native MSpaths explain, hosted demo container.**
  - `klew/eval/stats.py`: paired bootstrap 95% CIs (2,000 resamples) for the key comparisons, stored as
    `ci_held_out` in every `eval/results/*.json` (`scripts/annotate_results.py`). Shown in the README ("Key
    comparisons") and on the Results page (Comparisons panel). They corrected our claims: see Known issues.
  - `explain` (MCP + `POST /api/explain`) now finds paths with native `algo.MSpaths` (`queries.ms_paths`,
    `GraphStore.key_paths`, memory-store BFS twin, contract test). Example: `BaseClient._get_proxy_map -CALLS->
    get_environment_proxies -CONTAINS-> httpx/_utils.py`. 29 tests pass against live HydraDB.
  - Hosted demo: `Dockerfile.demo` = one container (HydraDB on loopback + `klew serve` + built site), httpx and
    flask indexed and warm-started at build time. `deploy/demo-{env,build,start}.sh`, `render.yaml` (Render
    Free blueprint), `.github/workflows/keep-awake.yml` (pings `vars.KLEW_DEMO_URL` every 10 min),
    `docs/DEPLOY.md`. `/api/health` returns `demo: true`, and the dashboard then shows a slow-server banner.
  - Tested under Render Free limits (512 MB, 0.1 CPU): ready in ~6 s, ~160 MB RAM, ~8.5 s per query after the
    start-up warm-up (0.76 s at 0.5 CPU, 0.31 s at 1 CPU). The walk's ~25 HydraDB queries are CPU-bound.
- **2026-11-15 H17: distribution ready (not yet published).** See `docs/PUBLISHING.md`.
  - PyPI `klew` (wheel + 48 KB sdist; `pip install klew`), with new `klew hydra up/down/status` (local HydraDB in Docker).
  - npm `klew`: `packages/npm/bin/klew.js` launcher → `uvx --from klew==<ver> klew …` (falls back to pipx/klew; finds uv
    outside PATH for GUI apps). `KLEW_PY_SPEC` overrides the spec for local testing.
  - Claude Code plugin: `.claude-plugin/marketplace.json` + `plugins/klew` (MCP server + `klew` skill); passes `claude plugin validate`.
  - Claude Desktop extension: `packages/mcpb` (node type, same launcher, folder picker) → `dist/klew.mcpb`; schema-valid.
  - `scripts/build_release.sh` builds all; `scripts/check_versions.py` (also in CI) keeps the 5 version strings in sync.
  - Verified locally: clean-venv wheel install → index → context; MCP session via the npm launcher; launcher from the
    unpacked .mcpb with a minimal PATH. **Publish order: PyPI → npm → GitHub release (.mcpb); plugin needs the repo public.**
- **2026-11-15 H16: learning curves re-run with two-stage ranking, now including ODS.** Learning N past commits,
  then freezing: httpx top-1 45.2 → 50.2, MRR 57.0 → 63.0, r@5 55.7 → 64.3 (0 → 600); flask r@5 48.5 → 58.3, MRR
  49.4 → 55.0; ODS (unseen; 0 → 300) top-1 35.5 → 40.4, MRR 48.3 → 52.0. `eval/results/learning/*.json`, `docs/img/*-learning.png`.
- **2026-11-15 H15.5: ODS, a third and unseen repo (Osmantic/ODS: 1,381 files, 26k symbols, 82k edges).**
  Window of 200 commits, 166 scored, all held out (`--tuned-on 0`). Klew + vector seeds vs vector RAG: in-context
  71.9% vs 35.0%, r@5 48.3% vs 45.2%, top-1 45.8% vs 39.2%, MRR 57.2% vs 51.3%; tokens/hit ~2.7k vs 5.6k.
  Learning off → on: top-1 +7.9, MRR +6.9. Caveats: latency ~0.9 s; on ODS the walk costs context (without the walk
  in-context is 76.9% at half the tokens). Possible fix: scale the walk's budget share with repo size.
- **2026-11-15 H15: two-stage ranking; Klew now beats vector RAG on every quality metric (held-out, both repos).**
  - `EngineParams.head_k = 5`: the top 5 files come from direct evidence (seeds, learned links, text fusion; no
    walk; zero extra queries), and the walk fills the rest. Tuned on httpx's first 100 commits.
  - Held-out httpx: Klew + vector seeds top-1 56.8% vs 47.2%, MRR 68.8% vs 62.2%, r@5 67.3% vs 63.9%,
    in-context 95.3% vs 58.1%. Klew alone also beats vector everywhere (top-1 50.7%).
  - Held-out flask: hybrid top-1 46.4% vs 36.7%, MRR 58.4% vs 49.1%.
  - Results page: a "How we test, in plain words" explainer with a dated tuning/held-out timeline (`slices` in the results JSON).
  - X cards in `docs/social/` (`scripts/social_card.py`, rendered from the results).
  - Learning curves re-run with two-stage (H16), see below.
- **2026-11-14 H13: held-out reporting, graph ablation, learning curve, rank fusion.**
  - Tuning now uses the first 100 commits; every result has `summary_held_out` (the rest). Runs are deterministic.
  - Rank fusion with a text ranker (BM25, or vector in the hybrid): k=20, weight 0.5, keep the graph's #1.
  - Fixed: a crash when graph edges briefly point at deleted files (index lag). The engine ignores unknown files.
  - **Held-out results** (httpx 199 / flask 196 commits):

    | | httpx in-ctx | r@5 | top-1 | MRR | flask in-ctx | r@5 | top-1 | MRR |
    |---|---|---|---|---|---|---|---|---|
    | Vector RAG | 58.1 | 63.9 | **47.2** | **62.2** | 45.1 | 48.8 | 36.7 | 49.1 |
    | Klew, learning off | 83.4 | 58.4 | 40.2 | 55.2 | 84.7 | 51.9 | 34.7 | 48.2 |
    | Klew without traversal (ablation) | 87.6 | 65.5 | 49.2 | 62.8 | 84.1 | 60.0 | 44.4 | 56.8 |
    | Klew | 89.5 | 60.8 | 40.7 | 56.5 | 89.5 | 58.6 | 37.2 | 52.7 |
    | Klew + vector seeds | **95.2** | **67.6** | 43.7 | 60.7 | **90.9** | 59.6 | 43.4 | 56.6 |

  - **Learning curve** (`scripts/learning_curve.py`: learn N past commits, freeze, measure held-out): httpx
    in-context 82.1 → 89.1, r@5 57.1 → 62.0, MRR 55.5 → 58.1 (N = 0 → 600); flask r@5 52.4 → 55.3, MRR
    48.5 → 51.8. Charts: `docs/img/*-learning.png` and the Results page panel.
  - **Ablation finding:** the walk adds coverage (+1.9 httpx / +5.4 flask in-context) but hurts the head of the
    ranking (httpx top-1 40.7 with walk vs 49.2 without). **Next:** two-stage ranking, where direct and learned
    evidence picks the head and the walk fills the rest.
  - Landing stats now use held-out commits (90% vs 58%, 1.7×, +6 pts).
- **2026-11-14 H11: renamed to Klew, faster walk, opt-in token cutoff.**
  - **Name:** Desirepath → **Klew** (Ariadne's *clew*, the thread through the labyrinth; origin of "clue").
    Package and CLI `klew`, MCP server `klew`, env vars `KLEW_*`, graph labels `Klew*`, container
    `klew-hydradb`, state dir `.klew`, repo `IronicRayquaza/klew`. `klew` and `klew-ai` are free on PyPI and
    npm, but not registered yet.
  - **Faster walk:** each hop's expansions run in parallel (one Bolt session per thread). The same results, request
    p50 ~540 → ~200–300 ms on httpx. Eval p50 for the learning arms (which includes the learning write) dropped from ~490 to ~375 ms.
  - **Rejected:** protecting the top 5 from companions (recall@5 −3 pts on held-in).
  - **Opt-in `cutoff`** (CLI `--cutoff`, MCP/API `cutoff`): stops packing below a fraction of the top score.
    Held-in: 0.05 → −10% tokens / −2.7 pts in-context; 0.1 → −33% / −10 pts. Default stays "fill the budget".
  - Results re-run and promoted (quality identical, latency lower). The replay now times the request only.
- **2026-11-14 H10: budget filling, companions, warm start.** Tuned on the held-in slice, then fully re-run and promoted.
  - `EngineParams.max_items` 12 → 30: packs now use the budget (median ~2,000 of 2,000 tokens; before, ~1,150).
  - `companion_weight` 0.4: each of the top 3 files pulls in its test file (by name) and its strongest
    co-change partner; why-path steps `tested in` / `changes with`.
  - Warm start: `klew index` learns from the last 300 commits (`--learn-history`, `services/engine.py::warm_start`).
    httpx: "learned from 268 past commits" in ~2 min. Eval: `--warm 300` (history strictly before the window).

    | | httpx in-ctx | flask in-ctx | httpx r@5 / top-1 | flask r@5 / top-1 | tok/hit httpx | p50 |
    |---|---|---|---|---|---|---|
    | Vector RAG | 59.3% | 49.0% | 63.7% / 50.5% | 52.8% / 40.2% | 3,328 | ~15 ms |
    | Klew | 88.8% | 88.3% | 58.9% / 48.5% | 59.0% / 40.9% | 2,014 | ~460 ms |
    | Klew + vector seeds | **94.2%** | **93.3%** | **64.1% / 51.2%** | **66.6% / 45.6%** | 2,021 | ~490 ms |

  - Costs: tokens per correct file rose (we now use the budget; still well under vector), and latency is
    ~0.5 s (more learned links + 1 companion query). The faster walk is the fix.
  - The demo graphs `httpx` and `flask` are warm-started. Landing hero = real fresh-install output. Docs updated.
- **2026-11-14 H9.5: hub damping + docs site.** (results superseded by H10)
  - Ranking divides file scores by `(1 + ln(1 + symbols))^0.5` (`EngineParams.hub_damping`, tuned on the
    held-in slice). Final results were re-run and promoted:

    | | httpx in-ctx | flask in-ctx | httpx r@5 / top-1 | flask r@5 / top-1 | tok/hit httpx |
    |---|---|---|---|---|---|
    | Vector RAG | 59.3% | 49.0% | 63.7% / 50.5% | 52.8% / 40.2% | 3,328 |
    | Klew | 77.3% | 76.6% | 57.2% / 48.1% | 58.5% / 38.2% | 1,483 |
    | Klew + vector seeds | **83.2%** | **83.9%** | **64.9% / 52.5%** | **63.9% / 44.3%** | 1,474 |

  - (Corrected at H11) The hybrid is ahead of vector RAG on ranking on flask and level on httpx (MRR 0.3
    lower); it wins clearly on right-file-in-context and tokens on both. It's slower.
    Learning alone: +7.6 pts (httpx), +6.4 pts (flask).
  - New Docs section in the web app (`web/src/pages/Docs.tsx` + Markdown). "Read the docs" link on the landing page.
  - `/api/repos` hides eval-internal graphs. `eval --arms` defaults to all five arms. The demo graph `flask` is indexed.
- **2026-11-14 H9**: First push to https://github.com/IronicRayquaza/klew (private for now). CI is green on
  GitHub, including the live-HydraDB contract tests (23 passed).
- **2026-11-14 H8.5: first final evals** (superseded by H9.5's re-run with hub damping; numbers below are history). Default `hops=2` (held-in grid on the first 50 httpx commits).

  | | httpx in-context | flask in-context | tokens/hit (httpx) | recall@5 httpx / flask |
  |---|---|---|---|---|
  | Vector RAG | 59.3% | 49.0% | 3,328 | 63.7% / 52.8% |
  | Klew | 76.1% | 75.9% | 1,581 | 56.8% / 56.0% |
  | Klew + vector seeds | **82.4%** | **83.3%** | 1,587 | 60.6% / **59.1%** |

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

- **B (teammate): UI pass on `web/` ✅ merged (H19).** Rule stands: every number on a page comes from
  `eval/results/*.json` or a recorded snapshot (`scripts/snapshot_web.py`, `scripts/hero_snapshot.py`); never
  hand-write results or example outputs. Check 390px and 1280px in both themes.
- **Owner: go live on Render.** Push, then Render → New → Blueprint → `IronicRayquaza/klew` (uses
  `render.yaml`). Once live, set the repo Actions variable `KLEW_DEMO_URL` so keep-awake pings it.
- **Everyone:** make the repo public before submitting; record the Loom (`docs/VIDEO.md`, update numbers to
  H15/H16 + CIs); publish packages (`docs/PUBLISHING.md`); X/LinkedIn posts tagging HydraDB.
- **A:** relevance cutoff (stop packing when score < x% of top; tune held-in), budget sweep chart
  (500–4,000 tokens, vector vs Klew), budget presets
  (Lean 1k / Balanced 2k / Deep 4k). Optional: TypeScript parsing, a third eval repo.

## Known issues / open questions

- The Luma page doesn't list submission requirements. Confirm on Discord.
- **Claims to make (held-out, three repos, paired 95% bootstrap CIs in `ci_held_out`):**
  - Right file in context 72–95% vs 35–58%, +31 to +47 pts vs vector RAG, significant on every repo, about half
    the tokens per correct file.
  - Learning significantly improves recall@5, top-1 and MRR on all three repos.
  - Ranking vs vector RAG: with vector seeds, significant on httpx and flask (httpx top-1 +9.5 [+2.5, +16.6]); on
    ODS only MRR. Without vector seeds: level on httpx and ODS.
  - Slower: ~0.3 s (httpx) to ~0.9 s (ODS) vs ~15–45 ms. On ODS the walk costs some context.
  - **Don't claim "beats vector on every metric".**
- The demo `httpx` graph has a few learned outcomes from testing (e.g. 'cidr' → `_utils.py`). The landing hero
  shows that output and says so. Re-index for a clean graph.
- `algo.MSpaths` needs string `sourceValues`, and our ids are ints. Not used; the walker uses 1-hop expansion.

## How to evaluate

```bash
.venv/bin/klew eval .vendor/eval-repos/httpx --name httpx --window 300   # ~6 min on an M-series laptop
# arms: vector,bm25,graph_static,graph_learn,graph_hybrid → eval/results/httpx.json
```
Clone eval repos into `.vendor/eval-repos/` (gitignored), with full history.
